"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Badge, Button, Card, ProgressBar, Text, Title } from "@tremor/react";
import { LuPause, LuPlay } from "react-icons/lu";
import {
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
} from "@/shared/ui";
import { LuGauge } from "react-icons/lu";
import { useForecast, useIncident } from "@/entities/alertlens";
import { StatCard } from "@/entities/alertlens/ui/StatCard";
import { timeAgo } from "@/entities/alertlens/lib/format";

export function ForecastDetailClient({ incidentId }: { incidentId: string }) {
  const { incident, notFound } = useIncident(incidentId);
  const { data, error, isLoading } = useForecast(incidentId);

  const [activeStage, setActiveStage] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Advance through the horizons while playing, looping back to "now".
  useEffect(() => {
    if (!playing || !data?.forecast?.length) return;
    const all = [0, ...data.forecast.map((p) => p.minutes)];
    const iv = setInterval(() => {
      setActiveStage((prev) => {
        const idx = all.indexOf(prev);
        return all[(idx + 1) % all.length];
      });
    }, 2000);
    return () => clearInterval(iv);
  }, [playing, data?.forecast]);

  if (isLoading) return <KeepLoader loadingText="Computing forecast..." />;

  if (error || notFound || !data) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={LuGauge}
          title={notFound ? "Incident not found" : "Could not load forecast"}
          description={
            notFound
              ? `No incident with id ${incidentId} in the current batch.`
              : String(error)
          }
        >
          <Link href="/forecast" className="text-orange-500 text-sm">
            Back to forecast
          </Link>
        </EmptyStateCard>
      </div>
    );
  }

  const reasoning = Array.isArray(data.reasoning)
    ? data.reasoning
    : data.reasoning
      ? [data.reasoning]
      : [];

  const peak = data.forecast?.length
    ? Math.max(...data.forecast.map((p) => p.alerts))
    : 0;

  // "Now" plus each forecast horizon the backend returned.
  const stages = [0, ...(data.forecast?.map((p) => p.minutes) ?? [])];

  const stagePoint =
    data.forecast?.find((p) => p.minutes === activeStage) ?? {
      minutes: 0,
      risk: data.currentRisk,
      alerts: 0,
      newServices: [],
      confidence: data.confidence,
    };

  // Services are cumulative: everything newly affected up to this horizon.
  const stageAffected = (data.forecast ?? [])
    .filter((p) => p.minutes <= activeStage)
    .flatMap((p) => p.newServices ?? []);

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div>
        <Link
          href="/forecast"
          className="text-xs text-gray-500 hover:text-orange-500"
        >
          ← Forecast
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

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label="Current risk"
          value={`${data.currentRisk}%`}
          icon={LuGauge}
          color="red"
        />
        <StatCard
          label="Predicted blast radius"
          value={`${data.predictedBlastRadius} services`}
          color="amber"
        />
        <StatCard
          label="Forecast confidence"
          value={`${Math.round(data.confidence * 100)}%`}
          color="blue"
        />
        <StatCard label="Peak alert volume" value={peak} color="orange" />
      </div>

      <Card className="p-4">
        <Title className="text-base">Recommended immediate action</Title>
        <Text className="mt-1">{data.recommendedImmediateAction}</Text>
      </Card>

      <Card className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Title className="text-base">Projection</Title>
            <Text className="text-xs text-gray-500">
              How far this spreads if left unhandled. Step through the horizons
              or play them.
            </Text>
          </div>
          <Button
            size="xs"
            color="orange"
            variant={playing ? "secondary" : "primary"}
            icon={playing ? LuPause : LuPlay}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? "Pause" : "Play"}
          </Button>
        </div>

        {/* Horizon selector — "now" plus each forecast step. */}
        <div className="flex items-center gap-1 flex-wrap">
          {stages.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setPlaying(false);
                setActiveStage(m);
              }}
              className={clsx(
                "text-sm px-3 py-1.5 rounded-md border transition-colors",
                activeStage === m
                  ? "bg-orange-500 border-orange-500 text-white font-medium"
                  : "border-gray-200 text-gray-600 hover:border-orange-300"
              )}
            >
              {m === 0 ? "Now" : `+${m}m`}
            </button>
          ))}
        </div>

        {/* The projection at the selected horizon. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label={activeStage === 0 ? "Risk now" : `Risk at +${activeStage}m`}
            value={`${stagePoint.risk}%`}
            color="red"
          />
          <StatCard
            label="Alert volume"
            value={stagePoint.alerts}
            color="orange"
          />
          <StatCard
            label="Confidence"
            value={`${Math.round(stagePoint.confidence * 100)}%`}
            color="blue"
          />
        </div>

        <ProgressBar value={stagePoint.risk} color="red" />

        {stageAffected.length > 0 ? (
          <div>
            <Text className="text-xs uppercase tracking-wide text-gray-500">
              Services affected by +{activeStage}m
            </Text>
            <div className="flex flex-wrap gap-1 mt-1">
              {stageAffected.map((s) => (
                <Badge key={s} size="xs" color="amber">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <Text className="text-xs text-gray-500">
            No additional services predicted at this horizon.
          </Text>
        )}
      </Card>

      {reasoning.length > 0 && (
        <Card className="p-4">
          <Title className="text-base mb-2">Why this forecast</Title>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {reasoning.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Card>
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
