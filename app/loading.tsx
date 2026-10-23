import { LoadingState } from "@/app/components/ScreenState";

export default function Loading() {
  return (
    <main className="app-shell">
      <LoadingState label="Loading screen" />
    </main>
  );
}
