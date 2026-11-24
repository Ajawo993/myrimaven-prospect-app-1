import { Suspense } from "react";
import SettingsView from "@/components/SettingsView";

export const metadata = { title: "Updates & calendar" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <SettingsView />
    </Suspense>
  );
}
