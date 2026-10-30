import type { Task } from "../src/lib/analysis";
import type { EvalCase } from "./schema";

/** Chữ thường, bỏ dấu tiếng Việt, gộp khoảng trắng: "Báo Giá  Đơn" -> "bao gia don". */
export function normalizeVi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Khớp theo ranh giới từ: "gia" khớp "cập nhật giá" nhưng KHÔNG khớp "giao hàng". */
const hasAll = (text: string, keywords: string[]) => {
  const t = normalizeVi(text);
  return keywords.every((k) => new RegExp(`(^|[^a-z0-9])${escapeRe(normalizeVi(k))}([^a-z0-9]|$)`).test(t));
};

const NO_DEADLINE = ["", "khong co", "chua ro", "none", "n/a"];

export type FieldCheck = { ok: boolean; expected: string; got: string };

export type CaseScore = {
  id: string;
  tp: number;
  fp: number;
  fn: number;
  forbiddenHits: string[];
  missing: string[];
  extra: string[];
  fields: { assignee: FieldCheck[]; status: FieldCheck[]; deadline: FieldCheck[] };
};

/**
 * So khớp việc AI trả về với đáp án (ghép cặp 1-1, tham lam theo thứ tự đáp án).
 * - tp: việc kỳ vọng được tìm thấy
 * - fn: việc kỳ vọng bị bỏ sót
 * - fp: việc AI tự thêm không khớp đáp án nào (kể cả việc bị cấm)
 */
export function scoreCase(c: EvalCase, predicted: Task[]): CaseScore {
  const used = new Set<number>();
  const score: CaseScore = {
    id: c.id,
    tp: 0,
    fp: 0,
    fn: 0,
    forbiddenHits: [],
    missing: [],
    extra: [],
    fields: { assignee: [], status: [], deadline: [] },
  };

  for (const exp of c.expected) {
    const idx = predicted.findIndex((p, i) => !used.has(i) && hasAll(p.title, exp.keywords));
    if (idx < 0) {
      score.fn++;
      score.missing.push(exp.keywords.join(" + "));
      continue;
    }
    used.add(idx);
    score.tp++;
    const p = predicted[idx];

    if (exp.assignee) {
      score.fields.assignee.push({
        ok: normalizeVi(p.assignee).includes(normalizeVi(exp.assignee)),
        expected: exp.assignee,
        got: p.assignee,
      });
    }
    if (exp.status !== "any") {
      const ok = exp.status === "open" ? p.status === "todo" || p.status === "in_progress" : p.status === exp.status;
      score.fields.status.push({ ok, expected: exp.status, got: p.status });
    }
    if (exp.deadline) {
      const got = normalizeVi(p.deadline ?? "");
      const ok = exp.deadline === "none" ? NO_DEADLINE.includes(got) : got.includes(normalizeVi(exp.deadline));
      score.fields.deadline.push({ ok, expected: exp.deadline, got: p.deadline });
    }
  }

  predicted.forEach((p, i) => {
    if (used.has(i)) return;
    score.fp++;
    score.extra.push(p.title);
  });

  for (const set of c.forbidden) {
    const hit = predicted.find((p) => hasAll(p.title, set));
    if (hit) score.forbiddenHits.push(`${set.join(" + ")} ← "${hit.title}"`);
  }
  return score;
}

export type Summary = {
  cases: number;
  precision: number;
  recall: number;
  f1: number;
  assigneeAcc: number | null;
  statusAcc: number | null;
  deadlineAcc: number | null;
  forbiddenHits: number;
};

const ratio = (checks: FieldCheck[]) => (checks.length ? checks.filter((c) => c.ok).length / checks.length : null);

/** Gộp điểm nhiều ca (micro-average). */
export function summarize(scores: CaseScore[]): Summary {
  const tp = scores.reduce((s, x) => s + x.tp, 0);
  const fp = scores.reduce((s, x) => s + x.fp, 0);
  const fn = scores.reduce((s, x) => s + x.fn, 0);
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const all = (k: keyof CaseScore["fields"]) => scores.flatMap((s) => s.fields[k]);
  return {
    cases: scores.length,
    precision,
    recall,
    f1,
    assigneeAcc: ratio(all("assignee")),
    statusAcc: ratio(all("status")),
    deadlineAcc: ratio(all("deadline")),
    forbiddenHits: scores.reduce((s, x) => s + x.forbiddenHits.length, 0),
  };
}
