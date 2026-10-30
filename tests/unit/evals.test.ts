import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/analysis";
import { caseToContext, loadCases } from "../../evals/run";
import { EvalCaseSchema, type EvalCase } from "../../evals/schema";
import { normalizeVi, scoreCase, summarize } from "../../evals/scoring";

const task = (p: Partial<Task> & { title: string }): Task => ({
  assignee: "Chưa rõ",
  requester: "Chưa rõ",
  deadline: "Không có",
  priority: "unknown",
  status: "todo",
  evidence: "",
  ...p,
});

const baseCase = (p: Partial<EvalCase>): EvalCase =>
  EvalCaseSchema.parse({
    id: "t",
    description: "ca thử",
    now: "2026-10-29 18:00",
    template: "tasks",
    messages: [{ at: "2026-10-29 08:00", from: "A", text: "x" }],
    expected: [],
    ...p,
  });

describe("normalizeVi", () => {
  it("bỏ dấu, chữ thường, đ -> d", () => {
    expect(normalizeVi("  Báo GIÁ   Đơn hàng ")).toBe("bao gia don hang");
  });
});

describe("scoreCase", () => {
  const c = baseCase({
    expected: [
      { keywords: ["bao gia"], assignee: "Tuấn", status: "open", deadline: "30/10/2026" },
      { keywords: ["hop dong"], status: "done" },
    ],
    forbidden: [["sinh nhat"]],
  });

  it("khớp đủ, đúng trường => không lỗi", () => {
    const s = scoreCase(c, [
      task({ title: "Làm báo giá Phú Thái", assignee: "Tuấn", status: "in_progress", deadline: "30/10/2026 17:00" }),
      task({ title: "Gửi hợp đồng scan", status: "done" }),
    ]);
    expect(s).toMatchObject({ tp: 2, fp: 0, fn: 0, forbiddenHits: [] });
    expect([...s.fields.assignee, ...s.fields.status, ...s.fields.deadline].every((f) => f.ok)).toBe(true);
  });

  it("đếm bỏ sót, thừa, vi phạm cấm và sai trường", () => {
    const s = scoreCase(c, [
      task({ title: "Báo giá", assignee: "Hùng", status: "done", deadline: "29/10/2026" }),
      task({ title: "Mua bánh sinh nhật" }),
    ]);
    expect(s).toMatchObject({ tp: 1, fp: 1, fn: 1, missing: ["hop dong"], extra: ["Mua bánh sinh nhật"] });
    expect(s.forbiddenHits).toHaveLength(1);
    expect(s.fields.assignee[0].ok).toBe(false);
    expect(s.fields.status[0].ok).toBe(false);
    expect(s.fields.deadline[0].ok).toBe(false);
  });

  it("khớp theo ranh giới từ: 'gia' không khớp 'giao'", () => {
    const g = baseCase({ expected: [{ keywords: ["gia"], status: "any" }] });
    expect(scoreCase(g, [task({ title: "Liên hệ đơn giao trễ" })]).tp).toBe(0);
    expect(scoreCase(g, [task({ title: "Cập nhật giá sản phẩm" })]).tp).toBe(1);
  });

  it("mỗi việc dự đoán chỉ ghép với một đáp án", () => {
    const dup = baseCase({ expected: [{ keywords: ["bao cao"], status: "any" }, { keywords: ["bao cao"], status: "any" }] });
    expect(scoreCase(dup, [task({ title: "Báo cáo tuần" })])).toMatchObject({ tp: 1, fn: 1 });
  });

  it("deadline 'none' chấp nhận 'Không có' / 'Chưa rõ'", () => {
    const n = baseCase({ expected: [{ keywords: ["slide"], deadline: "none", status: "any" }] });
    expect(scoreCase(n, [task({ title: "Slide", deadline: "Chưa rõ" })]).fields.deadline[0].ok).toBe(true);
    expect(scoreCase(n, [task({ title: "Slide", deadline: "30/10/2026" })]).fields.deadline[0].ok).toBe(false);
  });

  it("ca không có việc nào: trả rỗng là đúng hoàn toàn", () => {
    const empty = baseCase({ expected: [] });
    expect(summarize([scoreCase(empty, [])])).toMatchObject({ precision: 1, recall: 1, f1: 1 });
  });
});

describe("summarize", () => {
  it("micro-average trên nhiều ca", () => {
    const sum = summarize([
      { id: "a", tp: 3, fp: 1, fn: 0, forbiddenHits: [], missing: [], extra: [], fields: { assignee: [], status: [], deadline: [] } },
      { id: "b", tp: 1, fp: 0, fn: 2, forbiddenHits: ["x"], missing: [], extra: [], fields: { assignee: [], status: [], deadline: [] } },
    ]);
    expect(sum.precision).toBeCloseTo(4 / 5);
    expect(sum.recall).toBeCloseTo(4 / 6);
    expect(sum.forbiddenHits).toBe(1);
    expect(sum.assigneeAcc).toBeNull();
  });
});

describe("bộ dữ liệu eval (kiểm tra offline, không gọi AI)", () => {
  const cases = loadCases();

  it("có ít nhất 10 ca, id không trùng", () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s: từ khóa đáp án có trong tin nhắn, bản ghi hợp lệ", (_id, c) => {
    const corpus = normalizeVi(c.messages.map((m) => m.text).join(" "));
    for (const exp of c.expected) {
      for (const k of exp.keywords) expect(corpus, `từ khóa "${k}" không có trong tin nhắn`).toContain(normalizeVi(k));
    }
    const ctx = caseToContext(c);
    expect(ctx.text).toContain("TIN NHẮN");
    expect(ctx.system).toContain(c.group);
    expect(c.messages.every((m) => m.at <= c.now)).toBe(true);
  });
});

