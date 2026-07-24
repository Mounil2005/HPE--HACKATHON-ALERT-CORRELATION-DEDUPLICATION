"use client";

import { useMemo, useState } from "react";
import { Badge, Card, Text, Title } from "@tremor/react";
import {
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
} from "@/shared/ui";
import { LuWorkflow, LuChevronDown } from "react-icons/lu";
import { usePipelineState } from "@/entities/alertlens";
import { buildStages, type Stage } from "@/entities/alertlens/lib/buildStages";
import { DataSourceButtons } from "@/entities/alertlens/ui/DataSourceMenu";

function StageCard({
  stage,
  index,
  isOpen,
  onToggle,
}: {
  stage: Stage;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <Card
      className={`p-4 cursor-pointer transition-shadow ${
        isOpen ? "ring-2 ring-orange-400" : "hover:shadow-md"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-xs font-semibold flex items-center justify-center shrink-0">
              {index + 1}
            </span>
            <span className="font-medium truncate">{stage.label}</span>
          </div>
          <div className="mt-2 text-2xl font-semibold">{stage.metric}</div>
          <Text className="text-xs text-gray-500">{stage.metricLabel}</Text>
          {stage.subMetric && (
            <Badge size="xs" color="orange" className="mt-1">
              {stage.subMetric}
            </Badge>
          )}
        </div>
        <LuChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </div>

      {isOpen && (
        <div className="mt-3 pt-3 border-t border-gray-200 flex flex-col gap-2 text-sm">
          <div>
            <Text className="text-xs uppercase tracking-wide text-gray-500">
              Purpose
            </Text>
            <div>{stage.detail.purpose}</div>
          </div>
          <div>
            <Text className="text-xs uppercase tracking-wide text-gray-500">
              Algorithm
            </Text>
            <div>{stage.detail.algorithm}</div>
          </div>
          {stage.detail.parameters && (
            <div>
              <Text className="text-xs uppercase tracking-wide text-gray-500">
                Parameters
              </Text>
              <div className="font-mono text-xs">{stage.detail.parameters}</div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Text className="text-xs uppercase tracking-wide text-gray-500">
                Inputs
              </Text>
              <div className="text-xs">{stage.detail.inputs}</div>
            </div>
            <div>
              <Text className="text-xs uppercase tracking-wide text-gray-500">
                Outputs
              </Text>
              <div className="text-xs">{stage.detail.outputs}</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export function PipelineClient() {
  const { state, isLoading, error } = usePipelineState();
  // A Set, not a single id - each stage toggles independently instead of
  // opening one and silently closing whichever was open before.
  const [openStages, setOpenStages] = useState<Set<string>>(new Set());

  const stages = useMemo(() => buildStages(state), [state]);

  if (isLoading) {
    return <KeepLoader loadingText="Loading pipeline state..." />;
  }

  if (error) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={LuWorkflow}
          title="Could not load pipeline"
          description={String(error)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PageTitle>Pipeline</PageTitle>
          <PageSubtitle>
            How raw alerts become actionable incidents. Select a stage to see
            its algorithm and parameters.
          </PageSubtitle>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Text className="text-xs text-gray-500">Load a dataset</Text>
          <DataSourceButtons />
        </div>
      </div>

      {stages.length === 0 ? (
        <Card>
          <EmptyStateCard
            noCard
            icon={LuWorkflow}
            title="No alert batch loaded"
            description="Load one of the datasets above to run the pipeline."
          />
        </Card>
      ) : (
        <>
          {/* items-start: without it, a grid row stretches every card to
              match its tallest sibling, so expanding one stage left the
              others in its row showing a wall of empty space below their
              stat instead of just staying their natural (short) height. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
            {stages.map((stage, i) => (
              <StageCard
                key={stage.id}
                stage={stage}
                index={i}
                isOpen={openStages.has(stage.id)}
                onToggle={() =>
                  setOpenStages((prev) => {
                    const next = new Set(prev);
                    if (next.has(stage.id)) next.delete(stage.id);
                    else next.add(stage.id);
                    return next;
                  })
                }
              />
            ))}
          </div>

          <Card className="p-4">
            <Title className="text-base mb-2">Run log</Title>
            <div className="flex flex-col gap-1 font-mono text-xs">
              {stages.map((s, i) => (
                <div key={s.id} className="flex gap-2">
                  <span className="text-gray-400 shrink-0">
                    [{String(i + 1).padStart(2, "0")}]
                  </span>
                  <span>{s.logLine}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
