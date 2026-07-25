"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Select,
  SelectItem,
  Switch,
  Text,
  TextInput,
} from "@tremor/react";
import { LuWorkflow, LuTrash2 } from "react-icons/lu";
import {
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
  showErrorToast,
  showSuccessToast,
} from "@/shared/ui";
import {
  useWorkflowRules,
  useWorkflowRuleActions,
  useProviders,
} from "@/entities/alertlens";
import { DataTable, TableHead, Th, Tr, Td } from "@/entities/alertlens/ui/Table";
import { timeAgo } from "@/entities/alertlens/lib/format";
import type {
  WorkflowRule,
  WorkflowTriggerType,
  WorkflowActionType,
} from "@/entities/alertlens";

const TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  risk_threshold: "Risk score at or above",
  new_critical_alert: "New critical root cause",
};

const ACTION_LABELS: Record<WorkflowActionType, string> = {
  notify: "Notify via",
  auto_escalate: "Auto-escalate the incident",
};

function describeTrigger(rule: WorkflowRule): string {
  if (rule.trigger_type === "risk_threshold") {
    const pct = Math.round((rule.trigger_config.min_risk ?? 0.8) * 100);
    return `${TRIGGER_LABELS.risk_threshold} ${pct}%`;
  }
  return TRIGGER_LABELS[rule.trigger_type];
}

