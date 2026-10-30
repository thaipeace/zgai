import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dayString, handler, json, type IdParams } from "@/lib/http";
import { getGroup, insertMessage } from "@/lib/messages";

const Body = z.object({
  day: dayString,
  text: z.string().trim().min(1).max(200_000),
});

/**
 * Nhập tay đoạn chat cũ (copy từ Zalo) cho một ngày — dùng để bù lịch sử
 * trước khi bot vào nhóm, hoặc khi zca-js tạm ngừng hoạt động.
 */
export const POST = handler(async (req: Request, { params }: IdParams) => {
  const { id } = await params;
  if (!(await getGroup(id))) return json({ error: "Không tìm thấy nhóm" }, 404);
  const { day, text } = Body.parse(await req.json());
  const ts = new Date(`${day}T12:00:00`).getTime();
  await insertMessage({
    id: `import-${randomUUID()}`,
    group_id: id,
    sender_id: null,
    sender_name: "Đoạn chat nhập tay",
    ts,
    day,
    kind: "import",
    text,
    quote_sender: null,
    quote_text: null,
    source: "import",
  });
  return json({ ok: true });
});

