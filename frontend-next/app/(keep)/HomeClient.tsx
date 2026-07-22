"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Badge, Button, Card, Text, Title } from "@tremor/react";
import { LuArrowUpDown, LuCheck, LuFilter, LuMinus } from "react-icons/lu";
import {
  DropdownMenu,
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
  SeverityLabel,
} from "@/shared/ui";
import type { UISeverity } from "@/shared/ui";
import { AiOutlineFire, AiOutlineAlert } from "react-icons/ai";
import { IoMdGitMerge } from "react-icons/io";
import { TbChartDots3, TbTrendingDown } from "react-icons/tb";
import { HiOutlineInbox, HiOutlineEyeSlash } from "react-icons/hi2";
import { usePipelineState } from "@/entities/alertlens";
import type { Alert, Cluster } from "@/entities/alertlens";
import { StatCard } from "@/entities/alertlens/ui/StatCard";
import { ClusterCard } from "@/entities/alertlens/ui/ClusterCard";
import { AlertDetailDrawer } from "@/entities/alertlens/ui/AlertDetailDrawer";
import { DataSourceButtons } from "@/entities/alertlens/ui/DataSourceMenu";
import { StormMenu } from "@/entities/alertlens/ui/StormControls";
import { AlertIcon, ServiceChip } from "@/entities/alertlens/ui/AlertIcon";
import {
  DataTable,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/entities/alertlens/ui/Table";
import { riskColor, timeAgo } from "@/entities/alertlens/lib/format";

const RECENT_LIMIT = 12;

type GroupOption = "Root Cause" | "Service" | "Severity";
const GROUP_OPTIONS: GroupOption[] = ["Root Cause", "Service", "Severity"];
const RISK_LEVELS = ["high", "medium", "low"];

/** Orders severity meaningfully rather than alphabetically. */
const SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  high: 2,
  info: 1,
};

