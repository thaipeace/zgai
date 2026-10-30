"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/client-api";
import type { Template, TemplateOutput } from "@/lib/templates";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({ name: "", description: "", instruction: "", output: "markdown" as TemplateOutput });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<Template[]>("/api/templates").then(setTemplates);
  }, []);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/templates", { method: "POST", body: form });
      setForm({ name: "", description: "", instruction: "", output: "markdown" });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: Template) {
    if (!confirm(`Xóa mẫu "${t.name}"?`)) return;
    await api(`/api/templates/${t.id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="btn-ghost px-3">
          ←
        </Link>
        <h1 className="text-lg font-bold">Mẫu phân tích</h1>
      </header>

      <ul className="space-y-2">
        {templates.map((t) => (
          <li key={t.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {t.name}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    {t.output === "tasks" ? "· danh sách việc" : "· văn bản"}
                    {t.builtin ? " · có sẵn" : ""}
                  </span>
                </p>
                <p className="text-sm text-slate-600">{t.description}</p>
              </div>
              {!t.builtin && (
                <button className="btn-danger shrink-0 px-3 py-1" onClick={() => remove(t)}>
                  Xóa
                </button>
              )}
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-400">Yêu cầu gửi cho AI</summary>
              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{t.instruction}</p>
            </details>
          </li>
        ))}
      </ul>

      <form onSubmit={create} className="card space-y-3">
        <h2 className="font-semibold">Tạo mẫu mới</h2>
        <div>
          <span className="label">Tên mẫu</span>
          <input
            className="input"
            placeholder="Ví dụ: Tổng hợp đơn hàng"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <span className="label">Mô tả ngắn</span>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <span className="label">Yêu cầu cho AI</span>
          <textarea
            className="input min-h-28"
            placeholder="Ví dụ: Liệt kê các đơn hàng được nhắc tới: mã đơn, khách hàng, yêu cầu, người xử lý, tình trạng. Trình bày dạng bảng."
            value={form.instruction}
            onChange={(e) => setForm({ ...form, instruction: e.target.value })}
          />
        </div>
        <div>
          <span className="label">Kiểu kết quả</span>
          <select
            className="input"
            value={form.output}
            onChange={(e) => setForm({ ...form, output: e.target.value as TemplateOutput })}
          >
            <option value="markdown">Văn bản / bảng tự do</option>
            <option value="tasks">Danh sách việc (người làm, hạn chót, trạng thái)</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={saving || !form.name || form.instruction.length < 10}>
          Lưu mẫu
        </button>
      </form>
    </main>
  );
}

