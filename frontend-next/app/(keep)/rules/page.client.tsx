"use client";

import { Card, Text, Title } from "@tremor/react";
import { MdOutlineRuleFolder } from "react-icons/md";
import { EmptyStateCard, KeepLoader, PageSubtitle, PageTitle } from "@/shared/ui";
import { useRulesConfig } from "@/entities/alertlens";

function ParamRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
      <Text className="text-sm text-gray-500">{label}</Text>
      <span className="text-sm font-mono font-medium">{value}</span>
    </div>
  );
}

export default function RulesPage() {
  const { data: config, isLoading, error } = useRulesConfig();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageTitle>Rules</PageTitle>
        <PageSubtitle>
          How the correlation engine actually decides what belongs together —
          the real, grid-searched parameters, not an editable rules builder.
        </PageSubtitle>
      </div>

      {isLoading ? (
        <KeepLoader includeMinHeight={false} loadingText="Loading engine config..." />
      ) : error || !config ? (
        <EmptyStateCard
          icon={MdOutlineRuleFolder}
          title="Could not load engine config"
          description={String(error)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <Title className="text-sm mb-1">Deduplication</Title>
            <Text className="text-xs text-gray-500 mb-3">
              {config.dedup.description}
            </Text>
            <ParamRow label="Window" value={`${config.dedup.window_seconds}s`} />
          </Card>

          <Card>
            <Title className="text-sm mb-1">Clustering</Title>
            <Text className="text-xs text-gray-500 mb-3">
              {config.clustering.description}
            </Text>
            <ParamRow label="eps" value={config.clustering.eps} />
            <ParamRow label="min_samples" value={config.clustering.min_samples} />
            <ParamRow
              label="Time scale"
              value={`${config.clustering.time_scale_minutes}m`}
            />
            <ParamRow label="Time penalty" value={config.clustering.time_penalty} />
          </Card>

          <Card>
            <Title className="text-sm mb-1">Root cause</Title>
            <Text className="text-xs text-gray-500">
              {config.root_cause.description}
            </Text>
          </Card>
        </div>
      )}
    </div>
  );
}
