import { AlertFeed } from "@/entities/alertlens/ui/AlertFeed";

export const metadata = {
  title: "Critical | AlertLens",
};

export default function CriticalPage() {
  return (
    <AlertFeed
      criticalOnly
      title="Critical Alerts"
      subtitle="Critical-severity alerts only — the highest-impact slice of the batch."
    />
  );
}
