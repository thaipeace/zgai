import { handler, json } from "@/lib/http";
import { listGroups } from "@/lib/messages";

export const dynamic = "force-dynamic";

export const GET = handler(async () => json(await listGroups()));

