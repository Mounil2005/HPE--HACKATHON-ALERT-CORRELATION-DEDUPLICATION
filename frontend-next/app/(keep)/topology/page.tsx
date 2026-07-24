import { TopologyClient } from "./TopologyClient";

export const metadata = {
  title: "Service Topology | AlertLens",
  description: "Service dependencies inferred from correlated incidents",
};

export default function Page() {
  return <TopologyClient />;
}
