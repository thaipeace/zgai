import { z } from "zod";
import { ask, listAnalyses, runTemplate } from "@/lib/analysis";
import { dayString, handler, json, type IdParams } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z
  .object({
    from: dayString,
    to: dayString,
    templateId: z.string().optional(),
    question: z.string().trim().min(3).max(2000).optional(),
  })
  .refine((b) => b.from <= b.to, "Ngày bắt đầu phải trước ngày kết thúc")
  .refine((b) => Boolean(b.templateId) !== Boolean(b.question), "Chọn mẫu HOẶC nhập câu hỏi");

/** Lịch sử các lần phân tích. */
export const GET = handler(async (_req: Request, { params }: IdParams) => json(await listAnalyses((await params).id)));

/** Phân tích theo mẫu (templateId) hoặc hỏi tự do (question). */
export const POST = handler(async (req: Request, { params }: IdParams) => {
  const { id } = await params;
  const b = Body.parse(await req.json());
  const out = b.templateId
    ? await runTemplate(id, b.templateId, b.from, b.to)
    : await ask(id, b.question!, b.from, b.to);
  return json(out);
});

