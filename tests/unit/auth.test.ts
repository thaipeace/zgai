import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, createSessionToken, readCookie, verifySessionToken } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { gate } from "@/lib/gate";

describe("session token", () => {
  it("token vừa tạo hợp lệ", () => {
    expect(verifySessionToken(createSessionToken().token)).toBe(true);
  });

  it("từ chối token bị sửa, rỗng hoặc sai định dạng", () => {
    const { token } = createSessionToken();
    const [exp, sig] = token.split(".");
    expect(verifySessionToken(`${Number(exp) + 999}.${sig}`)).toBe(false);
    expect(verifySessionToken(`${exp}.${sig}x`)).toBe(false);
    expect(verifySessionToken("")).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken("abc")).toBe(false);
  });

  it("token hết hạn sau 30 ngày", () => {
    const { token } = createSessionToken();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 24 * 3600 * 1000);
    expect(verifySessionToken(token)).toBe(false);
  });

  it("đọc cookie từ header", () => {
    expect(readCookie("a=1; zai_session=abc.def; b=2", SESSION_COOKIE)).toBe("abc.def");
    expect(readCookie(undefined, SESSION_COOKIE)).toBeUndefined();
    expect(readCookie("a=1", SESSION_COOKIE)).toBeUndefined();
  });
});

describe("crypto (mã hóa cookie Zalo)", () => {
  it("mã hóa rồi giải mã ra đúng nội dung", () => {
    const plain = JSON.stringify({ imei: "imei-123", cookie: [{ key: "zpw", value: "bí mật" }] });
    const enc = encrypt(plain);
    expect(enc).not.toContain("imei-123");
    expect(decrypt(enc)).toBe(plain);
  });

  it("mỗi lần mã hóa cho kết quả khác nhau (IV ngẫu nhiên)", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });

  it("phát hiện dữ liệu bị sửa", () => {
    const [iv, tag, data] = encrypt("hello").split(".");
    const tampered = [iv, tag, Buffer.from("HELLO").toString("base64url")].join(".");
    expect(() => decrypt(tampered)).toThrow();
    expect(data).toBeTruthy();
  });
});

describe("gate (chặn truy cập chưa đăng nhập)", () => {
  const cookie = `${SESSION_COOKIE}=${createSessionToken().token}`;

  it("cho phép các đường dẫn công khai", () => {
    for (const url of ["/login", "/login?next=/", "/api/health", "/api/auth/login", "/_next/static/x.js", "/manifest.webmanifest", "/icon.svg", "/favicon.ico"]) {
      expect(gate(url, undefined)).toEqual({ action: "allow" });
    }
  });

  it("API trả 401, trang chuyển về /login kèm next", () => {
    expect(gate("/api/groups", undefined)).toEqual({ action: "unauthorized" });
    expect(gate("/groups/123", undefined)).toEqual({ action: "redirect", location: "/login?next=%2Fgroups%2F123" });
  });

  it("cho phép khi có cookie hợp lệ", () => {
    expect(gate("/api/groups", cookie)).toEqual({ action: "allow" });
    expect(gate("/", cookie)).toEqual({ action: "allow" });
  });

  it("so khớp chính xác: đường dẫn chỉ 'giống' đường dẫn công khai vẫn bị chặn", () => {
    expect(gate("/api/healthz-secret", undefined)).toEqual({ action: "unauthorized" });
    expect(gate("/api/health/../groups", undefined)).toEqual({ action: "unauthorized" });
    expect(gate("/loginx", undefined).action).toBe("redirect");
    expect(gate("/api/groups?x=/login", undefined)).toEqual({ action: "unauthorized" });
    expect(gate("/icon.svg?v=abc", undefined)).toEqual({ action: "allow" });
  });
});
