import { Suspense } from "react";
import BetaDashboardClient from "./BetaDashboardClient";

export default function BetaDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          Loading…
        </div>
      }
    >
      <BetaDashboardClient />
    </Suspense>
  );
}
