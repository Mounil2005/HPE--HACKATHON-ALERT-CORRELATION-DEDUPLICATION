import { PageSubtitle, PageTitle } from "@/shared/ui";
import { IncidentPicker } from "@/entities/alertlens/ui/IncidentPicker";

export const metadata = {
  title: "Time Machine | AlertLens",
};

export default function TimeMachinePage() {
  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div>
        <PageTitle>Time Machine</PageTitle>
        <PageSubtitle>
          Compares a live incident against its closest match in the Alert DNA
          history, so you can reuse what worked last time. Choose an incident.
        </PageSubtitle>
      </div>
      <IncidentPicker
        basePath="/timemachine"
        emptyTitle="No incidents to compare"
      />
    </div>
  );
}
