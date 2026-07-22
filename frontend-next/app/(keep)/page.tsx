import { HomeClient } from "./HomeClient";

export const metadata = {
  title: "AlertLens",
  description:
    "Alert correlation, deduplication and AI-driven incident analysis.",
};

export default function HomePage() {
  return <HomeClient />;
}
