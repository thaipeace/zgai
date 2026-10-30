import { z } from "zod";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth";
import { config } from "@/lib/config";
import { safeEqual } from "@/lib/crypto";
import { handler, json } from "@/lib/http";

const Body = z.object({ password: z.string().min(1) });

export const POST = handler(async (req: Request) => {
  const { password } = Body.parse(await req.json());
  if (!safeEqual(password, config.appPassword)) {
    await new Promise((r) => setTimeout(r, 800)); // làm chậm dò mật khẩu
    return json({ error: "Sai mật khẩu" }, 401);
  }
  const { token, maxAge } = createSessionToken();
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return res;
});

