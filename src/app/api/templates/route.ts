import { z } from "zod";
import { handler, json } from "@/lib/http";
import { createTemplate, listTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";

export const GET = handler(async () => json(await listTemplates()));

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  instruction: z.string().trim().min(10).max(4000),
  output: z.enum(["tasks", "markdown"]),
});

export const POST = handler(async (req: Request) => {
  const id = await createTemplate(Body.parse(await req.json()));
  return json({ id }, 201);
});

