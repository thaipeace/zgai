import { safeEqual, sign } from "./crypto";

export const SESSION_COOKIE = "zai_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Token phiên dạng `<hết hạn>.<chữ ký>`; không lưu trạng thái phía server. */
export function createSessionToken(): { token: string; maxAge: number } {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS);
  return { token: `${exp}.${sign(exp)}`, maxAge: MAX_AGE_SECONDS };
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) * 1000 > Date.now();
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

