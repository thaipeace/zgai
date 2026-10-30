import { randomUUID } from "node:crypto";
import {
  CloseReason,
  LoginQRCallbackEventType,
  ThreadType,
  Zalo,
  type API,
  type Credentials,
  type GroupMessage,
  type Message,
  type TGroupMessage,
} from "zca-js";
import { decrypt, encrypt } from "../crypto";
import { kvDelete, kvGet, kvSet, run } from "../db";
import { insertMessage, isGroupEnabled, markRecalled, upsertGroup, type MessageKind } from "../messages";

export type ZaloStatus =
  | "idle"
  | "logged_out"
  | "waiting_lease"
  | "connecting"
  | "qr"
  | "qr_scanned"
  | "qr_expired"
  | "connected"
  | "disconnected"
  | "kicked"
  | "error";

export type ZaloState = {
  status: ZaloStatus;
  hasSavedSession: boolean;
  qrImage?: string;
  account?: { id: string; name?: string };
  lastError?: string;
  connectedAt?: number;
  lastMessageAt?: number;
  receivedSinceStart: number;
  instanceId: string;
};

const CREDENTIALS_KEY = "zalo_credentials";
const LEASE_KEY = "zalo_lease";
/**
 * Khóa nội bộ trong DB (chỉ giao tiếp giữa server và Turso, KHÔNG gọi sang Zalo).
 * Vì đã tách rời deploy khỏi kết nối tự động (người dùng bấm nút kích hoạt thủ công),
 * chu kỳ gia hạn khóa được đặt thưa (3 phút, TTL 10 phút) chỉ để phòng trường hợp
 * vô tình bật kết nối ở cả máy Local lẫn trên Render cùng lúc.
 */
const DEFAULT_LEASE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_LEASE_HEARTBEAT_MS = 3 * 60 * 1000;
const COOKIE_REFRESH_MS = 6 * 60 * 60 * 1000;

/** Phần của `Zalo` mà service dùng — cho phép thay bằng bản giả trong test. */
export type ZaloClient = Pick<Zalo, "login" | "loginQR">;

export type ZaloServiceOptions = {
  createClient?: () => ZaloClient;
  /** Chu kỳ thử lại khi instance khác đang giữ lease. */
  leasePollMs?: number;
  /** Thời gian sống của khóa lease nội bộ trong DB. */
  leaseTtlMs?: number;
  /** Chu kỳ gia hạn khóa lease nội bộ trong DB. */
  leaseHeartbeatMs?: number;
};

/**
 * Giữ MỘT kết nối Zalo (chế độ chỉ đọc) cho toàn bộ tiến trình.
 * - Không bao giờ gửi tin, kết bạn hay thao tác gì lên Zalo ngoài việc nhận tin.
 * - Dùng "lease" trong DB để khi Render deploy (2 instance chạy chồng nhau vài giây)
 *   chỉ một instance được kết nối, tránh Zalo đá phiên vì trùng kết nối.
 */
export class ZaloService {
  readonly state: ZaloState = {
    status: "idle",
    hasSavedSession: false,
    receivedSinceStart: 0,
    instanceId: randomUUID(),
  };
  private api?: API;
  private leaseTimer?: NodeJS.Timeout;
  private cookieTimer?: NodeJS.Timeout;
  private stopping = false;
  private knownGroups = new Set<string>();
  private readonly clientFactory: () => ZaloClient;
  private readonly leasePollMs: number;
  private readonly leaseTtlMs: number;
  private readonly leaseHeartbeatMs: number;

  constructor(options: ZaloServiceOptions = {}) {
    this.clientFactory =
      options.createClient ?? (() => new Zalo({ selfListen: false, checkUpdate: false, logging: false }));
    this.leasePollMs = options.leasePollMs ?? 10_000;
    this.leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    this.leaseHeartbeatMs = options.leaseHeartbeatMs ?? DEFAULT_LEASE_HEARTBEAT_MS;
  }

  // ---------- Vòng đời ----------

