import { z } from "zod";
import { summarize } from "@/lib/analysis";
import { handler, json, type IdParams } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z
  .object({
    period: z.enum(["day", "month", "year"]),
    key: z.string(),
    force: z.boolean().optional(),
  })
  .refine(
    (b) =>
      (b.period === "day" && /^\d{4}-\d{2}-\d{2}$/.test(b.key)) ||
      (b.period === "month" && /^\d{4}-\d{2}$/.test(b.key)) ||
      (b.period === "year" && /^\d{4}$/.test(b.key)),
    "key không khớp với period",
  );

/** Báo cáo Ngày / Tháng / Năm (có cache, chỉ gọi Gemini khi có tin mới). */
export const POST = handler(async (req: Request, { params }: IdParams) => {
  const { period, key, force } = Body.parse(await req.json());
  return json(await summarize((await params).id, period, key, force));
});

