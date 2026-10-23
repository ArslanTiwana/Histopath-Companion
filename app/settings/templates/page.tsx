"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";
import { apiFetch } from "@/lib/api-fetch";

type Template = {
  id: number;
  kind: "gross" | "report";
  specimenType: string;
  schema: unknown;
  defaultText: string | null;
};
const blank = {
  id: undefined as number | undefined,
  kind: "gross" as "gross" | "report",
  specimenType: "",
  schemaText: "{}",
  defaultText: "",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState(blank);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    setTemplates(await apiFetch<Template[]>("/api/templates"));
  }
  useEffect(() => {
    void load();
  }, []);
  function edit(item: Template) {
    setForm({
      id: item.id,
      kind: item.kind,
      specimenType: item.specimenType,
      schemaText: JSON.stringify(item.schema, null, 2),
      defaultText: item.defaultText || "",
    });
    setReview(false);
  }
  async function save() {
    try {
      const schema = JSON.parse(form.schemaText) as unknown;
      await apiFetch<Template>("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          kind: form.kind,
          specimenType: form.specimenType,
          schema,
          defaultText: form.defaultText,
        }),
      });
      setMessage("Template saved");
      setForm(blank);
      setReview(false);
      await load();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Schema must be valid JSON",
      );
    }
  }
  return (
    <main className="app-shell">
      <Link href="/settings" className="back">
        ← Settings
      </Link>
      <div className="eyebrow">GROSS &amp; REPORT</div>
      <h1>Template manager</h1>
      <div className="template-list">
        {templates.map((item) => (
          <button className="case-row" key={item.id} onClick={() => edit(item)}>
            <div>
              <strong>{item.specimenType}</strong>
              <span>{item.kind} template</span>
            </div>
            <span> Edit ›</span>
          </button>
        ))}
      </div>
      <section className="detail-card form-stack">
        <h3>{form.id ? "Edit template" : "New template"}</h3>
        <select
          value={form.kind}
          onChange={(event) =>
            setForm({ ...form, kind: event.target.value as "gross" | "report" })
          }
        >
          <option value="gross">Gross</option>
          <option value="report">Report</option>
        </select>
        <input
          value={form.specimenType}
          onChange={(event) =>
            setForm({ ...form, specimenType: event.target.value })
          }
          placeholder="Specimen type"
        />
        <label className="field-label">
          Schema JSON
          <textarea
            value={form.schemaText}
            onChange={(event) =>
              setForm({ ...form, schemaText: event.target.value })
            }
          />
        </label>
        <label className="field-label">
          Default text
          <textarea
            value={form.defaultText}
            onChange={(event) =>
              setForm({ ...form, defaultText: event.target.value })
            }
          />
        </label>
        {review ? (
          <div className="readback">
            <p>
              Save the {form.kind} template for {form.specimenType}?
            </p>
            <div className="gross-actions">
              <button className="secondary" onClick={() => setReview(false)}>
                Edit
              </button>
              <button className="primary" onClick={() => void save()}>
                Confirm and save
              </button>
            </div>
          </div>
        ) : (
          <button
            className="primary"
            disabled={!form.specimenType.trim()}
            onClick={() => setReview(true)}
          >
            Review template
          </button>
        )}
      </section>
      {message && <div className="notice">{message}</div>}
      <AppNav active="settings" />
    </main>
  );
}
