import { randomUUID } from "node:crypto";
import { config } from "./config";
import { query, run } from "./db";
import { generateJson, generateText } from "./gemini";
import { dayCounts, getGroup, messagesInRange, toTranscript } from "./messages";
import { getTemplate, type Template } from "./templates";
import { stamp } from "./time";

// ---------- Kiểu dữ liệu kết quả ----------

export type Task = {
  title: string;
  assignee: string;
  requester: string;
  deadline: string;
  priority: "high" | "medium" | "low" | "unknown";
  status: "todo" | "in_progress" | "done" | "unknown";
  evidence: string;
};

export type PeriodReport = {
  summary: string;
  highlights: string[];
  tasks: Task[];
  blockers: string[];
  decisions: string[];
};

export type Period = "day" | "month" | "year";

export type AnalysisResult =
  | { kind: "tasks"; summary: string; tasks: Task[]; basedOn: "messages" | "summaries" }
  | { kind: "markdown"; markdown: string; basedOn: "messages" | "summaries" };

// ---------- Schema JSON cho Gemini ----------

const TASK_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Mô tả ngắn gọn đầu việc" },
    assignee: { type: "string", description: "Người phụ trách; 'Chưa rõ' nếu không xác định" },
    requester: { type: "string", description: "Người giao việc; 'Chưa rõ' nếu không xác định" },
    deadline: {
      type: "string",
      description: "Hạn chót đã quy đổi sang ngày giờ cụ thể (dd/MM/yyyy HH:mm) hoặc 'Không có'",
    },
    priority: { type: "string", enum: ["high", "medium", "low", "unknown"] },
    status: { type: "string", enum: ["todo", "in_progress", "done", "unknown"] },
    evidence: { type: "string", description: "Trích nguyên văn tin nhắn gốc kèm [thời gian] người gửi" },
  },
  required: ["title", "assignee", "requester", "deadline", "priority", "status", "evidence"],
};

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Tóm tắt 3-6 câu" },
    highlights: { type: "array", items: { type: "string" } },
    tasks: { type: "array", items: TASK_SCHEMA },
    blockers: { type: "array", items: { type: "string" }, description: "Vướng mắc, sự cố, việc bị chặn" },
    decisions: { type: "array", items: { type: "string" }, description: "Quyết định đã chốt" },
  },
  required: ["summary", "highlights", "tasks", "blockers", "decisions"],
};

const TASK_LIST_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "1-2 câu nhận xét chung" },
    tasks: { type: "array", items: TASK_SCHEMA },
  },
  required: ["summary", "tasks"],
};

// ---------- Prompt ----------

function systemPrompt(groupName: string, now: number = Date.now()): string {
  return [
    `Bạn là thư ký công việc, phân tích tin nhắn của nhóm Zalo "${groupName}".`,
    `Thời điểm hiện tại: ${stamp(now)} (múi giờ ${config.timezone}).`,
    "Quy tắc bắt buộc:",
    "- Chỉ dựa vào dữ liệu được cung cấp. Không bịa thêm người, việc, con số.",
    "- Quy đổi thời gian tương đối ('chiều nay', 'mai', 'thứ 6') dựa trên thời điểm GỬI của chính tin nhắn đó.",
    "- Bỏ qua chào hỏi, cảm ơn, sticker, tin nhắn không liên quan công việc.",
    "- Khi không chắc chắn, ghi rõ 'Chưa rõ' thay vì đoán.",
    "- Trích dẫn nguồn theo dạng [thời gian] Người gửi.",
    "- Trả lời bằng tiếng Việt.",
  ].join("\n");
}

export { systemPrompt };

// ---------- Tóm tắt theo kỳ (có cache) ----------

type SummaryRow = { message_count: number; content: string };

async function cached(groupId: string, period: Period, key: string): Promise<SummaryRow | null> {
  const rows = await query<SummaryRow>(
    "SELECT message_count, content FROM summaries WHERE group_id = ? AND period = ? AND key = ?",
    [groupId, period, key],
  );
  return rows[0] ?? null;
}

