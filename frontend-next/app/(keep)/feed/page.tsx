import { AlertFeed } from "@/entities/alertlens/ui/AlertFeed";

export const metadata = {
  title: "Alert Feed | AlertLens",
};

export default function FeedPage() {
  return (
    <AlertFeed
      title="Alert Feed"
      subtitle="Every alert ingested in the current batch, newest first."
    />
  );
}
