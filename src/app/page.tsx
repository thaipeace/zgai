"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, formatDateTime } from "@/components/client-api";
import type { ZaloState } from "@/lib/zalo/service";

type Group = {
  id: string;
  name: string;
  avatar: string | null;
  enabled: number;
  message_count: number;
  last_ts: number | null;
};

const STATUS_TEXT: Record<ZaloState["status"], { text: string; dot: string }> = {
  idle: { text: "Đang tạm dừng (chờ kích hoạt thủ công)", dot: "bg-slate-400" },
  logged_out: { text: "Chưa đăng nhập nick bot", dot: "bg-slate-400" },
  waiting_lease: { text: "Đang chờ instance cũ nhả kết nối...", dot: "bg-amber-400" },
  connecting: { text: "Đang kết nối...", dot: "bg-amber-400" },
  qr: { text: "Quét mã QR bằng Zalo của nick bot", dot: "bg-amber-400" },
  qr_scanned: { text: "Đã quét, xác nhận trên điện thoại...", dot: "bg-amber-400" },
  qr_expired: { text: "Mã QR hết hạn", dot: "bg-red-500" },
  connected: { text: "Đang lắng nghe", dot: "bg-emerald-500" },
  disconnected: { text: "Mất kết nối (đang thử lại)", dot: "bg-amber-500" },
  kicked: { text: "Bị Zalo ngắt phiên", dot: "bg-red-500" },
  error: { text: "Lỗi", dot: "bg-red-500" },
};

function BotCard({ state, onAction, busy }: { state: ZaloState; onAction: (a: string) => void; busy: boolean }) {
  const s = STATUS_TEXT[state.status];
  const canConnectSaved = state.status === "idle" && state.hasSavedSession;
  const needsQr =
    state.status === "logged_out" ||
    state.status === "qr_expired" ||
    state.status === "error" ||
    (state.status === "idle" && !state.hasSavedSession);
  const isActiveOrConnecting = ["connected", "connecting", "waiting_lease", "disconnected"].includes(state.status);

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">🤖 Nick bot Zalo</h2>
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
            {s.text}
            {state.account?.name ? ` · ${state.account.name}` : ""}
          </p>
        </div>
        {state.status === "connected" && (
          <div className="text-right text-xs text-slate-500">
            <div>+{state.receivedSinceStart} tin từ lúc khởi động</div>
            {state.lastMessageAt && <div>Tin gần nhất {formatDateTime(state.lastMessageAt)}</div>}
          </div>
        )}
      </div>

      {canConnectSaved && (
        <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
          Đã có phiên đăng nhập lưu sẵn. Để tránh Zalo quét bất thường khi deploy/khởi động lại, hệ thống không tự kết
          nối — hãy bấm <b>Kích hoạt kết nối Zalo</b> khi bạn sẵn sàng thu thập tin nhắn.
        </p>
      )}

      {state.lastError && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{state.lastError}</p>}

      {state.qrImage && (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qrImage} alt="QR đăng nhập Zalo" className="h-56 w-56 rounded-xl border" />
          <p className="text-center text-xs text-slate-500">
            Mở Zalo trên điện thoại của <b>nick bot</b> → biểu tượng QR → quét mã này.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canConnectSaved && (
          <button className="btn-primary" disabled={busy} onClick={() => onAction("connect")}>
            Kích hoạt kết nối Zalo
          </button>
        )}
        {needsQr && (
          <button className="btn-primary" disabled={busy} onClick={() => onAction("qr")}>
            Đăng nhập bằng QR
          </button>
        )}
        {["kicked", "disconnected", "error"].includes(state.status) && state.hasSavedSession && (
          <button className="btn-ghost" disabled={busy} onClick={() => onAction("reconnect")}>
            Kết nối lại
          </button>
        )}
        {state.status === "connected" && (
          <button className="btn-ghost" disabled={busy} onClick={() => onAction("sync_groups")}>
            Đồng bộ danh sách nhóm
          </button>
        )}
        {isActiveOrConnecting && (
          <button className="btn-ghost" disabled={busy} onClick={() => onAction("disconnect")}>
            Tạm dừng kết nối
          </button>
        )}
        {(state.hasSavedSession || state.status !== "logged_out") && (
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => confirm("Đăng xuất nick bot và xóa phiên đã lưu? Lần sau phải quét QR lại.") && onAction("logout")}
          >
            Đăng xuất bot
          </button>
        )}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [state, setState] = useState<ZaloState | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([api<ZaloState>("/api/zalo"), api<Group[]>("/api/groups")]);
      setState(s);
      setGroups(g);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Khi đang chờ quét QR thì hỏi trạng thái thường xuyên hơn.
  const fast = state && ["qr", "qr_scanned", "connecting", "waiting_lease"].includes(state.status);
  useEffect(() => {
    const t = setInterval(load, fast ? 2000 : 15000);
    return () => clearInterval(t);
  }, [load, fast]);

  async function action(a: string) {
    setBusy(true);
    setError("");
    try {
      setState(await api<ZaloState>("/api/zalo", { method: "POST", body: { action: a } }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(g: Group) {
    await api(`/api/groups/${g.id}`, { method: "PATCH", body: { enabled: !g.enabled } });
    await load();
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Thư ký AI Zalo</h1>
        <div className="flex gap-2">
          <Link href="/templates" className="btn-ghost">
            Mẫu phân tích
          </Link>
          <button className="btn-ghost" onClick={logout}>
            Thoát
          </button>
        </div>
      </header>

      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {state && <BotCard state={state} onAction={action} busy={busy} />}

      <section className="card">
        <h2 className="mb-3 font-semibold">Nhóm Zalo ({groups.length})</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">
            Chưa có nhóm nào. Hãy thêm nick bot vào nhóm Zalo cần theo dõi, rồi bấm “Đồng bộ danh sách nhóm”.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-3">
                {g.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    {(g.name || "?").slice(0, 1)}
                  </div>
                )}
                <Link href={`/groups/${g.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{g.name || g.id}</p>
                  <p className="text-xs text-slate-500">
                    {g.message_count} tin
                    {g.last_ts ? ` · gần nhất ${formatDateTime(g.last_ts)}` : ""}
                  </p>
                </Link>
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input type="checkbox" checked={g.enabled === 1} onChange={() => toggle(g)} />
                  Thu thập
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

