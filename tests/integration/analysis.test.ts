import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PeriodReport } from "@/lib/analysis";

// Gemini được thay bằng mock: test không bao giờ gọi API thật.
vi.mock("@/lib/gemini", () => ({ generateJson: vi.fn(), generateText: vi.fn() }));

const gemini = await import("@/lib/gemini");
const { ask, listAnalyses, runTemplate, summarizeDay, summarizeMonth, summarizeYear } = await import("@/lib/analysis");
const { ensureBuiltinTemplates } = await import("@/lib/templates");
const { insertMessage } = await import("@/lib/messages");
const { msg, resetDb, seedGroup, seedMessages, vn } = await import("../helpers/db");

const generateJson = vi.mocked(gemini.generateJson);
const generateText = vi.mocked(gemini.generateText);

function report(summary: string): PeriodReport {
  return { summary, highlights: [], tasks: [], blockers: [], decisions: [] };
}

beforeEach(async () => {
  await resetDb();
  await ensureBuiltinTemplates();
  await seedGroup("g1", "Dự án ABC");
  generateJson.mockReset();
  generateText.mockReset();
  generateJson.mockImplementation(async (_s, input) => report(`tóm tắt cho: ${input.slice(0, 40)}`) as never);
});

describe("tóm tắt ngày", () => {
  it("ngày không có tin => không gọi Gemini", async () => {
    const r = await summarizeDay("g1", "2026-10-29");
    expect(r.summary).toBe("Không có tin nhắn.");
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("gửi đúng bản ghi + tên nhóm, rồi cache kết quả", async () => {
    await seedMessages([msg({ text: "@Hùng sửa lỗi VNPay", ts: vn("2026-10-29 14:00") })]);
    await summarizeDay("g1", "2026-10-29");
    await summarizeDay("g1", "2026-10-29");
    expect(generateJson).toHaveBeenCalledTimes(1);

    const [system, input, schema] = generateJson.mock.calls[0];
    expect(system).toContain('nhóm Zalo "Dự án ABC"');
    expect(input).toContain("Minh: @Hùng sửa lỗi VNPay");
    expect(schema).toMatchObject({ required: expect.arrayContaining(["summary", "tasks"]) });
  });

  it("có tin mới trong ngày => phân tích lại", async () => {
    await seedMessages([msg({ text: "a", ts: vn("2026-10-29 08:00") })]);
    await summarizeDay("g1", "2026-10-29");
    await insertMessage(msg({ text: "b", ts: vn("2026-10-29 09:00") }));
    await summarizeDay("g1", "2026-10-29");
    expect(generateJson).toHaveBeenCalledTimes(2);
  });

  it("force => luôn phân tích lại", async () => {
    await seedMessages([msg({ text: "a", ts: vn("2026-10-29 08:00") })]);
    await summarizeDay("g1", "2026-10-29");
    await summarizeDay("g1", "2026-10-29", true);
    expect(generateJson).toHaveBeenCalledTimes(2);
  });
});

describe("tổng hợp tháng / năm (cuốn chiếu)", () => {
  beforeEach(async () => {
    await seedMessages([
      msg({ text: "việc ngày 1", ts: vn("2026-10-01 08:00") }),
      msg({ text: "việc ngày 2", ts: vn("2026-10-02 08:00") }),
      msg({ text: "việc tháng 9", ts: vn("2026-09-15 08:00") }),
    ]);
  });

  it("tháng = tóm tắt từng ngày + 1 lần tổng hợp; lần sau dùng cache", async () => {
    await summarizeMonth("g1", "2026-10");
    expect(generateJson).toHaveBeenCalledTimes(3); // 2 ngày + 1 tháng
    const monthInput = generateJson.mock.calls[2][1];
    expect(monthInput).toContain("THÁNG 2026-10");
    expect(monthInput).toContain("### Ngày 2026-10-01");

    await summarizeMonth("g1", "2026-10");
    expect(generateJson).toHaveBeenCalledTimes(3);
  });

  it("năm = tổng hợp từ các tháng, tái sử dụng tóm tắt ngày đã có", async () => {
    await summarizeMonth("g1", "2026-10"); // 3 lần gọi
    generateJson.mockClear();
    await summarizeYear("g1", "2026");
    // Tháng 9: 1 ngày + 1 tháng; tháng 10: đã cache; năm: 1
    expect(generateJson).toHaveBeenCalledTimes(3);
    expect(generateJson.mock.calls.at(-1)![1]).toContain("NĂM 2026");
  });
});

describe("phân tích theo mẫu và hỏi tự do", () => {
  beforeEach(async () => {
    await seedMessages([msg({ text: "@Tuấn mai gửi báo cáo", ts: vn("2026-10-29 17:00") })]);
  });

  it("mẫu dạng danh sách việc: dùng schema JSON, lưu vào lịch sử", async () => {
    generateJson.mockResolvedValueOnce({
      summary: "1 việc",
      tasks: [{ title: "Gửi báo cáo", assignee: "Tuấn", requester: "Minh", deadline: "30/10/2026", priority: "medium", status: "todo", evidence: "..." }],
    } as never);
    const { result } = await runTemplate("g1", "tasks", "2026-10-29", "2026-10-29");
    expect(result).toMatchObject({ kind: "tasks", basedOn: "messages", tasks: [{ assignee: "Tuấn" }] });
    expect(generateJson.mock.calls[0][1]).toContain('mẫu "Việc cần làm"');

    const history = await listAnalyses("g1");
    expect(history).toHaveLength(1);
    expect(history[0].template_name).toBe("Việc cần làm");
  });

  it("mẫu dạng văn bản: gọi generateText, trả markdown", async () => {
    generateText.mockResolvedValueOnce("## Tổng quan\nỔn");
    const { result } = await runTemplate("g1", "briefing", "2026-10-29", "2026-10-29");
    expect(result).toEqual({ kind: "markdown", markdown: "## Tổng quan\nỔn", basedOn: "messages" });
  });

  it("mẫu không tồn tại => lỗi rõ ràng", async () => {
    await expect(runTemplate("g1", "khong-co", "2026-10-29", "2026-10-29")).rejects.toThrow(/Không tìm thấy mẫu/);
  });

  it("hỏi tự do: câu hỏi và tin nhắn nằm trong input", async () => {
    generateText.mockResolvedValueOnce("Tuấn phải gửi báo cáo.");
    const { result } = await ask("g1", "Tuấn cần làm gì?", "2026-10-29", "2026-10-29");
    expect(result).toMatchObject({ kind: "markdown", markdown: "Tuấn phải gửi báo cáo." });
    const input = generateText.mock.calls[0][1];
    expect(input).toContain("CÂU HỎI: Tuấn cần làm gì?");
    expect(input).toContain("@Tuấn mai gửi báo cáo");
  });

  it("khoảng thời gian quá dài => chuyển sang dùng tóm tắt ngày", async () => {
    process.env.MAX_TRANSCRIPT_CHARS = "10";
    try {
      generateText.mockResolvedValueOnce("ok");
      const { result } = await ask("g1", "Có gì mới?", "2026-10-29", "2026-10-29");
      expect(result.basedOn).toBe("summaries");
      expect(generateJson).toHaveBeenCalledTimes(1); // tóm tắt ngày 29
      expect(generateText.mock.calls[0][1]).toContain("TÓM TẮT THEO NGÀY");
    } finally {
      delete process.env.MAX_TRANSCRIPT_CHARS;
    }
  });
});

