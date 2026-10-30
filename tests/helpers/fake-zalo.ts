import { EventEmitter } from "node:events";
import { vi } from "vitest";
import { LoginQRCallbackEventType, ThreadType, type API, type Credentials, type LoginQRCallback } from "zca-js";
import type { ZaloClient } from "@/lib/zalo/service";

/**
 * Bản giả của zca-js: không mở kết nối mạng nào.
 * Test điều khiển bằng cách emit sự kiện trên `listener` giống hệt Zalo thật.
 */
export class FakeListener extends EventEmitter {
  started = false;
  stopped = false;
  oldMessageRequests: Array<{ type: ThreadType; lastMsgId: string | null | undefined }> = [];

  start() {
    this.started = true;
    queueMicrotask(() => this.emit("connected"));
  }
  stop() {
    this.stopped = true;
  }
  requestOldMessages(type: ThreadType, lastMsgId?: string | null) {
    this.oldMessageRequests.push({ type, lastMsgId });
  }
}

export type FakeGroup = { id: string; name: string };

export function createFakeApi(groups: FakeGroup[] = [], ownId = "bot-1") {
  const listener = new FakeListener();
  const api = {
    listener,
    getOwnId: () => ownId,
    getAllGroups: vi.fn(async () => ({
      version: "1",
      gridVerMap: Object.fromEntries(groups.map((g) => [g.id, "1"])),
    })),
    getGroupInfo: vi.fn(async (ids: string | string[]) => {
      const wanted = new Set(Array.isArray(ids) ? ids : [ids]);
      return {
        removedsGroup: [],
        unchangedsGroup: [],
        gridInfoMap: Object.fromEntries(
          groups.filter((g) => wanted.has(g.id)).map((g) => [g.id, { name: g.name, avt: `https://avatar/${g.id}` }]),
        ),
      };
    }),
    getCookie: () => ({ toJSON: () => ({ cookies: [{ key: "zpw_sek", value: "refreshed" }] }) }),
  };
  return { api: api as unknown as API, listener, raw: api };
}

export type FakeZaloOptions = {
  /** Hành vi của loginQR: "success" (mặc định), "expire" hoặc "decline". */
  qr?: "success" | "expire" | "decline";
  /** Nếu true, login bằng cookie đã lưu sẽ thất bại. */
  loginFails?: boolean;
};

export function createFakeZalo(api: API, options: FakeZaloOptions = {}) {
  const actions = { saveToFile: vi.fn(), retry: vi.fn(), abort: vi.fn() };
  const client = {
    login: vi.fn(async (_creds: Credentials) => {
      if (options.loginFails) throw new Error("cookie hết hạn");
      return api;
    }),
    loginQR: vi.fn(async (_opts: unknown, cb?: LoginQRCallback) => {
      const emit = cb as (e: unknown) => unknown;
      emit({
        type: LoginQRCallbackEventType.QRCodeGenerated,
        data: { code: "c", image: "QRBASE64", options: { enabledCheckOCR: false, enabledMultiLayer: false }, token: "t" },
        actions,
      });
      if (options.qr === "expire") {
        emit({ type: LoginQRCallbackEventType.QRCodeExpired, data: null, actions });
        throw new Error("QR expired");
      }
      if (options.qr === "decline") {
        emit({ type: LoginQRCallbackEventType.QRCodeDeclined, data: { code: "c" }, actions });
        throw new Error("declined");
      }
      emit({ type: LoginQRCallbackEventType.QRCodeScanned, data: { avatar: "", display_name: "Bot Thư Ký" }, actions });
      await emit({
        type: LoginQRCallbackEventType.GotLoginInfo,
        data: { cookie: [{ key: "zpw_sek", value: "initial" }], imei: "imei-123", userAgent: "UA-test" },
        actions: null,
      });
      return api;
    }),
  };
  return client as typeof client & ZaloClient;
}

/** Tạo tin nhắn nhóm theo đúng hình dạng zca-js trả về. */
export function groupMessage(
  threadId: string,
  data: { msgId: string; text?: string; content?: unknown; msgType?: string; dName?: string; ts?: number; quote?: unknown },
) {
  return {
    type: ThreadType.Group,
    threadId,
    isSelf: false,
    data: {
      msgId: data.msgId,
      uidFrom: "u-" + (data.dName ?? "x"),
      dName: data.dName ?? "Người gửi",
      ts: String(data.ts ?? Date.now()),
      msgType: data.msgType ?? "webchat",
      content: data.content ?? data.text ?? "",
      quote: data.quote,
    },
  };
}

export function userMessage(threadId: string, text: string) {
  return {
    type: ThreadType.User,
    threadId,
    isSelf: false,
    data: { msgId: "dm-" + text, uidFrom: threadId, dName: "Bạn bè", ts: String(Date.now()), msgType: "webchat", content: text },
  };
}

