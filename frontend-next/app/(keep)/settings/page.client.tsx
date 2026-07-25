"use client";

import { Badge, Card, Text } from "@tremor/react";
import { HiOutlineCog6Tooth } from "react-icons/hi2";
import { EmptyStateCard, KeepLoader, PageSubtitle, PageTitle } from "@/shared/ui";
import { useSettingsStatus } from "@/entities/alertlens";
import { useConfig } from "@/utils/hooks/useConfig";

function StatusRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <Text className="text-sm text-gray-500">{label}</Text>
      <span className={mono ? "text-xs font-mono text-gray-700" : "text-sm font-medium"}>
        {value}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const { data: status, isLoading, error } = useSettingsStatus();
  const { data: config } = useConfig();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageTitle>Settings</PageTitle>
        <PageSubtitle>
          Real system status — what&apos;s actually running right now, not a
          settings form for accounts this backend doesn&apos;t have.
        </PageSubtitle>
      </div>

      {isLoading ? (
        <KeepLoader includeMinHeight={false} loadingText="Loading status..." />
      ) : error ? (
        <EmptyStateCard
          icon={HiOutlineCog6Tooth}
          title="Could not load status"
          description={String(error)}
        />
      ) : status ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <Text className="text-xs uppercase tracking-wide text-gray-400 mb-2">
              Engine
            </Text>
            <StatusRow
              label="Dataset loaded"
              value={<Badge color="orange" size="xs">{status.dataset}</Badge>}
            />
            <StatusRow label="Persisted alerts" value={status.persisted_alert_count} />
            <StatusRow label="Active incidents" value={status.active_incident_count} />
            <StatusRow label="Database file" value={status.db_path} mono />
          </Card>

          <Card>
            <Text className="text-xs uppercase tracking-wide text-gray-400 mb-2">
              Automation
            </Text>
            <StatusRow label="Providers configured" value={status.provider_count} />
            <StatusRow label="Workflow rules" value={status.workflow_rule_count} />
            <StatusRow
              label="LLM provider"
              value={
                status.llm_configured ? (
                  <Badge color="emerald" size="xs">
                    {status.llm_provider}
                  </Badge>
                ) : (
                  <Badge color="gray" size="xs">
                    not configured
                  </Badge>
                )
              }
            />
          </Card>

          <Card>
            <Text className="text-xs uppercase tracking-wide text-gray-400 mb-2">
              Frontend
            </Text>
            <StatusRow label="Auth mode" value={config?.AUTH_TYPE ?? "unknown"} />
            <StatusRow
              label="Backend URL"
              value={config?.API_URL_CLIENT || "same origin"}
              mono
            />
            <StatusRow
              label="Read-only mode"
              value={config?.READ_ONLY ? "enabled" : "disabled"}
            />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
