import { Suspense } from "react";
import PreferencesClient from "./PreferencesClient";

export default function PreferencesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--paper)] px-6 py-12 text-[var(--ink)]">
          <p className="text-sm text-[var(--muted)]">Loading preferences...</p>
        </div>
      }
    >
      <PreferencesClient />
    </Suspense>
  );
}
