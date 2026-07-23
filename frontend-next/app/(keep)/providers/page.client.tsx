"use client";

import { useState } from "react";
import { Badge, Button, Card, Text, TextInput } from "@tremor/react";
import { VscDebugDisconnect } from "react-icons/vsc";
import { LuTrash2, LuSend } from "react-icons/lu";
import {
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
  showErrorToast,
  showSuccessToast,
} from "@/shared/ui";
import { useProviders, useProviderActions } from "@/entities/alertlens";
import { DataTable, TableHead, Th, Tr, Td } from "@/entities/alertlens/ui/Table";
import type { Provider } from "@/entities/alertlens";

function AddProviderForm({ onAdd }: { onAdd: (name: string, url: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSubmitting(true);
    try {
      await onAdd(name.trim(), url.trim());
      setName("");
      setUrl("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1 w-full">
          <Text className="text-xs mb-1">Name</Text>
          <TextInput
            placeholder="e.g. On-call Slack channel"
            value={name}
            onValueChange={setName}
          />
        </div>
        <div className="flex-[2] w-full">
          <Text className="text-xs mb-1">Webhook URL</Text>
          <TextInput
            placeholder="https://..."
            value={url}
            onValueChange={setUrl}
          />
        </div>
        <Button type="submit" color="orange" loading={submitting} disabled={submitting}>
          Add provider
        </Button>
      </form>
    </Card>
  );
}

function ProviderRow({ provider }: { provider: Provider }) {
  const { deleteProvider, testProvider } = useProviderActions();
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testProvider(provider.id);
      if (result.status === "success") {
        showSuccessToast(result.detail);
      } else {
        showErrorToast(new Error(result.detail), `Test failed: ${result.detail}`);
      }
    } catch (error) {
      showErrorToast(error, "Could not reach the backend to run the test");
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete provider "${provider.name}"?`)) return;
    setDeleting(true);
    try {
      await deleteProvider(provider.id);
    } catch (error) {
      showErrorToast(error, "Failed to delete provider");
      setDeleting(false);
    }
  };

  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-2">
          <VscDebugDisconnect className="text-gray-400 shrink-0" />
          <span className="font-medium">{provider.name}</span>
        </div>
      </Td>
      <Td>
        <Badge color="gray" size="xs">
          webhook
        </Badge>
      </Td>
      <Td>
        <span className="text-xs text-gray-500 font-mono truncate block max-w-md">
          {provider.url}
        </span>
      </Td>
      <Td>
        <div className="flex items-center gap-1 justify-end">
          <Button
            size="xs"
            variant="secondary"
            color="orange"
            icon={LuSend}
            loading={testing}
            disabled={testing || deleting}
            onClick={handleTest}
          >
            Test
          </Button>
          <Button
            size="xs"
            variant="secondary"
            color="red"
            icon={LuTrash2}
            loading={deleting}
            disabled={testing || deleting}
            onClick={handleDelete}
          />
        </div>
      </Td>
    </Tr>
  );
}

export default function ProvidersPage() {
  const { data: providers, isLoading, error } = useProviders();
  const { createProvider } = useProviderActions();

  const handleAdd = async (name: string, url: string) => {
    try {
      await createProvider(name, url);
      showSuccessToast(`Added provider "${name}"`);
    } catch (err) {
      showErrorToast(err, "Failed to add provider");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageTitle>Providers</PageTitle>
        <PageSubtitle>
          Real webhook targets AlertLens can notify. Add one, then use Test to
          fire an actual HTTP request and see what comes back.
        </PageSubtitle>
      </div>

      <AddProviderForm onAdd={handleAdd} />

      {isLoading ? (
        <KeepLoader includeMinHeight={false} loadingText="Loading providers..." />
      ) : error ? (
        <EmptyStateCard
          icon={VscDebugDisconnect}
          title="Could not load providers"
          description={String(error)}
        />
      ) : !providers || providers.length === 0 ? (
        <Card>
          <EmptyStateCard
            noCard
            icon={VscDebugDisconnect}
            title="No providers yet"
            description="Add a webhook URL above to get started."
          />
        </Card>
      ) : (
        <Card>
          <DataTable>
            <TableHead>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>URL</Th>
              <Th className="text-right">Actions</Th>
            </TableHead>
            <tbody>
              {providers.map((p) => (
                <ProviderRow key={p.id} provider={p} />
              ))}
            </tbody>
          </DataTable>
        </Card>
      )}
    </div>
  );
}
