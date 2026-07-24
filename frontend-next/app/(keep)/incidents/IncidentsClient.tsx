"use client";

import { Card } from "@tremor/react";
import {
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
} from "@/shared/ui";
import { MdOutlineNotificationsActive } from "react-icons/md";
import { useClusters } from "@/entities/alertlens";
import { ClusterCard } from "@/entities/alertlens/ui/ClusterCard";

export function IncidentsClient() {
  const { clusters, isLoading, error } = useClusters();

  if (isLoading) {
    return <KeepLoader loadingText="Loading incidents..." />;
  }

  if (error) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={MdOutlineNotificationsActive}
          title="Could not load incidents"
          description={String(error)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div>
        <PageTitle>Incidents</PageTitle>
        <PageSubtitle>
          Correlated incidents ranked by escalation risk. Select one to see its
          root-cause analysis, forecast and remediation playbook.
        </PageSubtitle>
      </div>

      {clusters.length === 0 ? (
        <Card>
          <EmptyStateCard
            noCard
            icon={MdOutlineNotificationsActive}
            title="No incidents"
            description="No alert batch is loaded, or nothing correlated into an incident."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
          {clusters.map((cluster) => (
            <ClusterCard key={cluster.cluster_id} cluster={cluster} />
          ))}
        </div>
      )}
    </div>
  );
}
