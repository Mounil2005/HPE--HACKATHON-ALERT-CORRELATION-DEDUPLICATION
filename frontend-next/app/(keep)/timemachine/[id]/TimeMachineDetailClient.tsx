"use client";

import Link from "next/link";
import { Card, ProgressBar, Text, Title } from "@tremor/react";
import {
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
} from "@/shared/ui";
import { TbTimeline } from "react-icons/tb";
import { useIncident, useIncidentComparison } from "@/entities/alertlens";
import { StatCard } from "@/entities/alertlens/ui/StatCard";
import { ReplayTimeline } from "@/entities/alertlens/ui/ReplayTimeline";
import { timeAgo } from "@/entities/alertlens/lib/format";

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-3 py-1 border-b border-gray-100 last:border-0">
    <Text className="text-xs text-gray-500">{label}</Text>
    <div className="text-sm text-right">{value}</div>
  </div>
);

export function TimeMachineDetailClient({
  incidentId,
}: {
  incidentId: string;
}) {
  const { incident, notFound } = useIncident(incidentId);
  const { data, error, isLoading } = useIncidentComparison(incidentId);

  if (isLoading) {
    return <KeepLoader loadingText="Searching incident history..." />;
  }

  if (error || notFound || !data) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={TbTimeline}
          title={notFound ? "Incident not found" : "Could not load comparison"}
          description={
            notFound
              ? `No incident with id ${incidentId} in the current batch.`
              : String(error)
          }
        >
          <Link href="/timemachine" className="text-orange-500 text-sm">
            Back to Time Machine
          </Link>
        </EmptyStateCard>
      </div>
    );
  }

  const dna = incident?.dna_match ?? null;
  const current = data.current_incident;

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div>
        <Link
          href="/timemachine"
          className="text-xs text-gray-500 hover:text-orange-500"
        >
          ← Time Machine
        </Link>
        <div className="mt-1">
          <PageTitle>
            {incident ? incident.root_cause.alertname : `Incident ${incidentId}`}
          </PageTitle>
          {incident && (
            <PageSubtitle>
              Root cause on {incident.root_cause.service} ·{" "}
              {timeAgo(incident.root_cause.timestamp)}
            </PageSubtitle>
          )}
        </div>
      </div>

      {incident && <ReplayTimeline cluster={incident} />}

      {!data.has_match ? (
        <Card>
          <EmptyStateCard
            noCard
            icon={TbTimeline}
            title="Novel incident signature"
            description="Nothing in the Alert DNA history resembles this incident — there is no prior playbook to reuse."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <StatCard
              label="Similarity"
              value={`${data.similarity}%`}
              icon={TbTimeline}
              color="orange"
            />
            <StatCard
              label="Match confidence"
              value={`${Math.round(data.confidence * 100)}%`}
              color="blue"
            />
            <StatCard
              label="Historical resolution"
              value={
                data.resolution_minutes ? `${data.resolution_minutes}m` : "n/a"
              }
              hint="How long the past incident took"
              color="emerald"
            />
          </div>

          {data.similarity_breakdown && (
            <Card className="p-4">
              <Title className="text-base mb-3">Similarity breakdown</Title>
              <div className="flex flex-col gap-2">
                {Object.entries(data.similarity_breakdown).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3">
                    <div className="w-44 text-xs text-gray-500 capitalize shrink-0">
                      {k.replace(/_/g, " ")}
                    </div>
                    <div className="flex-1">
                      <ProgressBar value={Number(v)} color="orange" />
                    </div>
                    <div className="w-12 text-xs text-right shrink-0">
                      {String(v)}%
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="p-4">
              <Title className="text-base mb-2">Current incident</Title>
              {current && (
                <>
                  <Row label="Service" value={current.service} />
                  <Row label="Alert" value={current.alertname} />
                  <Row label="Severity" value={current.severity} />
                  <Row
                    label="Risk"
                    value={`${current.risk_score}% (${current.risk_level})`}
                  />
                  <Row label="Alerts" value={current.alert_count} />
                  <Row
                    label="Services"
                    value={(current.services ?? []).join(", ")}
                  />
                </>
              )}
            </Card>

            <Card className="p-4">
              <Title className="text-base mb-2">
                Historical match{dna ? ` — ${dna.incident_id}` : ""}
              </Title>
              {dna ? (
                <>
                  <Row label="Title" value={dna.title} />
                  <Row label="Date" value={dna.date} />
                  <Row label="Root cause" value={dna.root_cause} />
                  <Row label="Symptoms" value={dna.symptom_pattern} />
                  {data.historical_resolution && (
                    <Row label="Fix" value={data.historical_resolution} />
                  )}
                </>
              ) : (
                <Text className="text-sm text-gray-500">
                  Match details unavailable for this incident.
                </Text>
              )}
            </Card>
          </div>

          {(data.suggested_actions?.length ?? 0) > 0 && (
            <Card className="p-4">
              <Title className="text-base mb-2">
                Suggested actions from the past fix
              </Title>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {data.suggested_actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {incident && (
        <Link
          href={`/incidents/${incident.cluster_id}`}
          className="text-sm text-orange-500"
        >
          Open full incident →
        </Link>
      )}
    </div>
  );
}
