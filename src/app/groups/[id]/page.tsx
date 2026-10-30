"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { addDays, api, formatDateTime, formatTime, todayVN } from "@/components/client-api";
import { AnalysisView, ReportView } from "@/components/Results";
import type { AnalysisResult, Period, PeriodReport } from "@/lib/analysis";
import type { StoredMessage } from "@/lib/messages";
import type { Template } from "@/lib/templates";

type Tab = "messages" | "report" | "analyze" | "ask" | "import";
const TABS: { id: Tab; label: string }[] = [
  { id: "messages", label: "Tin nhắn" },
  { id: "report", label: "Báo cáo" },
  { id: "analyze", label: "Theo mẫu" },
  { id: "ask", label: "Hỏi AI" },
  { id: "import", label: "Nhập tay" },
];

type HistoryItem = {
  id: string;
  template_name: string | null;
  question: string | null;
  range_from: string;
  range_to: string;
  result: AnalysisResult;
  created_at: number;
};

function ErrorBox({ error }: { error: string }) {
  return error ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null;
}

// ---------- Tab: Tin nhắn ----------

function MessagesTab({ groupId }: { groupId: string }) {
  const [day, setDay] = useState(todayVN());
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<StoredMessage[]>(`/api/groups/${groupId}/messages?day=${day}`)
      .then(setMessages)
      .finally(() => setLoading(false));
  }, [groupId, day]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn-ghost" onClick={() => setDay(addDays(day, -1))}>
          ←
        </button>
        <input type="date" className="input" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button className="btn-ghost" onClick={() => setDay(addDays(day, 1))}>
          →
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-slate-500">Không có tin nhắn trong ngày này.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li key={m.id} className="rounded-xl bg-white p-3 shadow-sm">
              <div className="flex justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">{m.sender_name}</span>
                <span>{formatTime(m.ts)}</span>
              </div>
              {m.quote_text && (
                <p className="mt-1 border-l-2 border-slate-300 pl-2 text-xs text-slate-500">
                  {m.quote_sender}: {m.quote_text}
                </p>
              )}
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {m.recalled ? <i className="text-slate-400">Tin nhắn đã thu hồi</i> : m.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Tab: Báo cáo Ngày / Tháng / Năm ----------

function ReportTab({ groupId }: { groupId: string }) {
  const today = todayVN();
  const [period, setPeriod] = useState<Period>("day");
  const [keys, setKeys] = useState({ day: today, month: today.slice(0, 7), year: today.slice(0, 4) });
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const key = keys[period];

  async function load(force = false) {
    setLoading(true);
    setError("");
    setReport(null);
    try {
      setReport(await api<PeriodReport>(`/api/groups/${groupId}/summary`, { method: "POST", body: { period, key, force } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {(["day", "month", "year"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => {
              setPeriod(p);
              setReport(null);
            }}
            className={`flex-1 rounded-lg py-1.5 text-sm ${period === p ? "bg-white font-medium shadow" : "text-slate-600"}`}
          >
            {p === "day" ? "Ngày" : p === "month" ? "Tháng" : "Năm"}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {period === "day" && (
          <input type="date" className="input" value={keys.day} onChange={(e) => setKeys({ ...keys, day: e.target.value })} />
        )}
        {period === "month" && (
          <input type="month" className="input" value={keys.month} onChange={(e) => setKeys({ ...keys, month: e.target.value })} />
        )}
        {period === "year" && (
          <input
            type="number"
            className="input"
            min={2015}
            max={2100}
            value={keys.year}
            onChange={(e) => setKeys({ ...keys, year: e.target.value })}
          />
        )}
        <button className="btn-primary shrink-0" disabled={loading || !key} onClick={() => load(false)}>
          {loading ? "Đang phân tích..." : "Xem báo cáo"}
        </button>
      </div>
      {period !== "day" && (
        <p className="text-xs text-slate-500">
          Báo cáo {period === "month" ? "tháng" : "năm"} được tổng hợp từ các bản tóm tắt ngày. Lần đầu có thể mất 1–3 phút,
          các lần sau dùng lại kết quả đã lưu.
        </p>
      )}
      <ErrorBox error={error} />
      {report && (
        <div className="card space-y-3">
          <ReportView report={report} />
          <button className="btn-ghost w-full" disabled={loading} onClick={() => load(true)}>
            Phân tích lại
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Khoảng thời gian dùng chung ----------

const PRESETS: { label: string; from: (t: string) => string; to?: (t: string) => string }[] = [
  { label: "Hôm nay", from: (t) => t },
  { label: "Hôm qua", from: (t) => addDays(t, -1), to: (t) => addDays(t, -1) },
  { label: "7 ngày", from: (t) => addDays(t, -6) },
  { label: "30 ngày", from: (t) => addDays(t, -29) },
  { label: "Tháng này", from: (t) => `${t.slice(0, 7)}-01` },
];

function RangePicker({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) {
  const today = todayVN();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
            onClick={() => onChange(p.from(today), p.to ? p.to(today) : today)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="label">Từ ngày</span>
          <input type="date" className="input" value={from} onChange={(e) => onChange(e.target.value, to)} />
        </div>
        <div>
          <span className="label">Đến ngày</span>
          <input type="date" className="input" value={to} onChange={(e) => onChange(from, e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function History({ items, filter }: { items: HistoryItem[]; filter: "template" | "question" }) {
  const list = items.filter((i) => (filter === "template" ? i.template_name : i.question));
  if (list.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-600">Lần trước</h3>
      {list.map((h) => (
        <details key={h.id} className="card">
          <summary className="cursor-pointer text-sm">
            <b>{h.template_name || h.question}</b>
            <span className="block text-xs text-slate-500">
              {h.range_from} → {h.range_to} · {formatDateTime(h.created_at)}
            </span>
          </summary>
          <div className="mt-3">
            <AnalysisView result={h.result} />
          </div>
        </details>
      ))}
    </section>
  );
}

// ---------- Tab: Phân tích theo mẫu ----------

function AnalyzeTab({ groupId, history, onDone }: { groupId: string; history: HistoryItem[]; onDone: () => void }) {
  const today = todayVN();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("tasks");
  const [range, setRange] = useState({ from: today, to: today });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Template[]>("/api/templates").then(setTemplates);
  }, []);

  async function run() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const out = await api<{ result: AnalysisResult }>(`/api/groups/${groupId}/analyses`, {
        method: "POST",
        body: { templateId, ...range },
      });
      setResult(out.result);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const selected = templates.find((t) => t.id === templateId);
  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div>
          <span className="label">Mẫu phân tích</span>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.builtin ? "" : " (tự tạo)"}
              </option>
            ))}
          </select>
          {selected && <p className="mt-1 text-xs text-slate-500">{selected.description}</p>}
        </div>
        <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <button className="btn-primary w-full" disabled={loading} onClick={run}>
          {loading ? "Gemini đang phân tích..." : "Phân tích"}
        </button>
      </div>
      <ErrorBox error={error} />
      {result && (
        <div className="card">
          <AnalysisView result={result} />
        </div>
      )}
      <History items={history} filter="template" />
    </div>
  );
}

// ---------- Tab: Hỏi tự do ----------

function AskTab({ groupId, history, onDone }: { groupId: string; history: HistoryItem[]; onDone: () => void }) {
  const today = todayVN();
  const [question, setQuestion] = useState("");
  const [range, setRange] = useState({ from: addDays(today, -6), to: today });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const out = await api<{ result: AnalysisResult }>(`/api/groups/${groupId}/analyses`, {
        method: "POST",
        body: { question, ...range },
      });
      setResult(out.result);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={run} className="card space-y-3">
        <textarea
          className="input min-h-24"
          placeholder="Ví dụ: Anh Minh giao cho tôi những việc gì mà chưa báo xong?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <RangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <button className="btn-primary w-full" disabled={loading || question.trim().length < 3}>
          {loading ? "Đang suy nghĩ..." : "Hỏi"}
        </button>
      </form>
      <ErrorBox error={error} />
      {result && (
        <div className="card">
          <AnalysisView result={result} />
        </div>
      )}
      <History items={history} filter="question" />
    </div>
  );
}

// ---------- Tab: Nhập tay ----------

function ImportTab({ groupId }: { groupId: string }) {
  const [day, setDay] = useState(todayVN());
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      await api(`/api/groups/${groupId}/import`, { method: "POST", body: { day, text } });
      setText("");
      setStatus("✅ Đã lưu. Đoạn chat sẽ được dùng trong báo cáo và phân tích của ngày này.");
    } catch (err) {
      setStatus(`❌ ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <p className="text-sm text-slate-600">
        Dùng để bổ sung tin nhắn <b>trước khi bot vào nhóm</b>, hoặc khi bot tạm mất kết nối. Copy đoạn chat từ Zalo
        (PC hoặc điện thoại) rồi dán vào đây.
      </p>
      <div>
        <span className="label">Ngày của đoạn chat</span>
        <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <textarea
        className="input min-h-48 font-mono text-xs"
        placeholder="Dán đoạn chat vào đây..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {status && <p className="text-sm">{status}</p>}
      <button className="btn-primary w-full" disabled={loading || !text.trim()}>
        Lưu đoạn chat
      </button>
    </form>
  );
}

// ---------- Trang ----------

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<Tab>("report");
  const [name, setName] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = useCallback(() => {
    api<HistoryItem[]>(`/api/groups/${id}/analyses`).then(setHistory).catch(() => {});
  }, [id]);

  useEffect(() => {
    api<{ name: string }>(`/api/groups/${id}`)
      .then((g) => setName(g.name))
      .catch(() => {});
    loadHistory();
  }, [id, loadHistory]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="btn-ghost px-3">
          ←
        </Link>
        <h1 className="truncate text-lg font-bold">{name || "Nhóm"}</h1>
      </header>

      <nav className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto bg-slate-50/95 px-4 py-2 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${
              tab === t.id ? "bg-blue-600 text-white" : "bg-white text-slate-600 shadow-sm"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "messages" && <MessagesTab groupId={id} />}
      {tab === "report" && <ReportTab groupId={id} />}
      {tab === "analyze" && <AnalyzeTab groupId={id} history={history} onDone={loadHistory} />}
      {tab === "ask" && <AskTab groupId={id} history={history} onDone={loadHistory} />}
      {tab === "import" && <ImportTab groupId={id} />}
    </main>
  );
}

