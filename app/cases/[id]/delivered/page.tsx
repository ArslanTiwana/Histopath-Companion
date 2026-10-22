"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppNav from "@/app/components/AppNav";

type Data = {
  caseLabel: string;
  status: string;
  locked: boolean;
  deliveredAt: string | null;
  steps: {
    id: number;
    step: string;
    status: string;
    completedAt: string | null;
  }[];
};
const stepNames: Record<string, string> = {
  gross: "Gross",
  micro: "Micro",
  consultant: "Consultant",
  report: "Report approved",
  typist: "Typist confirmed",
  delivered: "Delivered",
};

export default function DeliveredPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<Data | null>(null);
  useEffect(() => {
    fetch(`/api/cases/${params.id}/delivered`)
      .then((r) => r.json())
      .then(setItem);
  }, [params.id]);
  if (!item) return <main className="app-shell">Loading…</main>;
  return (
    <main className="app-shell">
      <header>
        <div>
          <div className="eyebrow">LOCKED</div>
          <h1>Delivered · {item.caseLabel}</h1>
        </div>
        <span className="delivered-pill">✓ Delivered</span>
      </header>
      <p className="delivery-time">
        Delivered{" "}
        {item.deliveredAt ? new Date(item.deliveredAt).toLocaleString() : ""}
      </p>
      <section className="delivery-timeline">
        {item.steps
          .filter((step) => step.status === "done")
          .map((step) => (
            <div key={step.id}>
              <span>✓</span>
              <b>{stepNames[step.step] || step.step}</b>
              <time>
                {step.completedAt
                  ? new Date(step.completedAt).toLocaleString()
                  : "Complete"}
              </time>
            </div>
          ))}
      </section>
      <p className="locked-note">
        🔒 Locked. Changes need an unlock with a reason, which is logged.
      </p>
      <Link className="primary wide" href="/">
        Back to worklist
      </Link>
      <AppNav active="cases" />
    </main>
  );
}
