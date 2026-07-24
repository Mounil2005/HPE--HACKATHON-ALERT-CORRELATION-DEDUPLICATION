import { ForecastDetailClient } from "./ForecastDetailClient";

export const metadata = {
  title: "Forecast | AlertLens",
};

export default async function ForecastDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return <ForecastDetailClient incidentId={id} />;
}
