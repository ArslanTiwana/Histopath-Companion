"use client";

import Link from "next/link";
import { useActions } from "@/app/components/ActionProvider";

export default function AppNav({ active = "worklist" }: { active?: string }) {
  const actions = useActions();
  const open = (event: React.MouseEvent, to: string) => {
    event.preventDefault();
    void actions.run("navigate", { to });
  };
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <Link
        data-action="navigate"
        onClick={(event) => open(event, "/")}
        className={active === "worklist" ? "active" : ""}
        href="/"
      >
        Worklist
      </Link>
      <Link
        data-action="navigate"
        onClick={(event) => open(event, "/cases")}
        className={active === "cases" ? "active" : ""}
        href="/cases"
      >
        Cases
      </Link>
      <Link
        data-action="navigate"
        onClick={(event) => open(event, "/learned")}
        className={active === "learn" ? "active" : ""}
        href="/learned"
      >
        Learn
      </Link>
      <Link
        data-action="navigate"
        onClick={(event) => open(event, "/settings")}
        className={active === "settings" ? "active" : ""}
        href="/settings"
      >
        Settings
      </Link>
    </nav>
  );
}