  /**
   * Kiểm tra phiên đã lưu trong DB khi server khởi động nhưng KHÔNG tự gọi Zalo.
   * Giúp tách biệt việc deploy/restart server với việc kết nối Zalo, tránh bị khóa nick khi deploy nhiều lần.
   */
  async init(): Promise<void> {
    if (["connecting", "connected", "qr", "qr_scanned", "waiting_lease"].includes(this.state.status)) return;
    const creds = await this.loadCredentials();
    if (creds) {
      this.state.hasSavedSession = true;
      this.setStatus("idle");
    } else if (this.state.status !== "error") {
      this.state.hasSavedSession = false;
      this.setStatus("logged_out");
    }
  }

  /** Chủ động kích hoạt kết nối Zalo bằng phiên đã lưu. */
  async start(): Promise<void> {
    if (["connecting", "connected", "qr", "qr_scanned", "waiting_lease"].includes(this.state.status)) return;
    this.stopping = false;
    const creds = await this.loadCredentials();
    if (!creds) {
      this.state.hasSavedSession = false;
      if (this.state.status !== "error") this.setStatus("logged_out");
      return;
    }
    this.state.hasSavedSession = true;
    this.setStatus("waiting_lease");
    while (!(await this.tryAcquireLease())) {
      if (this.stopping) return;
      await sleep(this.leasePollMs);
    }
    await this.loginWithCredentials(creds);
  }

  async startQrLogin(): Promise<void> {
    if (["connected", "qr", "qr_scanned", "connecting"].includes(this.state.status)) return;
    if (!(await this.tryAcquireLease())) {
      throw new Error("Instance khác đang giữ kết nối Zalo (có thể đang deploy). Thử lại sau 1 phút.");
    }
    this.stopping = false;
    this.state.qrImage = undefined;
    this.setStatus("qr");

    const zalo = this.createClient();
    zalo
      .loginQR({}, async (event) => {
        switch (event.type) {
          case LoginQRCallbackEventType.QRCodeGenerated:
            this.state.qrImage = event.data.image.startsWith("data:")
              ? event.data.image
              : `data:image/png;base64,${event.data.image}`;
            this.setStatus("qr");
            break;
          case LoginQRCallbackEventType.QRCodeExpired:
            this.state.qrImage = undefined;
            this.setStatus("qr_expired");
            event.actions.abort();
            break;
          case LoginQRCallbackEventType.QRCodeScanned:
            this.state.account = { id: "", name: event.data.display_name };
            this.setStatus("qr_scanned");
            break;
          case LoginQRCallbackEventType.QRCodeDeclined:
            this.state.qrImage = undefined;
            this.setStatus("error", "Đã từ chối đăng nhập trên điện thoại");
            break;
          case LoginQRCallbackEventType.GotLoginInfo:
            await this.saveCredentials({
              imei: event.data.imei,
              cookie: event.data.cookie,
              userAgent: event.data.userAgent,
            });
            break;
        }
      })
      .then((api) => {
        this.state.qrImage = undefined;
        return this.attach(api);
      })
      .catch((err) => {
        this.state.qrImage = undefined;
        if (this.state.status !== "qr_expired") this.setStatus("error", errorMessage(err));
      });
  }

