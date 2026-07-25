"use client";

import { Badge, Card } from "@tremor/react";
import { MdOutlineNotificationsActive } from "react-icons/md";
import {
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
} from "@/shared/ui";
import {
  useNotificationLog,
  useWorkflowRules,
  useProviders,
} from "@/entities/alertlens";
import { DataTable, TableHead, Th, Tr, Td } from "@/entities/alertlens/ui/Table";
import { timeAgo } from "@/entities/alertlens/lib/format";

export default function NotificationsPage() {
  const { data: log, isLoading, error } = useNotificationLog();
  const { data: rules } = useWorkflowRules();
  const { data: providers } = useProviders();

  const ruleName = (id: string) => rules?.find((r) => r.id === id)?.name ?? id;
  const providerName = (id: string | null) =>
    id ? providers?.find((p) => p.id === id)?.name ?? id : "—";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageTitle>Notifications</PageTitle>
        <PageSubtitle>
          Real history of every Workflows rule firing — what actually ran,
          when, and whether it succeeded.
        </PageSubtitle>
      </div>

      {isLoading ? (
        <KeepLoader includeMinHeight={false} loadingText="Loading notification log..." />
      ) : error ? (
        <EmptyStateCard
          icon={MdOutlineNotificationsActive}
          title="Could not load notifications"
          description={String(error)}
        />
      ) : !log || log.length === 0 ? (
        <Card>
          <EmptyStateCard
            noCard
            icon={MdOutlineNotificationsActive}
            title="No notifications yet"
            description="Add a rule on the Workflows page — its firings will show up here."
          />
        </Card>
      ) : (
        <Card>
          <DataTable>
            <TableHead sticky>
              <Th>When</Th>
              <Th>Rule</Th>
              <Th>Provider</Th>
              <Th>Status</Th>
              <Th>Detail</Th>
            </TableHead>
            <tbody>
              {log.map((entry) => (
                <Tr key={entry.id}>
                  <Td>
                    <span className="text-xs text-gray-500">{timeAgo(entry.created_at)}</span>
                  </Td>
                  <Td>
                    <span className="text-sm">{ruleName(entry.rule_id)}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-gray-500">
                      {providerName(entry.provider_id)}
                    </span>
                  </Td>
                  <Td>
                    <Badge color={entry.status === "success" ? "emerald" : "red"} size="xs">
                      {entry.status}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="text-xs text-gray-600">{entry.detail ?? "—"}</span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      )}
    </div>
  );
}
