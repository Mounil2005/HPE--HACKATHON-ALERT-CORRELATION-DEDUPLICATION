import { TimeMachineDetailClient } from "./TimeMachineDetailClient";

export const metadata = {
  title: "Time Machine | AlertLens",
};

export default async function TimeMachineDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return <TimeMachineDetailClient incidentId={id} />;
}
