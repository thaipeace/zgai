import { query, run } from "./db";
import { dayKey, stamp } from "./time";

export type MessageKind = "text" | "photo" | "file" | "voice" | "video" | "sticker" | "link" | "other" | "import";

export type StoredMessage = {
  id: string;
  group_id: string;
  sender_id: string | null;
  sender_name: string;
  ts: number;
  day: string;
  kind: MessageKind;
  text: string;
  quote_sender: string | null;
  quote_text: string | null;
  recalled: number;
  source: string;
};

export type NewMessage = Omit<StoredMessage, "day" | "recalled"> & { day?: string };

export async function insertMessage(m: NewMessage): Promise<boolean> {
  const changed = await run(
    `INSERT OR IGNORE INTO messages
       (id, group_id, sender_id, sender_name, ts, day, kind, text, quote_sender, quote_text, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.id,
      m.group_id,
      m.sender_id,
      m.sender_name,
      m.ts,
      m.day ?? dayKey(m.ts),
      m.kind,
      m.text,
      m.quote_sender,
      m.quote_text,
      m.source,
    ],
  );
  return changed > 0;
}

/** Tin bị thu hồi: xóa nội dung, giữ dấu vết để AI không coi là việc cần làm. */
export async function markRecalled(id: string): Promise<void> {
  await run("UPDATE messages SET recalled = 1, text = '' WHERE id = ?", [id]);
}

export async function upsertGroup(id: string, name?: string, avatar?: string): Promise<void> {
  await run(
    `INSERT INTO groups (id, name, avatar, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE groups.name END,
       avatar = COALESCE(excluded.avatar, groups.avatar),
       updated_at = excluded.updated_at`,
    [id, name ?? "", avatar ?? null, Date.now()],
  );
}

export async function isGroupEnabled(id: string): Promise<boolean> {
  const rows = await query<{ enabled: number }>("SELECT enabled FROM groups WHERE id = ?", [id]);
  return rows.length === 0 || rows[0].enabled === 1;
}

export async function listGroups() {
  return query<{
    id: string;
    name: string;
    avatar: string | null;
    enabled: number;
    message_count: number;
    last_ts: number | null;
  }>(
    `SELECT g.id, g.name, g.avatar, g.enabled,
            COUNT(m.id) AS message_count, MAX(m.ts) AS last_ts
       FROM groups g LEFT JOIN messages m ON m.group_id = g.id
      GROUP BY g.id
      ORDER BY last_ts DESC NULLS LAST, g.name`,
  );
}

export async function getGroup(id: string) {
  const rows = await query<{ id: string; name: string; enabled: number }>(
    "SELECT id, name, enabled FROM groups WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function messagesInRange(groupId: string, fromDay: string, toDay: string): Promise<StoredMessage[]> {
  return query<StoredMessage>(
    `SELECT * FROM messages WHERE group_id = ? AND day >= ? AND day <= ? ORDER BY ts, id`,
    [groupId, fromDay, toDay],
  );
}

export async function dayCounts(groupId: string, prefix: string) {
  return query<{ day: string; count: number }>(
    `SELECT day, COUNT(*) AS count FROM messages
      WHERE group_id = ? AND day LIKE ? AND recalled = 0
      GROUP BY day ORDER BY day`,
    [groupId, `${prefix}%`],
  );
}

const SKIP_KINDS = new Set<MessageKind>(["sticker"]);

/**
 * Chuyển tin nhắn thành bản ghi văn bản gọn cho LLM.
 * Mỗi dòng: [thứ, ngày giờ] Người gửi: nội dung  (↪ trả lời Người X: "...")
 */
export function toTranscript(messages: StoredMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.recalled || SKIP_KINDS.has(m.kind) || !m.text.trim()) continue;
    let line = `[${stamp(m.ts)}] ${m.sender_name || "Không rõ"}: ${m.text.replace(/\s+/g, " ").trim()}`;
    if (m.quote_text) {
      const q = m.quote_text.replace(/\s+/g, " ").trim().slice(0, 160);
      line += `  (↪ trả lời ${m.quote_sender || "ai đó"}: "${q}")`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

