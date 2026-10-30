import { SESSION_COOKIE, readCookie, verifySessionToken } from "./auth";

/** Đường dẫn công khai — so khớp CHÍNH XÁC theo pathname (bỏ query). */
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/health",
  "/manifest.webmanifest",
  "/icon.svg",
  "/favicon.ico",
]);
/** Tài nguyên tĩnh do Next build ra. */
const PUBLIC_PREFIXES = ["/_next/"];

export type GateDecision =
  | { action: "allow" }
  | { action: "unauthorized" } // API -> 401 JSON
  | { action: "redirect"; location: string }; // trang -> chuyển về /login

/** Quyết định cho một request dựa trên URL và header Cookie. */
export function gate(url: string, cookieHeader: string | undefined): GateDecision {
  const pathname = url.split("?")[0].split("#")[0];
  const isPublic = PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic || verifySessionToken(readCookie(cookieHeader, SESSION_COOKIE))) return { action: "allow" };
  if (pathname.startsWith("/api/")) return { action: "unauthorized" };
  return { action: "redirect", location: `/login?next=${encodeURIComponent(url)}` };
}
