"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card, Text, Textarea, Title } from "@tremor/react";
import { HiOutlineSparkles } from "react-icons/hi2";
import { LuSend, LuRefreshCw } from "react-icons/lu";
import { EmptyStateCard, KeepLoader, PageSubtitle, PageTitle } from "@/shared/ui";
import { MarkdownHTML } from "@/shared/ui/MarkdownHTML/MarkdownHTML";
import { useSummarizerCheck, useSettingsStatus, useAssistant } from "@/entities/alertlens";
import type { AssistantMessage } from "@/entities/alertlens";

function ProviderStatusCard() {
  const { data: check, isLoading, error, mutate } = useSummarizerCheck();
  const { data: status } = useSettingsStatus();

  const working = check?.status === "working";
  const noKey = check?.status === "no_key";

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <Text className="text-xs uppercase tracking-wide text-gray-400">
          LLM provider
        </Text>
        <Button
          size="xs"
          variant="secondary"
          color="gray"
          icon={LuRefreshCw}
          onClick={() => mutate()}
        >
          Recheck
        </Button>
      </div>

      {isLoading ? (
        <KeepLoader includeMinHeight={false} loadingText="Checking provider..." />
      ) : error ? (
        <Text className="text-sm text-red-500">Could not reach the backend to check.</Text>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge color={working ? "emerald" : noKey ? "gray" : "red"} size="xs">
              {working ? "reachable" : noKey ? "not configured" : "unreachable"}
            </Badge>
            {status?.llm_provider && (
              <Text className="text-sm font-medium">{status.llm_provider}</Text>
            )}
          </div>
          <Text className="text-xs text-gray-500">
            {typeof check?.detail === "string"
              ? check.detail
              : working
                ? "Real call to the configured provider succeeded just now."
                : "No detail returned."}
          </Text>
          {working && typeof check?.sample_output === "string" && (
            <Text className="text-xs text-gray-400 italic truncate">
              Sample: &quot;{check.sample_output}&quot;
            </Text>
          )}
        </div>
      )}
    </Card>
  );
}

function LiveTestBox() {
  const { askWorkspaceAssistant, isAsking } = useAssistant();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || isAsking) return;
    setErrorText(null);
    const conversation = messages;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    try {
      const res = await askWorkspaceAssistant({
        question: q,
        conversation,
        workspace_context: { page: "ai" },
      });
      const answer =
        (typeof res?.answer === "string" && res.answer) || "No answer returned.";
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card className="flex flex-col h-[26rem]">
      <div className="flex items-center gap-2 mb-2">
        <HiOutlineSparkles className="w-4 h-4 text-orange-500" />
        <Title className="text-sm">Live test</Title>
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
        {messages.length === 0 && (
          <Text className="text-sm text-gray-500">
            Ask the real assistant a question — this hits the same endpoint as
            the chat widget on every page, live.
          </Text>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "self-end max-w-[85%] rounded-lg bg-orange-500 text-white px-3 py-2 text-sm"
                : "self-start max-w-[95%] rounded-lg bg-gray-100 px-3 py-2 text-sm"
            }
          >
            {m.role === "user" ? m.content : <MarkdownHTML>{m.content}</MarkdownHTML>}
          </div>
        ))}
        {errorText && (
          <div className="self-start max-w-[95%] rounded-lg bg-red-50 text-red-600 px-3 py-2 text-sm">
            {errorText}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-end gap-2 pt-2 border-t border-gray-100 mt-2">
        <Textarea
          rows={1}
          autoHeight
          className="flex-1 resize-none max-h-24"
          placeholder="e.g. What are the top risk incidents right now?"
          value={input}
          onValueChange={setInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <Button
          size="xs"
          color="orange"
          icon={LuSend}
          loading={isAsking}
          disabled={!input.trim()}
          onClick={() => send(input)}
        >
          Send
        </Button>
      </div>
    </Card>
  );
}

export default function AIPage() {
  const { data: status } = useSettingsStatus();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <PageTitle>AI</PageTitle>
        <PageSubtitle>
          Real LLM provider status and a live test of the same assistant used
          across the app — not mock usage stats.
        </PageSubtitle>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProviderStatusCard />
        <Card>
          <Text className="text-xs uppercase tracking-wide text-gray-400 mb-2">
            Engine snapshot
          </Text>
          {status ? (
            <Text className="text-sm text-gray-600">
              The assistant answers from this same live pipeline state:{" "}
              <strong>{status.active_incident_count}</strong> active incident
              {status.active_incident_count === 1 ? "" : "s"} across{" "}
              <strong>{status.persisted_alert_count}</strong> persisted alerts
              (<Badge color="orange" size="xs">{status.dataset}</Badge>).
              When the LLM is unreachable, questions still get a real answer
              computed directly from this data instead of failing.
            </Text>
          ) : (
            <EmptyStateCard
              noCard
              icon={HiOutlineSparkles}
              title="No status yet"
              description="Loading..."
            />
          )}
        </Card>
      </div>

      <LiveTestBox />
    </div>
  );
}
