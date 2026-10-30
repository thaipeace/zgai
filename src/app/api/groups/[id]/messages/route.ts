import { z } from "zod";
import { dayString, handler, json, type IdParams } from "@/lib/http";
import { dayCounts, messagesInRange } from "@/lib/messages";

export const dynamic = "force-dynamic";

const Query = z.object({
  day: dayString.optional(),
  prefix: z.string().regex(/^\d{4}(-\d{2})?$/).optional(),
});

/**
 * ?day=YYYY-MM-DD      -> tin nhắn của ngày đó
 * ?prefix=YYYY[-MM]    -> số tin theo từng ngày (để vẽ lịch)
 */
export const GET = handler(async (req: Request, { params }: IdParams) => {
  const { id } = await params;
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  if (q.day) return json(await messagesInRange(id, q.day, q.day));
  return json(await dayCounts(id, q.prefix ?? ""));
});

