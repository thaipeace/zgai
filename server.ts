/**
 * Custom server: chạy Next.js + giữ kết nối Zalo (zca-js) trong CÙNG một tiến trình.
 * Vercel/serverless không giữ được WebSocket lâu dài nên app này cần chạy dạng server liên tục (Render).
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createServer } from "node:http";
import next from "next";
import { config } from "./src/lib/config";
import { db } from "./src/lib/db";
import { gate } from "./src/lib/gate";
import { ensureBuiltinTemplates } from "./src/lib/templates";
import { getZaloService } from "./src/lib/zalo/service";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

async function main() {
  // Kiểm tra cấu hình sớm để lỗi hiện rõ ngay khi khởi động.
  void config.appPassword;
  void config.sessionSecret;

  await db();
  await ensureBuiltinTemplates();

  const app = next({ dev, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    const decision = gate(req.url || "/", req.headers.cookie);
    if (decision.action === "unauthorized") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Chưa đăng nhập" }));
      return;
    }
    if (decision.action === "redirect") {
      res.writeHead(302, { location: decision.location });
      res.end();
      return;
    }
    void handle(req, res);
  });

  server.listen(port, () => {
    console.log(`> Zalo AI chạy tại http://localhost:${port} (${dev ? "dev" : "production"})`);
    // Không tự động kết nối Zalo khi khởi động/deploy để tránh spam đăng nhập khi cập nhật code.
    // Chỉ kiểm tra xem đã có phiên lưu trong DB chưa; người dùng chủ động bấm "Kích hoạt kết nối" trên app.
    void getZaloService()
      .init()
      .catch((err) => console.error("[zalo] init failed", err));
  });

  const shutdown = async (signal: string) => {
    console.log(`> Nhận ${signal}, đang dừng kết nối Zalo...`);
    await getZaloService()
      .stop()
      .catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

