import { handler, json, type IdParams } from "@/lib/http";
import { deleteTemplate } from "@/lib/templates";

export const DELETE = handler(async (_req: Request, { params }: IdParams) => {
  await deleteTemplate((await params).id);
  return json({ ok: true });
});

