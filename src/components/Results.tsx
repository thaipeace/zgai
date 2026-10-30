"use client";

import type { AnalysisResult, PeriodReport, Task } from "@/lib/analysis";
import { Markdown } from "./Markdown";

const STATUS: Record<Task["status"], { label: string; cls: string }> = {
  todo: { label: "Chưa làm", cls: "bg-amber-100 text-amber-800" },
  in_progress: { label: "Đang làm", cls: "bg-blue-100 text-blue-800" },
  done: { label: "Xong", cls: "bg-emerald-100 text-emerald-800" },
  unknown: { label: "Chưa rõ", cls: "bg-slate-100 text-slate-600" },
};

const PRIORITY: Record<Task["priority"], string> = {
  high: "🔴 Cao",
  medium: "🟠 Vừa",
  low: "🟢 Thấp",
  unknown: "",
};

export function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return <p className="text-sm text-slate-500">Không có đầu việc nào.</p>;
  return (
    <ul className="space-y-2">
      {tasks.map((t, i) => (
        <li key={i} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{t.title}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS[t.status].cls}`}>
              {STATUS[t.status].label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>👤 {t.assignee}</span>
            <span>📣 {t.requester}</span>
            {t.deadline && t.deadline !== "Không có" && <span>⏰ {t.deadline}</span>}
            {PRIORITY[t.priority] && <span>{PRIORITY[t.priority]}</span>}
          </div>
          {t.evidence && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-slate-400">Tin nhắn gốc</summary>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{t.evidence}</p>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export function ReportView({ report }: { report: PeriodReport }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">{report.summary}</p>
      <Bullets title="✨ Điểm chính" items={report.highlights} />
      <Bullets title="⚠️ Vướng mắc" items={report.blockers} />
      <Bullets title="✅ Quyết định" items={report.decisions} />
      <div>
        <h3 className="mb-2 text-sm font-semibold">📋 Đầu việc ({report.tasks.length})</h3>
        <TaskList tasks={report.tasks} />
      </div>
    </div>
  );
}

export function AnalysisView({ result }: { result: AnalysisResult }) {
  return (
    <div className="space-y-3">
      {result.basedOn === "summaries" && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          Khoảng thời gian dài nên AI dựa trên bản tóm tắt theo ngày, có thể thiếu chi tiết nhỏ.
        </p>
      )}
      {result.kind === "tasks" ? (
        <>
          <p className="text-sm">{result.summary}</p>
          <TaskList tasks={result.tasks} />
        </>
      ) : (
        <Markdown>{result.markdown}</Markdown>
      )}
    </div>
  );
}

