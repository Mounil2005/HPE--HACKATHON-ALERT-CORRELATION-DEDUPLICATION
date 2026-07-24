"use client";

import { useMemo, useState } from "react";
import { Badge, Card, Text } from "@tremor/react";
import { DisplayColumnDef } from "@tanstack/react-table";
import { GenericTable } from "@/components/table/GenericTable";
import { PageSubtitle, PageTitle, KeepLoader, SeverityLabel } from "@/shared/ui";
import type { UISeverity } from "@/shared/ui";
import { EmptyStateCard } from "@/shared/ui";
import { IoMdGitMerge } from "react-icons/io";
import { HiOutlineInbox, HiOutlineDocumentDuplicate } from "react-icons/hi2";
import { TbTrendingDown } from "react-icons/tb";
import { usePipelineState } from "@/entities/alertlens";
import type { Alert } from "@/entities/alertlens";
import { StatCard } from "@/entities/alertlens/ui/StatCard";
import { timeAgo } from "@/entities/alertlens/lib/format";

const PAGE_SIZE = 10;

export function DeduplicationClient() {
  const { state, isLoading, error } = usePipelineState();
  const stats = state.dedup_stats;

  const [limit, setLimit] = useState(PAGE_SIZE);
  const [offset, setOffset] = useState(0);

  // Every alert the pipeline kept (clustered + noise) that collapsed more than
  // one raw firing — i.e. the rows dedup actually acted on.
  const duplicated = useMemo<Alert[]>(
    () =>
      [...state.clusters.flatMap((c) => c.alerts), ...state.noise]
        .filter((a) => (a.duplicate_count ?? 1) > 1)
        .sort((a, b) => (b.duplicate_count ?? 0) - (a.duplicate_count ?? 0)),
    [state.clusters, state.noise]
  );

  const columns = useMemo<DisplayColumnDef<Alert>[]>(
    () => [
      {
        id: "severity",
        header: "Severity",
        cell: ({ row }) => (
          <SeverityLabel severity={row.original.severity as UISeverity} />
        ),
      },
      {
        id: "alertname",
        header: "Alert",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{row.original.alertname}</div>
            <div className="text-xs text-gray-500 truncate">
              {row.original.message}
            </div>
          </div>
        ),
      },
      {
        id: "service",
        header: "Service",
        cell: ({ row }) => (
          <Text className="truncate">{row.original.service}</Text>
        ),
      },
      {
        id: "fingerprint",
        header: "Fingerprint",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-500">
            {row.original.fingerprint}
          </span>
        ),
      },
      {
        id: "duplicates",
        header: "Collapsed",
        cell: ({ row }) => (
          <Badge color="orange" size="xs">
            ×{row.original.duplicate_count}
          </Badge>
        ),
      },
      {
        id: "last_seen",
        header: "Last received",
        cell: ({ row }) => (
          <Text className="text-xs text-gray-500 whitespace-nowrap">
            {timeAgo(row.original.timestamp)}
          </Text>
        ),
      },
    ],
    []
  );

  const pageRows = useMemo(
    () => duplicated.slice(offset, offset + limit),
    [duplicated, offset, limit]
  );

  if (isLoading) {
    return <KeepLoader loadingText="Loading deduplication results..." />;
  }

  if (error) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={IoMdGitMerge}
          title="Could not load deduplication data"
          description={String(error)}
        />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={IoMdGitMerge}
          title="No alert batch loaded"
          description="Load a dataset from the Pipeline page to see deduplication results."
        />
      </div>
    );
  }

  const removed = stats.raw_count - stats.unique_count;

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div>
        <PageTitle>Deduplication</PageTitle>
        <PageSubtitle>
          Monitoring re-fires the same alert every check interval. This first
          noise-removal layer collapses those repeats before any ML runs.
        </PageSubtitle>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label="Raw alerts received"
          value={stats.raw_count}
          hint="All incoming alerts"
          icon={HiOutlineInbox}
          color="blue"
        />
        <StatCard
          label="Unique after dedup"
          value={stats.unique_count}
          hint="Distinct alerts kept"
          icon={IoMdGitMerge}
          color="orange"
        />
        <StatCard
          label="Duplicates removed"
          value={removed}
          hint="Collapsed repeat firings"
          icon={HiOutlineDocumentDuplicate}
          color="amber"
        />
        <StatCard
          label="Reduction"
          value={`${stats.reduction_pct}%`}
          hint="Fingerprint = service + alert + 5-min window"
          icon={TbTrendingDown}
          color="emerald"
        />
      </div>

      {duplicated.length === 0 ? (
        <Card>
          <EmptyStateCard
            noCard
            icon={IoMdGitMerge}
            title="No duplicates in this batch"
            description="Every alert in the current batch has a unique fingerprint."
          />
        </Card>
      ) : (
        <GenericTable<Alert>
          data={pageRows}
          columns={columns}
          rowCount={duplicated.length}
          offset={offset}
          limit={limit}
          dataFetchedAtOneGO
          onPaginationChange={(newLimit, newOffset) => {
            setLimit(newLimit);
            setOffset(newOffset);
          }}
        />
      )}
    </div>
  );
}