export function HomeClient() {
  const { state, isLoading, error } = usePipelineState();
  const [selected, setSelected] = useState<Alert | null>(null);
  const [groupBy, setGroupBy] = useState<GroupOption>("Root Cause");
  const [riskFilter, setRiskFilter] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"feed" | "timeline">("feed");

  const toggleRisk = (lvl: string) =>
    setRiskFilter((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });

  const alerts = state.raw_alerts;
  const clusters = state.clusters;

  // Stat definitions preserved from the original AlertLens Home page.
  const stats = useMemo(() => {
    const firing = alerts.filter((a) => a.status === "firing").length;
    const suppressed = alerts.filter((a) => a.status === "suppressed").length;
    const deduped = [...clusters.flatMap((c) => c.alerts), ...state.noise];
    const groups = deduped.filter((a) => (a.duplicate_count ?? 1) > 1).length;
    const noise = alerts.length
      ? (100 * (1 - clusters.length / alerts.length)).toFixed(0)
      : "0";
    return { firing, suppressed, groups, noise };
  }, [alerts, clusters, state.noise]);

  const topServices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of alerts) {
      if (!a.service) continue;
      counts.set(a.service, (counts.get(a.service) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [alerts]);

  const recent = useMemo(() => alerts.slice(0, RECENT_LIMIT), [alerts]);

  // Incident cards, filtered by risk then ordered by the chosen key.
  const visibleClusters = useMemo(() => {
    const filtered = clusters.filter(
      (c) => !riskFilter.size || riskFilter.has(c.risk.level)
    );
    const compare: Record<GroupOption, (a: Cluster, b: Cluster) => number> = {
      "Root Cause": (a, b) => b.risk.score - a.risk.score,
      Service: (a, b) =>
        a.root_cause.service.localeCompare(b.root_cause.service),
      Severity: (a, b) =>
        (SEVERITY_RANK[b.root_cause.severity] ?? 0) -
        (SEVERITY_RANK[a.root_cause.severity] ?? 0),
    };
    return [...filtered].sort(compare[groupBy]);
  }, [clusters, riskFilter, groupBy]);

  // Alert arrivals bucketed per minute, so the cascade shape is visible.
  const timeline = useMemo(() => {
    const buckets = new Map<string, { total: number; critical: number }>();
    for (const a of alerts) {
      const key = a.timestamp.slice(11, 16); // HH:MM
      const b = buckets.get(key) ?? { total: 0, critical: 0 };
      b.total += 1;
      if (a.severity === "critical") b.critical += 1;
      buckets.set(key, b);
    }
    return [...buckets.entries()]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .slice(-40)
      .map(([label, v]) => ({ label, ...v }));
  }, [alerts]);

  const timelineMax = Math.max(1, ...timeline.map((b) => b.total));

  if (isLoading) {
    return <KeepLoader loadingText="Loading overview..." />;
  }

  if (error) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={AiOutlineAlert}
          title="Could not load overview"
          description={String(error)}
        />
      </div>
    );
  }

  if (!state.dedup_stats) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div>
          <PageTitle>Overview</PageTitle>
          <PageSubtitle>
            Alert correlation, deduplication and AI-driven incident analysis.
          </PageSubtitle>
        </div>
        <Card>
          <EmptyStateCard
            noCard
            icon={HiOutlineInbox}
            title="No alert batch loaded"
            description="Load one of the datasets below to run the pipeline."
          >
            <DataSourceButtons />
          </EmptyStateCard>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PageTitle>Overview</PageTitle>
          <PageSubtitle>
            Current alert and incident state across the loaded batch.
          </PageSubtitle>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DataSourceButtons />
          <StormMenu />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          label="Active incidents"
          value={clusters.length}
          hint="Correlated now"
          icon={AiOutlineFire}
          color="red"
        />
        <StatCard
          label="Firing alerts"
          value={stats.firing}
          hint="Active now"
          icon={AiOutlineAlert}
          color="orange"
        />
        <StatCard
          label="Correlated groups"
          value={stats.groups}
          hint="Fingerprints collapsed"
          icon={IoMdGitMerge}
          color="blue"
        />
        <StatCard
          label="Suppressed alerts"
          value={stats.suppressed}
          hint="Held back"
          icon={HiOutlineEyeSlash}
          color="gray"
        />
        <StatCard
          label="Noise reduction"
          value={`${stats.noise}%`}
          hint="Raw → incidents"
          icon={TbTrendingDown}
          color="emerald"
        />
        <StatCard
          label="Total alerts (raw)"
          value={alerts.length}
          hint="This batch"
          icon={HiOutlineInbox}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-3">
        <div className="2xl:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Title className="text-base">Incidents</Title>
            <div className="flex items-center gap-2">
              <DropdownMenu.Menu icon={LuArrowUpDown} label={`Sort: ${groupBy}`}>
                {GROUP_OPTIONS.map((g) => (
                  <DropdownMenu.Item
                    key={g}
                    icon={groupBy === g ? LuCheck : LuMinus}
                    label={g}
                    onClick={() => setGroupBy(g)}
                  />
                ))}
              </DropdownMenu.Menu>
              <DropdownMenu.Menu
                icon={LuFilter}
                label={riskFilter.size ? `Risk (${riskFilter.size})` : "Risk"}
              >
                {RISK_LEVELS.map((lvl) => (
                  <DropdownMenu.Item
                    key={lvl}
                    icon={riskFilter.has(lvl) ? LuCheck : LuMinus}
                    label={lvl}
                    onClick={() => toggleRisk(lvl)}
                  />
                ))}
              </DropdownMenu.Menu>
              <Link href="/incidents" className="text-xs text-orange-500">
                View all →
              </Link>
            </div>
          </div>

          {visibleClusters.length === 0 ? (
            <Card>
              <EmptyStateCard
                noCard
                icon={TbChartDots3}
                title={
                  clusters.length === 0
                    ? "No incidents correlated"
                    : "No incidents match the risk filter"
                }
                description={
                  clusters.length === 0
                    ? "Nothing in this batch grouped into an incident."
                    : "There are active incidents, just none at this risk level."
                }
              >
                {clusters.length > 0 && (
                  <Button
                    size="xs"
                    color="orange"
                    onClick={() => setRiskFilter(new Set())}
                  >
                    Clear filter
                  </Button>
                )}
              </EmptyStateCard>
            </Card>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {visibleClusters.slice(0, 4).map((c) => (
                <ClusterCard key={c.cluster_id} cluster={c} />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Title className="text-base">Most affected services</Title>
          <Card className="p-4">
            {topServices.length === 0 ? (
              <Text className="text-sm text-gray-500">No services yet.</Text>
            ) : (
              <div className="flex flex-col gap-2">
                {topServices.map(([service, count]) => {
                  const max = topServices[0][1] || 1;
                  return (
                    <div key={service} className="flex items-center gap-2">
                      <div className="w-36 text-sm truncate">{service}</div>
                      <div className="flex-1 h-2 rounded bg-gray-100 overflow-hidden">
                        <div
                          className="h-full bg-orange-400"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                      <div className="w-8 text-xs text-gray-500 text-right">
                        {count}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="flex items-center justify-between">
            <Title className="text-base">Risk breakdown</Title>
          </div>
          <Card className="p-4 flex flex-col gap-2">
            {(["high", "medium", "low"] as const).map((level) => {
              const n = clusters.filter((c) => c.risk.level === level).length;
              return (
                <div key={level} className="flex items-center justify-between">
                  <Badge size="xs" color={riskColor(level)}>
                    {level}
                  </Badge>
                  <Text className="text-sm">{n} incidents</Text>
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {(["feed", "timeline"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={clsx(
                "text-sm px-3 py-1.5 rounded-md border transition-colors",
                tab === k
                  ? "bg-orange-500 border-orange-500 text-white font-medium"
                  : "border-gray-200 text-gray-600 hover:border-orange-300"
              )}
            >
              {k === "feed" ? "Recent alerts" : "Timeline"}
            </button>
          ))}
        </div>
        <Link href="/feed" className="text-xs text-orange-500">
          Open feed →
        </Link>
      </div>

      {tab === "feed" ? (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <DataTable>
              <TableHead>
                <Th>Severity</Th>
                <Th>Alert</Th>
                <Th>Service</Th>
                <Th>Status</Th>
                <Th>Received</Th>
              </TableHead>
              <tbody>
                {recent.map((a) => (
                  <Tr key={a.id} onClick={() => setSelected(a)}>
                    <Td>
                      <SeverityLabel severity={a.severity as UISeverity} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AlertIcon
                          alertname={a.alertname}
                          severity={a.severity}
                          service={a.service}
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate max-w-xs">
                            {a.alertname}
                          </div>
                          <div className="text-xs text-gray-500 truncate max-w-md">
                            {a.message}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <ServiceChip service={a.service} />
                    </Td>
                    <Td>
                      <Badge size="xs" color="gray">
                        {a.status}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-gray-500 whitespace-nowrap">
                      {timeAgo(a.timestamp)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          {/* Alert arrivals bucketed by minute — shows the cascade shape. */}
          <div className="flex items-end gap-1 h-32">
            {timeline.map((b) => (
              <div
                key={b.label}
                className="flex-1 h-full flex flex-col items-center justify-end gap-1 min-w-0"
                title={`${b.label} — ${b.total} alerts (${b.critical} critical)`}
              >
                <div
                  className="w-full bg-red-400 rounded-t"
                  style={{ height: `${(b.critical / timelineMax) * 100}%` }}
                />
                <div
                  className="w-full bg-orange-300"
                  style={{
                    height: `${((b.total - b.critical) / timelineMax) * 100}%`,
                  }}
                />
                <span className="text-[10px] text-gray-400 truncate w-full text-center">
                  {b.label}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> critical
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-300" /> other
            </span>
            <span className="ml-auto">
              {alerts.length} alerts across {timeline.length} minutes
            </span>
          </div>
        </Card>
      )}

      <AlertDetailDrawer alert={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
