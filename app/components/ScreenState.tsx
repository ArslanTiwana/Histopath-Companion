"use client";

import { useActions } from "@/app/components/ActionProvider";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <section className="screen-state" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card short" />
    </section>
  );
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <section className="screen-state empty-state" role="status">
      <strong>{title}</strong>
      <p>{detail}</p>
    </section>
  );
}

export function ErrorState({
  title = "We could not load this screen",
  detail = "Check your connection, then try again.",
}: {
  title?: string;
  detail?: string;
}) {
  const actions = useActions();
  return (
    <section className="screen-state error-state" role="alert">
      <strong>{title}</strong>
      <p>{detail}</p>
      <button
        className="secondary"
        type="button"
        data-action="retry_screen"
        onClick={() => void actions.run("retry_screen")}
      >
        Try again
      </button>
    </section>
  );
}
