import { useCallback } from "react";
import useSWR, { useSWRConfig, SWRConfiguration } from "swr";
import { useApi } from "@/shared/lib/hooks/useApi";
import type {
  WorkflowRule,
  WorkflowTriggerType,
  WorkflowActionType,
} from "./types";

export const WORKFLOWS_KEY = "/workflows";

/** GET /workflows — real trigger->action rules, evaluated on every pipeline run. */
export const useWorkflowRules = (options: SWRConfiguration = {}) => {
  const api = useApi();

  return useSWR<WorkflowRule[]>(
    api.isReady() ? WORKFLOWS_KEY : null,
    (url: string) => api.get(url),
    options
  );
};

export const useWorkflowRuleActions = () => {
  const api = useApi();
  const { mutate } = useSWRConfig();

  const refresh = useCallback(() => mutate(WORKFLOWS_KEY), [mutate]);

  const createRule = useCallback(
    async (
      name: string,
      trigger_type: WorkflowTriggerType,
      trigger_config: Record<string, unknown>,
      action_type: WorkflowActionType,
      action_config: Record<string, unknown>
    ) => {
      const result = await api.post<WorkflowRule>(WORKFLOWS_KEY, {
        name,
        trigger_type,
        trigger_config,
        action_type,
        action_config,
      });
      await refresh();
      return result;
    },
    [api, refresh]
  );

  const setEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      const result = await api.put<WorkflowRule>(`${WORKFLOWS_KEY}/${id}`, { enabled });
      await refresh();
      return result;
    },
    [api, refresh]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await api.delete(`${WORKFLOWS_KEY}/${id}`);
      await refresh();
    },
    [api, refresh]
  );

  return { createRule, setEnabled, deleteRule };
};
