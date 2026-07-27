import useSWRImmutable from "swr/immutable";
import { SWRConfiguration } from "swr";
import { useApi } from "@/shared/lib/hooks/useApi";
import type { RulesConfig } from "./types";

export const RULES_CONFIG_KEY = "/rules/config";

/** GET /rules/config — the real, already-tuned correlation engine
 * parameters. Immutable: these are grid-searched constants, not runtime
 * state, so there's nothing to revalidate. */
export const useRulesConfig = (options: SWRConfiguration = {}) => {
  const api = useApi();

  return useSWRImmutable<RulesConfig>(
    api.isReady() ? RULES_CONFIG_KEY : null,
    (url: string) => api.get(url),
    options
  );
};
