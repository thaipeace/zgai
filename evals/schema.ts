import { z } from "zod";

/** Định dạng một ca kiểm thử AI (file JSON trong evals/cases/). */
export const EvalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().min(5),
  group: z.string().default("Nhóm test"),
  /** "Thời điểm hiện tại" khi phân tích, giờ VN: "YYYY-MM-DD HH:mm". */
  now: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  /** Mẫu cần chạy: chỉ các mẫu trả về danh sách việc. */
  template: z.enum(["tasks", "unfinished"]),
  messages: z
    .array(
      z.object({
        at: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
        from: z.string().min(1),
        text: z.string().min(1),
        kind: z.enum(["text", "photo", "file", "voice", "sticker"]).default("text"),
        reply: z.object({ from: z.string(), text: z.string() }).optional(),
        recalled: z.boolean().default(false),
      }),
    )
    .min(1),
  /** Các đầu việc AI PHẢI tìm ra. */
  expected: z.array(
    z.object({
      /** Mọi từ khóa (không dấu, chữ thường) phải xuất hiện trong tiêu đề việc. */
      keywords: z.array(z.string().min(2)).min(1),
      assignee: z.string().optional(),
      /** "open" = todo hoặc in_progress; "any" = không chấm. */
      status: z.enum(["todo", "in_progress", "done", "open", "any"]).default("any"),
      /** Chuỗi phải có trong hạn chót, ví dụ "30/10/2026"; "none" = không có hạn. */
      deadline: z.string().optional(),
    }),
  ),
  /** Các bộ từ khóa KHÔNG được xuất hiện như một đầu việc. */
  forbidden: z.array(z.array(z.string().min(2)).min(1)).default([]),
});

export type EvalCase = z.infer<typeof EvalCaseSchema>;