function AddRuleForm({
  providers,
  onAdd,
}: {
  providers: { id: string; name: string }[];
  onAdd: (
    name: string,
    triggerType: WorkflowTriggerType,
    triggerConfig: Record<string, unknown>,
    actionType: WorkflowActionType,
    actionConfig: Record<string, unknown>
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>("risk_threshold");
  const [minRisk, setMinRisk] = useState("80");
  const [actionType, setActionType] = useState<WorkflowActionType>("auto_escalate");
  const [providerId, setProviderId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (actionType === "notify" && !providerId) return;

    setSubmitting(true);
    try {
      const triggerConfig =
        triggerType === "risk_threshold"
          ? { min_risk: Number(minRisk) / 100 }
          : {};
      const actionConfig = actionType === "notify" ? { provider_id: providerId } : {};
      await onAdd(name.trim(), triggerType, triggerConfig, actionType, actionConfig);
      setName("");
      setMinRisk("80");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <Text className="text-xs mb-1">Name</Text>
          <TextInput
            placeholder="e.g. Escalate high-risk incidents"
            value={name}
            onValueChange={setName}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Text className="text-xs mb-1">When</Text>
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as WorkflowTriggerType)}>
              <SelectItem value="risk_threshold">Risk score reaches a threshold</SelectItem>
              <SelectItem value="new_critical_alert">A new critical root cause appears</SelectItem>
            </Select>
          </div>
          {triggerType === "risk_threshold" && (
            <div className="w-full sm:w-32">
              <Text className="text-xs mb-1">Min risk %</Text>
              <TextInput
                type="number"
                min={0}
                max={100}
                value={minRisk}
                onValueChange={setMinRisk}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <Text className="text-xs mb-1">Then</Text>
            <Select value={actionType} onValueChange={(v) => setActionType(v as WorkflowActionType)}>
              <SelectItem value="auto_escalate">Auto-escalate the incident</SelectItem>
              <SelectItem value="notify">Notify a provider</SelectItem>
            </Select>
          </div>
          {actionType === "notify" && (
            <div className="flex-1 w-full">
              <Text className="text-xs mb-1">Provider</Text>
              {providers.length === 0 ? (
                <Text className="text-xs text-red-500">
                  No providers yet — add one on the Providers page first.
                </Text>
              ) : (
                <Select value={providerId} onValueChange={setProviderId}>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </Select>
              )}
            </div>
          )}
          <Button
            type="submit"
            color="orange"
            loading={submitting}
            disabled={submitting || (actionType === "notify" && !providerId)}
          >
            Add rule
          </Button>
        </div>
      </form>
    </Card>
  );
}

function RuleRow({
  rule,
  providerName,
}: {
  rule: WorkflowRule;
  providerName?: string;
}) {
  const { setEnabled, deleteRule } = useWorkflowRuleActions();
  const [busy, setBusy] = useState(false);

  const handleToggle = async (value: boolean) => {
    setBusy(true);
    try {
      await setEnabled(rule.id, value);
    } catch (error) {
      showErrorToast(error, "Failed to update rule");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    setBusy(true);
    try {
      await deleteRule(rule.id);
    } catch (error) {
      showErrorToast(error, "Failed to delete rule");
      setBusy(false);
    }
  };

  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-2">
          <LuWorkflow className="text-gray-400 shrink-0" />
          <span className="font-medium">{rule.name}</span>
        </div>
      </Td>
      <Td>
        <span className="text-xs text-gray-600">{describeTrigger(rule)}</span>
      </Td>
      <Td>
        <span className="text-xs text-gray-600">
          {ACTION_LABELS[rule.action_type]}
          {rule.action_type === "notify" && providerName && (
            <Badge color="gray" size="xs" className="ml-1">
              {providerName}
            </Badge>
          )}
        </span>
      </Td>
      <Td>
        {rule.last_fired_at ? (
          <span className="text-xs text-gray-500">{timeAgo(rule.last_fired_at)}</span>
        ) : (
          <span className="text-xs text-gray-400">Never</span>
        )}
      </Td>
      <Td>
        <div className="flex items-center gap-2 justify-end">
          <Switch checked={rule.enabled} onChange={handleToggle} disabled={busy} />
          <Button
            size="xs"
            variant="secondary"
            color="red"
            icon={LuTrash2}
            disabled={busy}
            onClick={handleDelete}
          />
        </div>
      </Td>
    </Tr>
  );
}

export default function WorkflowsPage() {
  const { data: rules, isLoading, error } = useWorkflowRules();
  const { data: providers } = useProviders();
  const { createRule } = useWorkflowRuleActions();

  const providerName = (id?: string) =>
    providers?.find((p) => p.id === id)?.name;

  const handleAdd = async (
    name: string,
    triggerType: WorkflowTriggerType,
    triggerConfig: Record<string, unknown>,
    actionType: WorkflowActionType,
    actionConfig: Record<string, unknown>
  ) => {
    try {
      await createRule(name, triggerType, triggerConfig, actionType, actionConfig);
      showSuccessToast(`Added rule "${name}"`);
    } catch (err) {
      showErrorToast(err, "Failed to add rule");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageTitle>Workflows</PageTitle>
        <PageSubtitle>
          Real trigger-and-action rules, evaluated on every pipeline run — not
          a step engine, just &quot;if this, do that once per incident.&quot;
        </PageSubtitle>
      </div>

      <AddRuleForm providers={providers ?? []} onAdd={handleAdd} />

      {isLoading ? (
        <KeepLoader includeMinHeight={false} loadingText="Loading workflows..." />
      ) : error ? (
        <EmptyStateCard
          icon={LuWorkflow}
          title="Could not load workflows"
          description={String(error)}
        />
      ) : !rules || rules.length === 0 ? (
        <Card>
          <EmptyStateCard
            noCard
            icon={LuWorkflow}
            title="No rules yet"
            description="Add one above — it'll start evaluating on the next pipeline run."
          />
        </Card>
      ) : (
        <Card>
          <DataTable>
            <TableHead>
              <Th>Name</Th>
              <Th>Trigger</Th>
              <Th>Action</Th>
              <Th>Last fired</Th>
              <Th className="text-right">Enabled</Th>
            </TableHead>
            <tbody>
              {rules.map((r) => (
                <RuleRow
                  key={r.id}
                  rule={r}
                  providerName={providerName(r.action_config.provider_id)}
                />
              ))}
            </tbody>
          </DataTable>
        </Card>
      )}
    </div>
  );
}
