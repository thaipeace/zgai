import { afterEach, vi } from "vitest";

// Ẩn log trạng thái "[zalo] connected"... cho output gọn; lỗi (console.error) vẫn hiện.
// Đặt VERBOSE=1 để xem đầy đủ.
if (!process.env.VERBOSE) {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
}

// Chặn mọi lời gọi mạng ngoài ý muốn: test không bao giờ được gọi Zalo hay Gemini thật.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1")) return realFetch(input, init);
  throw new Error(`Test đã cố gọi mạng ra ngoài: ${url}`);
}) as typeof fetch;

afterEach(() => {
  vi.useRealTimers();
});