async function saveSummary(groupId: string, period: Period, key: string, count: number, report: PeriodReport) {
  await run(
    `INSERT INTO summaries (group_id, period, key, message_count, content, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(group_id, period, key) DO UPDATE SET message_count = excluded.message_count,
       content = excluded.content, model = excluded.model, created_at = excluded.created_at`,
    [groupId, period, key, count, JSON.stringify(report), config.geminiModel, Date.now()],
  );
}

const EMPTY_REPORT: PeriodReport = { summary: "Không có tin nhắn.", highlights: [], tasks: [], blockers: [], decisions: [] };

/**
 * Tóm tắt 1 ngày từ tin nhắn gốc. Kết quả được cache theo số lượng tin;
 * chỉ gọi lại Gemini khi ngày đó có thêm tin mới (hoặc force).
 */
export async function summarizeDay(groupId: string, day: string, force = false): Promise<PeriodReport> {
  const group = await getGroup(groupId);
  const messages = await messagesInRange(groupId, day, day);
  const transcript = toTranscript(messages);
  if (!transcript) return EMPTY_REPORT;

  const hit = await cached(groupId, "day", day);
  if (!force && hit && hit.message_count === messages.length) return JSON.parse(hit.content);

  const report = await generateJson<PeriodReport>(
    systemPrompt(group?.name || groupId),
    `Tóm tắt hoạt động của nhóm trong ngày ${day}. Liệt kê đủ mọi đầu việc.\n\nTIN NHẮN:\n${transcript}`,
    REPORT_SCHEMA,
  );
  await saveSummary(groupId, "day", day, messages.length, report);
  return report;
}

/** Tổng hợp tháng từ các bản tóm tắt ngày (không đọc lại tin nhắn gốc). */
export async function summarizeMonth(groupId: string, month: string, force = false): Promise<PeriodReport> {
  const days = await dayCounts(groupId, month);
  const total = days.reduce((s, d) => s + d.count, 0);
  if (total === 0) return EMPTY_REPORT;

  const hit = await cached(groupId, "month", month);
  if (!force && hit && hit.message_count === total) return JSON.parse(hit.content);

  const dailies = await mapLimit(days, 4, async (d) => ({ day: d.day, report: await summarizeDay(groupId, d.day) }));
  const group = await getGroup(groupId);
  const report = await generateJson<PeriodReport>(
    systemPrompt(group?.name || groupId),
    `Tổng hợp báo cáo THÁNG ${month} từ các bản tóm tắt theo ngày dưới đây. ` +
      "Trong 'tasks' chỉ giữ việc quan trọng và việc CHƯA xong tính đến cuối tháng (cập nhật trạng thái theo các ngày sau). " +
      "Nêu các vấn đề kéo dài nhiều ngày.\n\n" +
      dailies.map((d) => `### Ngày ${d.day}\n${JSON.stringify(d.report)}`).join("\n\n"),
    REPORT_SCHEMA,
  );
  await saveSummary(groupId, "month", month, total, report);
  return report;
}

/** Tổng hợp năm từ các bản tóm tắt tháng. */
export async function summarizeYear(groupId: string, year: string, force = false): Promise<PeriodReport> {
  const days = await dayCounts(groupId, year);
  const total = days.reduce((s, d) => s + d.count, 0);
  if (total === 0) return EMPTY_REPORT;

  const hit = await cached(groupId, "year", year);
  if (!force && hit && hit.message_count === total) return JSON.parse(hit.content);

  const months = [...new Set(days.map((d) => d.day.slice(0, 7)))];
  const monthly = await mapLimit(months, 2, async (m) => ({ month: m, report: await summarizeMonth(groupId, m) }));
  const group = await getGroup(groupId);
  const report = await generateJson<PeriodReport>(
    systemPrompt(group?.name || groupId),
    `Tổng hợp báo cáo NĂM ${year} từ các báo cáo tháng dưới đây. ` +
      "Nêu các mảng việc chính, thành quả, việc còn tồn đọng cuối năm và vấn đề lặp lại.\n\n" +
      monthly.map((m) => `### Tháng ${m.month}\n${JSON.stringify(m.report)}`).join("\n\n"),
    REPORT_SCHEMA,
  );
  await saveSummary(groupId, "year", year, total, report);
  return report;
}

export async function summarize(groupId: string, period: Period, key: string, force = false) {
  if (period === "day") return summarizeDay(groupId, key, force);
  if (period === "month") return summarizeMonth(groupId, key, force);
  return summarizeYear(groupId, key, force);
}

