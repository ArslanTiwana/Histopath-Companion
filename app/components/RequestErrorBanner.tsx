"use client";

import { useEffect, useState } from "react";
import { useActions } from "@/app/components/ActionProvider";

export default function RequestErrorBanner() {
  const actions = useActions();
  const [message, setMessage] = useState("");
  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setMessage(
        detail && "message" in detail
          ? detail.message || ""
          : "The request failed. Please try again.",
      );
    };
    window.addEventListener("app-request-error", show);
    return () => window.removeEventListener("app-request-error", show);
  }, []);
  if (!message) return null;
  return (
    <aside className="request-error" role="alert" aria-live="assertive">
      <span>{message}</span>
      <button
        className="secondary small"
        type="button"
        data-action="retry_screen"
        onClick={() => void actions.run("retry_screen")}
      >
        Retry
      </button>
    </aside>
  );
}
