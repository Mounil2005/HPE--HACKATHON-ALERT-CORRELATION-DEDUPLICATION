"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Badge, Card } from "@tremor/react";
import { LuZap } from "react-icons/lu";
import {
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
  SeverityLabel,
} from "@/shared/ui";
import type { UISeverity } from "@/shared/ui";
import type { Cluster } from "@/entities/alertlens";
import { timeAgo } from "@/entities/alertlens/lib/format";
import { ServiceChip } from "@/entities/alertlens/ui/AlertIcon";
import {
  DataTable,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/entities/alertlens/ui/Table";
import { TbChartDots3 } from "react-icons/tb";
import { HiOutlineInbox } from "react-icons/hi2";
import { IoMdGitMerge } from "react-icons/io";
import { LuClock } from "react-icons/lu";
import { usePipelineState } from "@/entities/alertlens";
import { StatCard } from "@/entities/alertlens/ui/StatCard";
import { ClusterCard } from "@/entities/alertlens/ui/ClusterCard";
import { ChaosOrder } from "@/entities/alertlens/ui/ChaosOrder";

type ViewKey = "chaos" | "raw" | "correlated";

const VIEWS: { key: ViewKey; label: string; icon?: React.ElementType }[] = [
  { key: "chaos", label: "Chaos → Order", icon: LuZap },
  { key: "raw", label: "Raw stream" },
  { key: "correlated", label: "Correlated" },
];

export function CorrelationsClient() {
  const { state, isLoading, error } = usePipelineState();
  const [view, setView] = useState<ViewKey>("chaos");

  /**
   * Every deduplicated alert in arrival order, annotated with the incident it
   * ended up in — the "before" picture the correlation engine starts from.
   */
  const rawStream = useMemo(() => {
    const owner = new Map<string, Cluster>();
    for (const c of state.clusters) {
      for (const a of c.alerts) owner.set(a.id, c);
    }
    return [...state.clusters.flatMap((c) => c.alerts), ...state.noise]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .map((alert) => ({ alert, cluster: owner.get(alert.id) ?? null }));
  }, [state.clusters, state.noise]);

  if (isLoading) {
    return <KeepLoader loadingText="Correlating alerts..." />;
  }

  if (error) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={TbChartDots3}
          title="Could not load correlations"
          description={String(error)}
        />
      </div>
    );
  }

  const { clusters, noise } = state;
  const correlatedAlerts = clusters.reduce((sum, c) => sum + c.size, 0);
  const triageSaved = clusters.reduce(
    (sum, c) => sum + c.est_triage_minutes_saved,
    0
  );

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div>
        <PageTitle>Correlations</PageTitle>
        <PageSubtitle>
          Deduplicated alerts grouped into incidents by the correlation engine.
          Each group shares a suspected root cause.
        </PageSubtitle>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label="Incidents formed"
          value={clusters.length}
          hint="Correlated alert groups"
          icon={TbChartDots3}
          color="orange"
        />
        <StatCard
          label="Alerts correlated"
          value={correlatedAlerts}
          hint="Alerts placed into an incident"
          icon={IoMdGitMerge}
          color="blue"
        />
        <StatCard
          label="Uncorrelated"
          value={noise.length}
          hint="Standalone noise, no group"
          icon={HiOutlineInbox}
          color="gray"
        />
        <StatCard
          label="Triage time saved"
          value={`${triageSaved}m`}
          hint="Estimated across all incidents"
          icon={LuClock}
          color="emerald"
        />
      </div>

      <div className="flex items-center gap-1">
        {VIEWS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={clsx(
              "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition-colors",
              view === key
                ? "bg-orange-500 border-orange-500 text-white font-medium"
                : "border-gray-200 text-gray-600 hover:border-orange-300"
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
          </button>
        ))}
      </div>

      {clusters.length === 0 ? (
        <Card>
          <EmptyStateCard
            noCard
            icon={TbChartDots3}
            title="No incidents correlated"
            description="No alert batch is loaded, or nothing in it correlated into a group."
          />
        </Card>
      ) : view === "chaos" ? (
        <ChaosOrder />
      ) : view === "raw" ? (
        <Card className="p-0 overflow-hidden">
          <div className="max-h-[32rem] overflow-y-auto">
            <DataTable>
              <TableHead sticky>
                <Th>Severity</Th>
                <Th>Alert</Th>
                <Th>Service</Th>
                <Th>Correlated into</Th>
                <Th>Received</Th>
              </TableHead>
              <tbody>
                {rawStream.map(({ alert, cluster }) => (
                  <Tr key={alert.id}>
                    <Td>
                      <SeverityLabel severity={alert.severity as UISeverity} />
                    </Td>
                    <Td>
                      <div className="font-medium truncate max-w-xs">
                        {alert.alertname}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-md">
                        {alert.message}
                      </div>
                    </Td>
                    <Td>
                      <ServiceChip service={alert.service} />
                    </Td>
                    <Td>
                      {cluster ? (
                        <Link
                          href={`/incidents/${cluster.cluster_id}`}
                          className="text-orange-500 text-xs hover:underline"
                        >
                          {cluster.root_cause.alertname}
                        </Link>
                      ) : (
                        <Badge size="xs" color="gray">
                          noise
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-xs text-gray-500 whitespace-nowrap">
                      {timeAgo(alert.timestamp)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </div>
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
