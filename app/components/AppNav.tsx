import Link from "next/link";

export default function AppNav({ active = "worklist" }: { active?: string }) {
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <Link className={active === "worklist" ? "active" : ""} href="/">
        <span>▤</span>
        Worklist
      </Link>
      <Link className={active === "cases" ? "active" : ""} href="/">
        <span>□</span>
        Cases
      </Link>
      <Link className={active === "learn" ? "active" : ""} href="/learned">
        <span>◇</span>
        Learn
      </Link>
      <Link className={active === "settings" ? "active" : ""} href="/settings">
        <span>⚙</span>
        Settings
      </Link>
    </nav>
  );
}