  /** Dừng kết nối (tạm dừng chủ động hoặc khi tắt server). Lưu lại cookie mới nhất, giữ nguyên phiên và nhả lease. */
  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.leaseTimer);
    clearInterval(this.cookieTimer);
    if (this.api) {
      await this.persistFreshCookies().catch(() => {});
      try {
        this.api.listener.stop();
      } catch {
        /* bỏ qua */
      }
      this.api = undefined;
    }
    await this.releaseLease().catch(() => {});
    this.setStatus(this.state.hasSavedSession ? "idle" : "logged_out");
  }

  /** Quên phiên đăng nhập (lần sau phải quét QR lại). */
  async logout(): Promise<void> {
    await this.stop();
    await kvDelete(CREDENTIALS_KEY);
    this.state.hasSavedSession = false;
    this.state.account = undefined;
    this.setStatus("logged_out");
  }

  async reconnect(): Promise<void> {
    await this.stop();
    void this.start();
  }

  // ---------- Kết nối ----------

  private createClient(): ZaloClient {
    return this.clientFactory();
  }

  private async loginWithCredentials(creds: Credentials): Promise<void> {
    this.setStatus("connecting");
    try {
      const api = await this.createClient().login(creds);
      await this.attach(api);
    } catch (err) {
      this.setStatus("error", `Đăng nhập bằng phiên đã lưu thất bại: ${errorMessage(err)}. Hãy quét QR lại.`);
      await this.releaseLease().catch(() => {});
    }
  }

  private async attach(api: API): Promise<void> {
    this.api = api;
    this.state.account = { id: api.getOwnId(), name: this.state.account?.name };
    const listener = api.listener;

    listener.on("connected", () => {
      this.state.connectedAt = Date.now();
      this.setStatus("connected");
      // Xin lại các tin nhóm gần đây mà Zalo còn giữ (bù khoảng mất kết nối ngắn).
      try {
        listener.requestOldMessages(ThreadType.Group, null);
      } catch {
        /* không bắt buộc */
      }
      void this.syncGroups();
    });

    listener.on("message", (msg: Message) => {
      if (msg.type === ThreadType.Group) void this.handleGroupMessage(msg);
    });

    listener.on("old_messages", (msgs, type) => {
      if (type !== ThreadType.Group) return;
      for (const m of msgs) if (m.type === ThreadType.Group) void this.handleGroupMessage(m);
    });

    listener.on("undo", (undo) => {
      if (undo.isGroup) void markRecalled(String(undo.data.content.globalMsgId)).catch(logError);
    });

    listener.on("closed", (code, reason) => {
      if (this.stopping) return;
      if (code === CloseReason.DuplicateConnection || code === CloseReason.KickConnection) {
        this.setStatus(
          "kicked",
          "Zalo đã ngắt phiên này (nick bot có thể vừa mở Zalo Web/PC ở nơi khác). Bấm 'Kết nối lại' khi đã đóng nơi kia.",
        );
      } else {
        this.setStatus("disconnected", `Mất kết nối (${code}) ${reason || ""}`.trim());
      }
    });

    listener.on("error", (err) => logError(err));

    listener.start({ retryOnClose: true });

    clearInterval(this.cookieTimer);
    this.cookieTimer = setInterval(() => void this.persistFreshCookies().catch(logError), COOKIE_REFRESH_MS);
  }

  // ---------- Xử lý tin nhắn ----------

  private async handleGroupMessage(msg: GroupMessage): Promise<void> {
    try {
      const groupId = msg.threadId;
      if (!this.knownGroups.has(groupId)) {
        this.knownGroups.add(groupId);
        await upsertGroup(groupId);
        void this.refreshGroupNames([groupId]);
      }
      if (!(await isGroupEnabled(groupId))) return;

      const d = msg.data;
      const { kind, text } = normalizeContent(d);
      const inserted = await insertMessage({
        id: String(d.msgId),
        group_id: groupId,
        sender_id: d.uidFrom ?? null,
        sender_name: d.dName ?? "",
        ts: Number(d.ts) || Date.now(),
        kind,
        text,
        quote_sender: d.quote?.fromD ?? null,
        quote_text: d.quote ? quoteText(d.quote.msg, d.quote.attach) : null,
        source: "zalo",
      });
      if (inserted) {
        this.state.receivedSinceStart++;
        this.state.lastMessageAt = Date.now();
      }
    } catch (err) {
      logError(err);
    }
  }

  async syncGroups(): Promise<number> {
    if (!this.api) return 0;
    const all = await this.api.getAllGroups();
    const ids = Object.keys(all.gridVerMap ?? {});
    for (const id of ids) {
      this.knownGroups.add(id);
      await upsertGroup(id);
    }
    await this.refreshGroupNames(ids);
    return ids.length;
  }

  private async refreshGroupNames(ids: string[]): Promise<void> {
    if (!this.api || ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 50) {
      try {
        const info = await this.api.getGroupInfo(ids.slice(i, i + 50));
        for (const [id, g] of Object.entries(info.gridInfoMap ?? {})) {
          await upsertGroup(id, g.name, g.avt);
        }
      } catch (err) {
        logError(err);
      }
    }
  }

  // ---------- Lưu phiên đăng nhập ----------

  private async loadCredentials(): Promise<Credentials | null> {
    const raw = await kvGet(CREDENTIALS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(decrypt(raw)) as Credentials;
    } catch {
      this.setStatus("error", "Không giải mã được phiên Zalo đã lưu (SESSION_SECRET đã đổi?). Hãy quét QR lại.");
      return null;
    }
  }

  private async saveCredentials(creds: Credentials): Promise<void> {
    await kvSet(CREDENTIALS_KEY, encrypt(JSON.stringify(creds)));
    this.state.hasSavedSession = true;
  }

  /** Cookie Zalo được làm mới trong lúc chạy; lưu lại để lần khởi động sau không phải quét QR. */
  private async persistFreshCookies(): Promise<void> {
    if (!this.api) return;
    const current = await this.loadCredentials();
    if (!current) return;
    const jar = this.api.getCookie().toJSON();
    if (jar?.cookies?.length) await this.saveCredentials({ ...current, cookie: jar.cookies });
  }

  // ---------- Lease giữa các instance ----------

  private async tryAcquireLease(): Promise<boolean> {
    const now = Date.now();
    const value = JSON.stringify({ owner: this.state.instanceId, expires: now + this.leaseTtlMs });
    await run("INSERT OR IGNORE INTO kv (key, value, updated_at) VALUES (?, ?, ?)", [
      LEASE_KEY,
      JSON.stringify({ owner: "", expires: 0 }),
      now,
    ]);
    const changed = await run(
      `UPDATE kv SET value = ?, updated_at = ?
        WHERE key = ? AND (json_extract(value, '$.owner') = ? OR json_extract(value, '$.expires') < ?)`,
      [value, now, LEASE_KEY, this.state.instanceId, now],
    );
    if (changed === 0) return false;
    clearInterval(this.leaseTimer);
    this.leaseTimer = setInterval(async () => {
      try {
        if (!(await this.tryAcquireLease())) {
          logError(new Error("Mất lease Zalo cho instance khác, dừng kết nối ở instance này"));
          await this.stop();
        }
      } catch (err) {
        logError(err);
      }
    }, this.leaseHeartbeatMs);
    return true;
  }

  private async releaseLease(): Promise<void> {
    await run(
      `UPDATE kv SET value = ?, updated_at = ? WHERE key = ? AND json_extract(value, '$.owner') = ?`,
      [JSON.stringify({ owner: "", expires: 0 }), Date.now(), LEASE_KEY, this.state.instanceId],
    );
  }

  private setStatus(status: ZaloStatus, error?: string) {
    this.state.status = status;
    this.state.lastError = error;
    if (error) console.warn(`[zalo] ${status}: ${error}`);
    else console.log(`[zalo] ${status}`);
  }
}

