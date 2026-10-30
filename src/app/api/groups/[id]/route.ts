import { z } from "zod";
import { run } from "@/lib/db";
import { handler, json, type IdParams } from "@/lib/http";
import { getGroup } from "@/lib/messages";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, { params }: IdParams) => {
  const group = await getGroup((await params).id);
  return group ? json(group) : json({ error: "Không tìm thấy nhóm" }, 404);
});

const Body = z.object({ enabled: z.boolean() });

/** Bật/tắt thu thập tin nhắn cho một nhóm. */
export const PATCH = handler(async (req: Request, { params }: IdParams) => {
  const { enabled } = Body.parse(await req.json());
  await run("UPDATE groups SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, (await params).id]);
  return json({ ok: true });
});

