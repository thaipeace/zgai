/**
 * Eval harness: đo chất lượng trích xuất việc của Gemini trên bộ ca mẫu (evals/cases/*.json).
 *
 *   npm run eval                          # chạy tất cả ca
 *   npm run eval -- --case reassignment   # chạy 1 ca
 *   npm run eval -- --repeat 3            # chạy mỗi ca 3 lần (đo độ dao động)
 *   npm run eval -- --min-f1 0.8          # exit code 1 nếu F1 < 0.8 (dùng làm cổng chất lượng)
 *   GEMINI_MODEL=gemini-3.5-flash-lite npm run eval   # so sánh model khác
 *
 * Cần GEMINI_API_KEY (đọc từ .env). Mỗi lần chạy tốn token thật (rất ít với 10 ca).
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { executeTemplate, systemPrompt, type Task } from "../src/lib/analysis";
import { config } from "../src/lib/config";
import { toTranscript, type StoredMessage } from "../src/lib/messages";
import { BUILTIN_TEMPLATES, type Template } from "../src/lib/templates";
import { dayKey } from "../src/lib/time";
import { EvalCaseSchema, type EvalCase } from "./schema";
import { scoreCase, summarize, type CaseScore } from "./scoring";

const CASES_DIR = join(process.cwd(), "evals", "cases");
const RESULTS_DIR = join(process.cwd(), "evals", "results");

export function loadCases(dir = CASES_DIR): EvalCase[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const parsed = EvalCaseSchema.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
      if (!parsed.success) throw new Error(`Ca ${f} sai định dạng: ${parsed.error.message}`);
      return parsed.data;
    });
}

const vnTime = (local: string) => new Date(`${local.replace(" ", "T")}:00+07:00`).getTime();

/** Dựng bản ghi giống hệt cách app gửi cho Gemini. */
export function caseToContext(c: EvalCase) {
  const messages: StoredMessage[] = c.messages.map((m, i) => {
    const ts = vnTime(m.at);
    return {
      id: `${c.id}-${i}`,
      group_id: c.id,
      sender_id: null,
      sender_name: m.from,
      ts,
      day: dayKey(ts),
      kind: m.kind,
      text: m.text,
      quote_sender: m.reply?.from ?? null,
      quote_text: m.reply?.text ?? null,
      recalled: m.recalled ? 1 : 0,
      source: "eval",
    };
  });
  const days = messages.map((m) => m.day).sort();
  return {
    system: systemPrompt(c.group, vnTime(c.now)),
    text: `TIN NHẮN (${days[0]} → ${days.at(-1)}):\n${toTranscript(messages)}`,
  };
}

async function runCase(c: EvalCase): Promise<{ tasks: Task[]; ms: number }> {
  const template = BUILTIN_TEMPLATES.find((t) => t.id === c.template)!;
  const ctx = caseToContext(c);
  const start = Date.now();
  const result = await executeTemplate({ ...template, builtin: 1, created_at: 0 } as Template, ctx.system, {
    basedOn: "messages",
    text: ctx.text,
  });
  if (result.kind !== "tasks") throw new Error(`Mẫu ${c.template} không trả về danh sách việc`);
  return { tasks: result.tasks, ms: Date.now() - start };
}

const pct = (x: number | null) => (x === null ? "  -  " : `${(x * 100).toFixed(0).padStart(3)}%`);

async function main() {
  const { values } = parseArgs({
    options: {
      case: { type: "string" },
      repeat: { type: "string", default: "1" },
      "min-f1": { type: "string" },
      concurrency: { type: "string", default: "3" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const cases = loadCases().filter((c) => !values.case || c.id === values.case);
  if (cases.length === 0) throw new Error(`Không có ca nào khớp "${values.case}"`);

  if (values["dry-run"]) {
    // In prompt sẽ gửi cho Gemini, không gọi API (không cần key, không tốn tiền).
    for (const c of cases) {
      const ctx = caseToContext(c);
      const tpl = BUILTIN_TEMPLATES.find((t) => t.id === c.template)!;
      console.log(`════ ${c.id} (${c.template}) ════\n[SYSTEM]\n${ctx.system}\n\n[INPUT]\nYÊU CẦU (mẫu "${tpl.name}"):\n${tpl.instruction}\n\n${ctx.text}\n`);
    }
    return;
  }
  void config.geminiApiKey; // báo lỗi sớm nếu thiếu key
  const repeat = Math.max(1, Number(values.repeat));
  const jobs = cases.flatMap((c) => Array.from({ length: repeat }, (_, r) => ({ c, r })));

  console.log(`Model: ${config.geminiModel} · ${cases.length} ca × ${repeat} lần\n`);

  const runs: Array<{ id: string; run: number; ms: number; tasks: Task[]; score: CaseScore; error?: string }> = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Number(values.concurrency) }, async () => {
      while (next < jobs.length) {
        const { c, r } = jobs[next++];
        try {
          const { tasks, ms } = await runCase(c);
          runs.push({ id: c.id, run: r, ms, tasks, score: scoreCase(c, tasks) });
        } catch (err) {
          // Lỗi API được tính là bỏ sót toàn bộ đáp án của ca đó.
          runs.push({ id: c.id, run: r, ms: 0, tasks: [], score: scoreCase(c, []), error: String(err) });
        }
      }
    }),
  );
  runs.sort((a, b) => a.id.localeCompare(b.id) || a.run - b.run);

  for (const r of runs) {
    const s = r.score;
    const fieldsOk = [...s.fields.assignee, ...s.fields.status, ...s.fields.deadline];
    const bad = fieldsOk.filter((f) => !f.ok);
    const ok = s.fn === 0 && s.fp === 0 && bad.length === 0 && !r.error;
    console.log(`${ok ? "✅" : "❌"} ${r.id}${repeat > 1 ? ` #${r.run + 1}` : ""}  tp=${s.tp} fp=${s.fp} fn=${s.fn}  ${r.ms}ms`);
    if (r.error) console.log(`     lỗi: ${r.error}`);
    for (const m of s.missing) console.log(`     thiếu: ${m}`);
    for (const e of s.extra) console.log(`     thừa:  ${e}`);
    for (const f of s.forbiddenHits) console.log(`     cấm:   ${f}`);
    for (const f of bad) console.log(`     sai:   cần "${f.expected}" nhưng AI trả "${f.got}"`);
  }

  const sum = summarize(runs.map((r) => r.score));
  console.log("\n──────── Tổng hợp ────────");
  console.log(`Precision ${pct(sum.precision)}   Recall ${pct(sum.recall)}   F1 ${pct(sum.f1)}`);
  console.log(`Người phụ trách ${pct(sum.assigneeAcc)}   Trạng thái ${pct(sum.statusAcc)}   Hạn chót ${pct(sum.deadlineAcc)}`);
  console.log(`Vi phạm danh sách cấm: ${sum.forbiddenHits}`);

  mkdirSync(RESULTS_DIR, { recursive: true });
  const file = join(RESULTS_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}_${config.geminiModel}.json`);
  writeFileSync(file, JSON.stringify({ model: config.geminiModel, repeat, summary: sum, runs }, null, 2));
  console.log(`\nChi tiết: ${file}`);

  const minF1 = values["min-f1"] ? Number(values["min-f1"]) : null;
  if (minF1 !== null && sum.f1 < minF1) {
    console.error(`\nF1 ${sum.f1.toFixed(2)} < ngưỡng ${minF1}`);
    process.exit(1);
  }
}

// Chỉ chạy khi gọi trực tiếp (test có thể import loadCases/caseToContext).
if (process.argv[1]?.replace(/\\/g, "/").endsWith("evals/run.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
