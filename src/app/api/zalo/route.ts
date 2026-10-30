import { z } from "zod";
import { handler, json } from "@/lib/http";
import { getZaloService } from "@/lib/zalo/service";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const zalo = getZaloService();
  if (zalo.state.status === "idle" && !zalo.state.hasSavedSession) {
    await zalo.init();
  }
  return json(zalo.state);
});

const Body = z.object({
  action: z.enum(["connect", "disconnect", "qr", "reconnect", "logout", "sync_groups"]),
});

/** Điều khiển bot chủ động: kích hoạt kết nối, tạm dừng, quét QR, kết nối lại, đăng xuất, đồng bộ nhóm. */
export const POST = handler(async (req: Request) => {
  const { action } = Body.parse(await req.json());
  const zalo = getZaloService();
  switch (action) {
    case "connect":
      await Promise.race([zalo.start(), new Promise((r) => setTimeout(r, 1500))]);
      break;
    case "disconnect":
      await zalo.stop();
      break;
    case "qr":
      await zalo.startQrLogin();
      break;
    case "reconnect":
      await zalo.reconnect();
      break;
    case "logout":
      await zalo.logout();
      break;
    case "sync_groups":
      return json({ ...zalo.state, synced: await zalo.syncGroups() });
  }
  return json(zalo.state);
});

