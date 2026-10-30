import { randomUUID } from "node:crypto";
import { query, run } from "./db";

export type TemplateOutput = "tasks" | "markdown";

export type Template = {
  id: string;
  name: string;
  description: string;
  instruction: string;
  output: TemplateOutput;
  builtin: number;
  created_at: number;
};

/** Mẫu có sẵn — cũng được eval harness dùng trực tiếp (không cần DB). */
export const BUILTIN_TEMPLATES: Omit<Template, "created_at" | "builtin">[] = [
  {
    id: "tasks",
    name: "Việc cần làm",
    description: "Trích xuất mọi đầu việc được giao: ai làm, ai giao, hạn chót, trạng thái.",
    output: "tasks",
    instruction:
      "Liệt kê TẤT CẢ đầu việc được giao hoặc nhận trong đoạn hội thoại. " +
      "Gộp các tin nhắn nói về cùng một việc thành một đầu việc. " +
      "Trạng thái suy ra từ các tin nhắn SAU đó (ví dụ 'xong rồi', 'đã gửi' => done).",
  },
  {
    id: "unfinished",
    name: "Việc tồn đọng",
    description: "Chỉ những việc đã giao nhưng chưa thấy ai xác nhận hoàn thành.",
    output: "tasks",
    instruction:
      "Chỉ liệt kê các đầu việc đã được giao nhưng KHÔNG có tin nhắn nào xác nhận đã hoàn thành. " +
      "Ưu tiên việc đã quá hạn. Bỏ qua việc đã xong.",
  },
  {
    id: "briefing",
    name: "Tóm tắt nhanh",
    description: "Đọc trong 1 phút: chuyện gì đã xảy ra, cần chú ý gì.",
    output: "markdown",
    instruction:
      "Viết bản tóm tắt ngắn gọn gồm các mục: **Tổng quan** (2-3 câu), **Việc đã xong**, " +
      "**Việc đang làm / chưa xong**, **Vấn đề cần quyết định**, **Thông báo quan trọng**. " +
      "Mục nào không có thì ghi 'Không có'.",
  },
  {
    id: "workload",
    name: "Theo từng người",
    description: "Mỗi thành viên đang được giao những việc gì, tiến độ ra sao.",
    output: "markdown",
    instruction:
      "Nhóm các đầu việc theo NGƯỜI PHỤ TRÁCH. Với mỗi người: danh sách việc, hạn chót, trạng thái. " +
      "Cuối cùng ghi những việc chưa rõ ai phụ trách.",
  },
  {
    id: "decisions",
    name: "Quyết định & vấn đề",
    description: "Các quyết định đã chốt, vấn đề phát sinh, câu hỏi còn bỏ ngỏ.",
    output: "markdown",
    instruction:
      "Liệt kê 3 mục: **Quyết định đã chốt** (ai chốt, khi nào), **Vấn đề / sự cố phát sinh**, " +
      "**Câu hỏi chưa có ai trả lời**.",
  },
];

export async function ensureBuiltinTemplates(): Promise<void> {
  const now = Date.now();
  for (const t of BUILTIN_TEMPLATES) {
    await run(
      `INSERT INTO templates (id, name, description, instruction, output, builtin, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
         instruction = excluded.instruction, output = excluded.output`,
      [t.id, t.name, t.description, t.instruction, t.output, now],
    );
  }
}

export async function listTemplates(): Promise<Template[]> {
  return query<Template>("SELECT * FROM templates ORDER BY builtin DESC, created_at");
}

export async function getTemplate(id: string): Promise<Template | null> {
  const rows = await query<Template>("SELECT * FROM templates WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function createTemplate(input: {
  name: string;
  description?: string;
  instruction: string;
  output: TemplateOutput;
}): Promise<string> {
  const id = randomUUID();
  await run(
    `INSERT INTO templates (id, name, description, instruction, output, builtin, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [id, input.name, input.description ?? "", input.instruction, input.output, Date.now()],
  );
  return id;
}

export async function deleteTemplate(id: string): Promise<void> {
  await run("DELETE FROM templates WHERE id = ? AND builtin = 0", [id]);
}