// ---------- Tiện ích ----------

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function normalizeContent(d: TGroupMessage): { kind: MessageKind; text: string } {
  const type = (d.msgType || "").toLowerCase();
  if (typeof d.content === "string") {
    return { kind: type.includes("sticker") ? "sticker" : "text", text: d.content };
  }
  const c = (d.content ?? {}) as Record<string, unknown>;
  const title = str(c.title).slice(0, 300);
  const href = str(c.href);
  const label = (name: string) => (title ? `[${name}: ${title}]` : `[${name}]`);

  if (type.includes("sticker")) return { kind: "sticker", text: "[Sticker]" };
  if (type.includes("photo") || type.includes("gif") || type.includes("doodle")) return { kind: "photo", text: label("Ảnh") };
  if (type.includes("voice")) return { kind: "voice", text: "[Tin nhắn thoại]" };
  if (type.includes("video")) return { kind: "video", text: label("Video") };
  if (type.includes("file")) return { kind: "file", text: label("File") };
  if (type.includes("link") || type.includes("recommend")) {
    return { kind: "link", text: `[Link${title ? `: ${title}` : ""}${href ? ` ${href}` : ""}]` };
  }
  return { kind: "other", text: label(type || "Nội dung khác") };
}

function quoteText(msg: unknown, attach: unknown): string {
  const m = str(msg);
  if (m) return m.slice(0, 500);
  return str(attach) ? "[tệp đính kèm]" : "";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function logError(err: unknown) {
  console.error("[zalo]", err);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Singleton dùng chung giữa custom server và các route handler của Next.
const g = globalThis as unknown as { __zaloService?: ZaloService };
export function getZaloService(): ZaloService {
  g.__zaloService ??= new ZaloService();
  return g.__zaloService;
}

