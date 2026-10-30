import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Mỗi file test chạy trong tiến trình riêng => DB in-memory và singleton không rò rỉ giữa các file.
    pool: "forks",
    isolate: true,
    testTimeout: 10_000,
    env: {
      APP_PASSWORD: "test-password",
      SESSION_SECRET: "test-secret-0123456789-0123456789-abcdef",
      GEMINI_API_KEY: "fake-key-tests-never-call-gemini",
      GEMINI_MODEL: "gemini-test-model",
      APP_TIMEZONE: "Asia/Ho_Chi_Minh",
      TURSO_DATABASE_URL: ":memory:",
    },
  },
});
