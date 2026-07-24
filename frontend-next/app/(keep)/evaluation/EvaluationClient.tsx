"use client";

import { Card, ProgressBar, Text, Title } from "@tremor/react";
import {
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
} from "@/shared/ui";
import { LuBrainCircuit } from "react-icons/lu";
import { useEvaluation } from "@/entities/alertlens";
import { StatCard } from "@/entities/alertlens/ui/StatCard";
import {
  DataTable,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/entities/alertlens/ui/Table";

const pctColor = (v: number) =>
  v >= 90 ? "emerald" : v >= 70 ? "amber" : "red";

export function EvaluationClient() {
  const { data, error, isLoading } = useEvaluation();

  if (isLoading) {
    return (
      <KeepLoader loadingText="Running evaluation across the seed set — this takes a moment..." />
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={LuBrainCircuit}
          title="Could not load evaluation"
          description={String(error)}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={LuBrainCircuit}
          title="No evaluation available"
          description="Load an alert batch first."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div>
        <PageTitle>Model Evaluation</PageTitle>
        <PageSubtitle>
          Measured against the generator&apos;s hidden ground truth across{" "}
          {data.seeds_tested} fixed seeds. The pipeline never reads ground
          truth — this is an external measurement.
        </PageSubtitle>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label="Incident detection"
          value={`${data.incident_detection_pct}%`}
          hint={`${data.incidents_detected} of ${data.incidents_total} incidents found`}
          icon={LuBrainCircuit}
          color="orange"
        />
        <StatCard
          label="Cluster purity"
          value={`${data.cluster_purity_pct}%`}
          hint="Alerts grouped with the right incident"
          color="blue"
        />
        <StatCard
          label="Noise excluded"
          value={`${data.noise_excluded_pct}%`}
          hint="Background noise correctly left out"
          color="emerald"
        />
        <StatCard
          label="Alert DNA accuracy"
          value={`${data.dna_accuracy_pct}%`}
          hint={`${data.dna_correct} of ${data.dna_total} matched correctly`}
          color="amber"
        />
      </div>

      <Card className="p-4">
        <Title className="text-base mb-3">Overall</Title>
        <div className="flex flex-col gap-3">
          {[
            {
              label: "Incident detection",
              value: data.incident_detection_pct,
            },
            { label: "Cluster purity", value: data.cluster_purity_pct },
            { label: "Noise excluded", value: data.noise_excluded_pct },
            { label: "Alert DNA accuracy", value: data.dna_accuracy_pct },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-44 text-xs text-gray-500 shrink-0">
                {row.label}
              </div>
              <div className="flex-1">
                <ProgressBar value={row.value} color={pctColor(row.value)} />
              </div>
              <div className="w-14 text-xs text-right shrink-0">
                {row.value}%
              </div>
            </div>
          ))}
        </div>
        <Text className="text-xs text-gray-500 mt-3">
          Fragmentation events: {data.fragmentation_events} — incidents split
          across more than one cluster.
        </Text>
      </Card>

      <Card className="p-4">
        <Title className="text-base mb-3">Per-seed results</Title>
        <div className="overflow-x-auto">
          <DataTable>
            <TableHead>
              <Th>Seed</Th>
              <Th>Detection</Th>
              <Th>Purity</Th>
              <Th>Noise excluded</Th>
            </TableHead>
            <tbody>
              {data.per_seed?.map((s) => (
                <Tr key={s.seed}>
                  <Td className="font-mono text-xs">{s.seed}</Td>
                  <Td className="tabular-nums">{s.incident_detection_pct}%</Td>
                  <Td className="tabular-nums">{s.cluster_purity_pct}%</Td>
                  <Td className="tabular-nums">{s.noise_excluded_pct}%</Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Card>
    </div>
  );
}
