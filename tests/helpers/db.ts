import { run } from "@/lib/db";
import { insertMessage, upsertGroup, type MessageKind, type NewMessage } from "@/lib/messages";

const TABLES = ["kv", "groups", "messages", "summaries", "templates", "analyses"];

/** Xóa sạch dữ liệu giữa các test (schema giữ nguyên). */
export async function resetDb(): Promise<void> {
  for (const t of TABLES) await run(`DELETE FROM ${t}`);
}

/** Thời điểm theo giờ Việt Nam, ví dụ vn("2026-10-29 14:10"). */
export function vn(local: string): number {
  return new Date(`${local.replace(" ", "T")}:00+07:00`).getTime();
}

let seq = 0;

/** Tạo tin nhắn mẫu với giá trị mặc định hợp lý. */
export function msg(partial: Partial<NewMessage> & { text: string; ts: number }): NewMessage {
  seq += 1;
  return {
    id: `m${seq}`,
    group_id: "g1",
    sender_id: "u1",
    sender_name: "Minh",
    kind: "text" as MessageKind,
    quote_sender: null,
    quote_text: null,
    source: "zalo",
    ...partial,
  };
}

export async function seedGroup(id = "g1", name = "Nhóm Test"): Promise<void> {
  await upsertGroup(id, name);
}

export async function seedMessages(list: NewMessage[]): Promise<void> {
  for (const m of list) await insertMessage(m);
}

/** Chờ điều kiện đúng (dùng cho các handler async chạy nền như listener Zalo). */
export async function waitFor(cond: () => boolean | Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: hết thời gian chờ");
    await new Promise((r) => setTimeout(r, 10));
  }
}