// ---------- Phân tích theo mẫu & hỏi tự do ----------

/**
 * Lấy ngữ cảnh cho khoảng thời gian: ưu tiên tin nhắn gốc;
 * nếu quá dài thì dùng các bản tóm tắt ngày thay thế.
 */
async function buildContext(groupId: string, from: string, to: string) {
  const messages = await messagesInRange(groupId, from, to);
  const transcript = toTranscript(messages);
  if (transcript.length <= config.maxTranscriptChars) {
    return { basedOn: "messages" as const, text: `TIN NHẮN (${from} → ${to}):\n${transcript || "(không có)"}` };
  }
  const days = [...new Set(messages.map((m) => m.day))];
  const dailies = await mapLimit(days, 4, async (d) => ({ day: d, report: await summarizeDay(groupId, d) }));
  return {
    basedOn: "summaries" as const,
    text:
      `Khoảng thời gian quá dài nên dưới đây là TÓM TẮT THEO NGÀY (${from} → ${to}):\n` +
      dailies.map((d) => `### ${d.day}\n${JSON.stringify(d.report)}`).join("\n\n"),
  };
}

export async function runTemplate(groupId: string, templateId: string, from: string, to: string) {
  const template = await getTemplate(templateId);
  if (!template) throw new Error("Không tìm thấy mẫu phân tích");
  const group = await getGroup(groupId);
  const ctx = await buildContext(groupId, from, to);
  const result = await executeTemplate(template, systemPrompt(group?.name || groupId), ctx);
  return saveAnalysis(groupId, template.id, null, from, to, result);
}

/** Chạy một mẫu trên ngữ cảnh có sẵn (không đụng DB) — dùng chung cho app và eval harness. */
export async function executeTemplate(
  template: Template,
  system: string,
  ctx: { basedOn: "messages" | "summaries"; text: string },
): Promise<AnalysisResult> {
  const input = `YÊU CẦU (mẫu "${template.name}"):\n${template.instruction}\n\n${ctx.text}`;
  if (template.output === "tasks") {
    const out = await generateJson<{ summary: string; tasks: Task[] }>(system, input, TASK_LIST_SCHEMA);
    return { kind: "tasks", summary: out.summary, tasks: out.tasks, basedOn: ctx.basedOn };
  }
  const markdown = await generateText(system, `${input}\n\nTrình bày bằng Markdown.`);
  return { kind: "markdown", markdown, basedOn: ctx.basedOn };
}

export async function ask(groupId: string, question: string, from: string, to: string) {
  const group = await getGroup(groupId);
  const ctx = await buildContext(groupId, from, to);
  const markdown = await generateText(
    systemPrompt(group?.name || groupId),
    `CÂU HỎI: ${question}\n\nTrả lời bằng Markdown, có trích dẫn [thời gian] Người gửi cho các ý quan trọng. ` +
      `Nếu dữ liệu không đủ để trả lời, hãy nói rõ.\n\n${ctx.text}`,
  );
  return saveAnalysis(groupId, null, question, from, to, { kind: "markdown", markdown, basedOn: ctx.basedOn });
}

async function saveAnalysis(
  groupId: string,
  templateId: string | null,
  question: string | null,
  from: string,
  to: string,
  result: AnalysisResult,
) {
  const id = randomUUID();
  await run(
    `INSERT INTO analyses (id, group_id, template_id, question, range_from, range_to, result, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, groupId, templateId, question, from, to, JSON.stringify(result), Date.now()],
  );
  return { id, result };
}

export async function listAnalyses(groupId: string, limit = 30) {
  const rows = await query<{
    id: string;
    template_id: string | null;
    template_name: string | null;
    question: string | null;
    range_from: string;
    range_to: string;
    result: string;
    created_at: number;
  }>(
    `SELECT a.*, t.name AS template_name FROM analyses a LEFT JOIN templates t ON t.id = a.template_id
      WHERE a.group_id = ? ORDER BY a.created_at DESC LIMIT ?`,
    [groupId, limit],
  );
  return rows.map((r) => ({ ...r, result: JSON.parse(r.result) as AnalysisResult }));
}

// ---------- Tiện ích ----------

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
