import useSWR, { SWRConfiguration } from "swr";
import { useApi } from "@/shared/lib/hooks/useApi";
import type { NotificationLogEntry } from "./types";

export const NOTIFICATIONS_KEY = "/notifications";

/** GET /notifications — real firing history from the workflow rule engine. */
export const useNotificationLog = (options: SWRConfiguration = {}) => {
  const api = useApi();

  return useSWR<NotificationLogEntry[]>(
    api.isReady() ? NOTIFICATIONS_KEY : null,
    (url: string) => api.get(url),
    options
  );
};
