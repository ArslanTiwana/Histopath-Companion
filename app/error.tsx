"use client";

import { useEffect } from "react";
import { ErrorState } from "@/app/components/ScreenState";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="app-shell">
      <ErrorState />
    </main>
  );
}
