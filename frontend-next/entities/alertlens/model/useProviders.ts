import { useCallback } from "react";
import useSWR, { useSWRConfig, SWRConfiguration } from "swr";
import { useApi } from "@/shared/lib/hooks/useApi";
import type { Provider, ProviderTestResult } from "./types";

export const PROVIDERS_KEY = "/providers";

/** GET /providers — real webhook targets, persisted in the backend's DB. */
export const useProviders = (options: SWRConfiguration = {}) => {
  const api = useApi();

  return useSWR<Provider[]>(
    api.isReady() ? PROVIDERS_KEY : null,
    (url: string) => api.get(url),
    options
  );
};

/** Create/delete/test actions — each revalidates PROVIDERS_KEY afterwards. */
export const useProviderActions = () => {
  const api = useApi();
  const { mutate } = useSWRConfig();

  const refresh = useCallback(() => mutate(PROVIDERS_KEY), [mutate]);

  const createProvider = useCallback(
    async (name: string, url: string) => {
      const result = await api.post<Provider>(PROVIDERS_KEY, { name, url });
      await refresh();
      return result;
    },
    [api, refresh]
  );

  const deleteProvider = useCallback(
    async (id: string) => {
      await api.delete(`${PROVIDERS_KEY}/${id}`);
      await refresh();
    },
    [api, refresh]
  );

  /** Fires one real HTTP POST to the provider's URL and returns what actually happened. */
  const testProvider = useCallback(
    (id: string) => api.post<ProviderTestResult>(`${PROVIDERS_KEY}/${id}/test`),
    [api]
  );

  return { createProvider, deleteProvider, testProvider };
};
