"use client";

import { useEffect } from "react";

export default function ActionAudit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const warn = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const clickable = target?.closest(
        "button, a, input, textarea, select, [role='button']",
      );
      if (
        clickable &&
        !clickable.hasAttribute("data-action") &&
        !clickable.closest(".pin-shell")
      )
        console.warn("Interactive element has no registered action", clickable);
    };
    document.addEventListener("click", warn, true);
    document.addEventListener("change", warn, true);
    return () => {
      document.removeEventListener("click", warn, true);
      document.removeEventListener("change", warn, true);
    };
  }, []);
  return null;
}
