import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini", () => ({ generateJson: vi.fn(), generateText: vi.fn(async () => "câu trả lời") }));

const { ensureBuiltinTemplates } = await import("@/lib/templates");
const { msg, resetDb, seedGroup, seedMessages, vn } = await import("../helpers/db");
const login = await import("@/app/api/auth/login/route");
const templates = await import("@/app/api/templates/route");
const templateById = await import("@/app/api/templates/[id]/route");
const groupById = await import("@/app/api/groups/[id]/route");
const groupMessages = await import("@/app/api/groups/[id]/messages/route");
const analyses = await import("@/app/api/groups/[id]/analyses/route");
const summary = await import("@/app/api/groups/[id]/summary/route");
const importRoute = await import("@/app/api/groups/[id]/import/route");
const health = await import("@/app/api/health/route");
const zaloRoute = await import("@/app/api/zalo/route");
const { encrypt } = await import("@/lib/crypto");
const { kvSet } = await import("@/lib/db");
const { getZaloService } = await import("@/lib/zalo/service");

const req = (method: string, body?: unknown, url = "http://test/x") =>
  new Request(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await resetDb();
  await ensureBuiltinTemplates();
  await seedGroup("g1", "Dự án ABC");
});

describe("API", () => {
  it("health công khai, trả trạng thái bot", async () => {
    const res = await health.GET();
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("zalo API: kiểm tra trạng thái khởi tạo (init), tạm dừng (disconnect) và đăng xuất (logout)", async () => {
    // Khi chưa có phiên lưu trong DB -> GET /api/zalo tự gọi init() -> logged_out
    await getZaloService().logout();
    const res1 = await zaloRoute.GET();
    expect(await res1.json()).toMatchObject({ status: "logged_out", hasSavedSession: false });

    // Giả lập đã có phiên lưu trong DB -> init() đưa về trạng thái chờ kích hoạt thủ công (idle + hasSavedSession: true)
    await kvSet("zalo_credentials", encrypt(JSON.stringify({ imei: "i", cookie: [], userAgent: "ua" })));
    await getZaloService().init();
    const res2 = await zaloRoute.GET();
    expect(await res2.json()).toMatchObject({ status: "idle", hasSavedSession: true });

    // Tạm dừng (disconnect) vẫn giữ nguyên phiên đã lưu
    const res3 = await zaloRoute.POST(req("POST", { action: "disconnect" }));
    expect(await res3.json()).toMatchObject({ status: "idle", hasSavedSession: true });

    // Đăng xuất (logout) xóa hẳn phiên đã lưu
    const res4 = await zaloRoute.POST(req("POST", { action: "logout" }));
    expect(await res4.json()).toMatchObject({ status: "logged_out", hasSavedSession: false });
  });

  it("login: sai mật khẩu 401, đúng thì đặt cookie httpOnly", async () => {
    expect((await login.POST(req("POST", { password: "sai" }))).status).toBe(401);
    const ok = await login.POST(req("POST", { password: "test-password" }));
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!;
    expect(cookie).toMatch(/zai_session=/);
    expect(cookie.toLowerCase()).toContain("httponly");
  }, 5000);

  it("mẫu: tạo, liệt kê, xóa; không xóa được mẫu có sẵn", async () => {
    const created = await templates.POST(req("POST", { name: "Đơn hàng", instruction: "Liệt kê các đơn hàng", output: "markdown" }));
    expect(created.status).toBe(201);
    const { id } = await created.json();

    const list = await (await templates.GET()).json();
    expect(list.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining(["tasks", "unfinished", id]));

    await templateById.DELETE(req("DELETE"), params(id));
    await templateById.DELETE(req("DELETE"), params("tasks"));
    const after = (await (await templates.GET()).json()).map((t: { id: string }) => t.id);
    expect(after).not.toContain(id);
    expect(after).toContain("tasks");
  });

  it("mẫu: validate dữ liệu", async () => {
    const res = await templates.POST(req("POST", { name: "x", instruction: "ngắn", output: "pdf" }));
    expect(res.status).toBe(400);
  });

  it("bật/tắt thu thập nhóm", async () => {
    await groupById.PATCH(req("PATCH", { enabled: false }), params("g1"));
    expect(await (await groupById.GET(req("GET"), params("g1"))).json()).toMatchObject({ enabled: 0 });
    expect((await groupById.GET(req("GET"), params("khong-co"))).status).toBe(404);
  });

  it("tin nhắn theo ngày và thống kê theo tháng", async () => {
    await seedMessages([msg({ text: "a", ts: vn("2026-10-29 08:00") }), msg({ text: "b", ts: vn("2026-10-30 08:00") })]);
    const day = await groupMessages.GET(req("GET", undefined, "http://test/x?day=2026-10-29"), params("g1"));
    expect((await day.json()).map((m: { text: string }) => m.text)).toEqual(["a"]);
    const month = await groupMessages.GET(req("GET", undefined, "http://test/x?prefix=2026-10"), params("g1"));
    expect(await month.json()).toHaveLength(2);
    const bad = await groupMessages.GET(req("GET", undefined, "http://test/x?day=29-10-2026"), params("g1"));
    expect(bad.status).toBe(400);
  });

  it("phân tích: validate khoảng ngày và 'mẫu HOẶC câu hỏi'", async () => {
    const reversed = await analyses.POST(req("POST", { from: "2026-10-30", to: "2026-10-01", templateId: "tasks" }), params("g1"));
    expect(reversed.status).toBe(400);
    const both = await analyses.POST(req("POST", { from: "2026-10-01", to: "2026-10-02", templateId: "tasks", question: "abc?" }), params("g1"));
    expect(both.status).toBe(400);
    const neither = await analyses.POST(req("POST", { from: "2026-10-01", to: "2026-10-02" }), params("g1"));
    expect(neither.status).toBe(400);
  });

  it("phân tích: hỏi tự do thành công và hiện trong lịch sử", async () => {
    await seedMessages([msg({ text: "a", ts: vn("2026-10-29 08:00") })]);
    const res = await analyses.POST(req("POST", { from: "2026-10-29", to: "2026-10-29", question: "Có gì mới?" }), params("g1"));
    expect(res.status).toBe(200);
    expect((await res.json()).result.markdown).toBe("câu trả lời");
    const history = await (await analyses.GET(req("GET"), params("g1"))).json();
    expect(history).toHaveLength(1);
  });

  it("báo cáo: key phải khớp period", async () => {
    const res = await summary.POST(req("POST", { period: "month", key: "2026-10-29" }), params("g1"));
    expect(res.status).toBe(400);
    const ok = await summary.POST(req("POST", { period: "day", key: "2026-10-29" }), params("g1"));
    expect(await ok.json()).toMatchObject({ summary: "Không có tin nhắn." });
  });

  it("nhập tay: lưu đoạn chat vào đúng ngày; nhóm không tồn tại => 404", async () => {
    const res = await importRoute.POST(req("POST", { day: "2026-09-01", text: "Minh: gửi hợp đồng\nLan: ok" }), params("g1"));
    expect(res.status).toBe(200);
    const day = await groupMessages.GET(req("GET", undefined, "http://test/x?day=2026-09-01"), params("g1"));
    const rows = await day.json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "import", source: "import", day: "2026-09-01" });

    const missing = await importRoute.POST(req("POST", { day: "2026-09-01", text: "x" }), params("khong-co"));
    expect(missing.status).toBe(404);
  });
});

