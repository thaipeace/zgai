import { getZaloService } from "@/lib/zalo/service";

export const dynamic = "force-dynamic";

/** Endpoint công khai cho cron-job.org / UptimeRobot ping giữ Render không ngủ. */
export async function GET() {
  const { status } = getZaloService().state;
  return Response.json({ ok: true, zalo: status, time: new Date().toISOString() });
}

