"use client";

import Link from "@/app/components/ActionLink";
import { useEffect, useState } from "react";
import { z } from "zod";
import AppNav from "@/app/components/AppNav";
import { apiFetch } from "@/lib/api-fetch";
import { useRegisterActions } from "@/app/components/ActionProvider";
import { defineAction, type AnyAction } from "@/lib/actions";

type Template = {
  id: number;
  kind: "gross" | "report";
  specimenType: string;
  schema: unknown;
  defaultText: string | null;
};
type TemplateField = {
  key: string;
  label: string;
  type: "text" | "number" | "choice";
  unit: string;
  defaultText: string;
};
const blank = {
  id: undefined as number | undefined,
  kind: "gross" as "gross" | "report",
  specimenType: "",
  fields: [] as TemplateField[],
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
      fields: Array.isArray((item.schema as { fields?: unknown[] })?.fields)
        ? (
            item.schema as { fields: Array<string | Partial<TemplateField>> }
          ).fields.map((field) =>
            typeof field === "string"
              ? {
                  key: field,
                  label: field,
                  type: "text" as const,
                  unit: "",
                  defaultText: "",
                }
              : {
                  key: field.key || "",
                  label: field.label || field.key || "",
                  type: field.type || "text",
                  unit: field.unit || "",
                  defaultText: field.defaultText || "",
                },
          )
        : [],
      defaultText: item.defaultText || "",
    });
    setReview(false);
  }
  async function save() {
    try {
      const schema = { fields: form.fields };
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
  const screenActions: AnyAction[] = [
    defineAction({
      id: "edit_template",
      description: "Load a template into the editor.",
      args: z.object({ id: z.number().int().positive() }),
      screens: ["templates"],
      risk: "safe",
      describe: ({ id }) => `Edit template ${id}`,
      run: ({ id }) => {
        const item = templates.find((value) => value.id === id);
        if (!item) throw new Error("Template not found.");
        edit(item);
      },
    }),
    defineAction({
      id: "set_template_field",
      description: "Set one template editor field.",
      args: z.object({
        field: z.enum(["kind", "specimenType", "defaultText"]),
        value: z.string(),
      }),
      screens: ["templates"],
      risk: "safe",
      describe: ({ field }) => `Edit template ${field}`,
      run: ({ field, value }) =>
        setForm((current) => ({ ...current, [field]: value })),
    }),
    defineAction({
      id: "add_template_field",
      description: "Add a structured template field.",
      args: z.object({}),
      screens: ["templates"],
      risk: "safe",
      describe: () => "Add template field",
      run: () =>
        setForm((current) => ({
          ...current,
          fields: [
            ...current.fields,
            { key: "", label: "", type: "text", unit: "", defaultText: "" },
          ],
        })),
    }),
    defineAction({
      id: "remove_template_field",
      description: "Remove a structured template field.",
      args: z.object({ index: z.number().int().nonnegative() }),
      screens: ["templates"],
      risk: "safe",
      describe: () => "Remove template field",
      run: ({ index }) =>
        setForm((current) => ({
          ...current,
          fields: current.fields.filter((_, itemIndex) => itemIndex !== index),
        })),
    }),
    defineAction({
      id: "set_template_field_definition",
      description: "Edit a structured template field.",
      args: z.object({
        index: z.number().int().nonnegative(),
        field: z.enum(["key", "label", "type", "unit", "defaultText"]),
        value: z.string(),
      }),
      screens: ["templates"],
      risk: "safe",
      describe: ({ field }) => `Edit template field ${field}`,
      run: ({ index, field, value }) =>
        setForm((current) => ({
          ...current,
          fields: current.fields.map((item, itemIndex) =>
            itemIndex === index ? { ...item, [field]: value } : item,
          ),
        })),
    }),
    defineAction({
      id: "review_template",
      description: "Review the template before saving.",
      args: z.object({}),
      screens: ["templates"],
      risk: "safe",
      describe: () => "Review template",
      run: () => setReview(true),
    }),
    defineAction({
      id: "edit_template_form",
      description: "Return to template editing.",
      args: z.object({}),
      screens: ["templates"],
      risk: "safe",
      describe: () => "Edit template",
      run: () => setReview(false),
    }),
    defineAction({
      id: "save_template",
      description: "Save this template.",
      args: z.object({}),
      screens: ["templates"],
      risk: "confirm",
      describe: () => `Save ${form.kind} template for ${form.specimenType}`,
      run: save,
    }),
  ];
  const actions = useRegisterActions("templates", screenActions, () => ({
    screenId: "templates",
    template: form,
    mode: review ? "review" : "edit",
    modal: null,
  }));
  return (
    <main className="app-shell">
      <Link data-action="navigate" href="/settings" className="back">
        ← Settings
      </Link>
      <div className="eyebrow">GROSS &amp; REPORT</div>
      <h1>Template manager</h1>
      <div className="template-list">
        {templates.map((item) => (
          <button
            data-action="edit_template"
            className="case-row"
            key={item.id}
            onClick={() => void actions.run("edit_template", { id: item.id })}
          >
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
          data-action="set_template_field"
          value={form.kind}
          onChange={(event) =>
            void actions.run("set_template_field", {
              field: "kind",
              value: event.target.value,
            })
          }
        >
          <option value="gross">Gross</option>
          <option value="report">Report</option>
        </select>
        <input
          data-action="set_template_field"
          value={form.specimenType}
          onChange={(event) =>
            void actions.run("set_template_field", {
              field: "specimenType",
              value: event.target.value,
            })
          }
          placeholder="Specimen type"
        />
        <div className="form-stack">
          <h3>Fields</h3>
          {form.fields.map((field, index) => (
            <div className="detail-card form-stack" key={index}>
              <input
                data-action="set_template_field_definition"
                value={field.key}
                placeholder="Key"
                onChange={(event) =>
                  void actions.run("set_template_field_definition", {
                    index,
                    field: "key",
                    value: event.target.value,
                  })
                }
              />
              <input
                data-action="set_template_field_definition"
                value={field.label}
                placeholder="Label"
                onChange={(event) =>
                  void actions.run("set_template_field_definition", {
                    index,
                    field: "label",
                    value: event.target.value,
                  })
                }
              />
              <select
                data-action="set_template_field_definition"
                value={field.type}
                onChange={(event) =>
                  void actions.run("set_template_field_definition", {
                    index,
                    field: "type",
                    value: event.target.value,
                  })
                }
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="choice">Choice</option>
              </select>
              <input
                data-action="set_template_field_definition"
                value={field.unit}
                placeholder="Unit, optional"
                onChange={(event) =>
                  void actions.run("set_template_field_definition", {
                    index,
                    field: "unit",
                    value: event.target.value,
                  })
                }
              />
              <input
                data-action="set_template_field_definition"
                value={field.defaultText}
                placeholder="Default text"
                onChange={(event) =>
                  void actions.run("set_template_field_definition", {
                    index,
                    field: "defaultText",
                    value: event.target.value,
                  })
                }
              />
              <button
                className="secondary"
                data-action="remove_template_field"
                onClick={() =>
                  void actions.run("remove_template_field", { index })
                }
              >
                Remove field
              </button>
            </div>
          ))}
          <button
            className="secondary"
            data-action="add_template_field"
            onClick={() => void actions.run("add_template_field")}
          >
            Add field
          </button>
        </div>
        <label className="field-label">
          Default text
          <textarea
            data-action="set_template_field"
            value={form.defaultText}
            onChange={(event) =>
              void actions.run("set_template_field", {
                field: "defaultText",
                value: event.target.value,
              })
            }
          />
        </label>
        <section className="readback">
          <h3>Preview</h3>
          {form.fields.map((field) => (
            <p key={field.key || field.label}>
              <b>{field.label || field.key || "Unnamed field"}</b>
              {field.unit ? ` (${field.unit})` : ""}:{" "}
              {field.defaultText || "Not recorded"}
            </p>
          ))}
        </section>
        {review ? (
          <div className="readback">
            <p>
              Save the {form.kind} template for {form.specimenType}?
            </p>
            <div className="gross-actions">
              <button
                data-action="edit_template_form"
                className="secondary"
                onClick={() => void actions.run("edit_template_form")}
              >
                Edit
              </button>
              <button
                data-action="save_template"
                className="primary"
                onClick={() => void actions.run("save_template")}
              >
                Confirm and save
              </button>
            </div>
          </div>
        ) : (
          <button
            className="primary"
            data-action="review_template"
            disabled={!form.specimenType.trim()}
            onClick={() => void actions.run("review_template")}
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
