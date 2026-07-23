import { AlertFeed } from "@/entities/alertlens/ui/AlertFeed";

export const metadata = {
  title: "Firing | AlertLens",
};

export default function FiringPage() {
  return (
    <AlertFeed
      firingOnly
      title="Firing Alerts"
      subtitle="Alerts currently firing — resolved and suppressed alerts are hidden."
    />
  );
}
