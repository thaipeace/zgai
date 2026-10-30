/** Cấu hình đọc từ biến môi trường, kiểm tra một lần khi dùng. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name} (xem .env.example)`);
  return value;
}

export const config = {
  get appPassword() {
    return required("APP_PASSWORD");
  },
  get sessionSecret() {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) throw new Error("SESSION_SECRET phải dài ít nhất 32 ký tự");
    return secret;
  },
  get geminiApiKey() {
    return required("GEMINI_API_KEY");
  },
  get geminiModel() {
    return process.env.GEMINI_MODEL || "gemini-3.8-flash";
  },
  get timezone() {
    return process.env.APP_TIMEZONE || "Asia/Ho_Chi_Minh";
  },
  get dbUrl() {
    return process.env.TURSO_DATABASE_URL || "file:./data/zalo-ai.db";
  },
  get dbAuthToken() {
    return process.env.TURSO_AUTH_TOKEN || undefined;
  },
  /**
   * Độ dài tối đa (ký tự) của bản ghi tin nhắn gửi thẳng cho Gemini.
   * Vượt ngưỡng thì dùng bản tóm tắt theo ngày thay thế.
   * Gemini Flash ~1M token; tiếng Việt ~3 ký tự/token => mặc định giữ biên an toàn.
   */
  get maxTranscriptChars() {
    return Number(process.env.MAX_TRANSCRIPT_CHARS) || 1_500_000;
  },
};

