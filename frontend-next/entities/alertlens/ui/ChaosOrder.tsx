"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Text, Title } from "@tremor/react";
import { LuPlay } from "react-icons/lu";
import { usePipelineState } from "@/entities/alertlens";

const PALETTE = [
  "#40c057",
  "#339af0",
  "#fab005",
  "#e64980",
  "#7950f2",
  "#15aabf",
];

/**
 * Deterministic pseudo-random from a string, so scatter positions are stable
 * across re-renders but different per alert.
 */
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type Phase = "scatter" | "collapse" | "reveal";

type Dot = {
  id: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  color: string;
};

/**
 * Visualises what the engine does: raw alerts land scattered, then collapse
 * into their correlated incidents while uncorrelated noise drops to a line at
 * the bottom.
 */
export function ChaosOrder() {
  const { state } = usePipelineState();
  const clusters = state.clusters;
  const noise = state.noise;
  const rawCount = state.dedup_stats?.raw_count ?? 0;

  const [phase, setPhase] = useState<Phase>("scatter");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dots = useMemo<Dot[]>(() => {
    const out: Dot[] = [];

    clusters.forEach((c, ci) => {
      const cx = ((ci + 1) / (clusters.length + 1)) * 100;
      c.alerts.forEach((a, i) => {
        const angle = (i / c.alerts.length) * Math.PI * 2 - Math.PI / 2;
        out.push({
          id: a.id,
          sx: 4 + ((hash(a.id) % 9000) / 9000) * 92,
          sy: 6 + ((hash(a.id + "y") % 9000) / 9000) * 74,
          tx: cx + Math.cos(angle) * 4.2,
          ty: 36 + Math.sin(angle) * 10,
          color: PALETTE[c.cluster_id % PALETTE.length],
        });
      });
    });

    noise.forEach((a, i) => {
      out.push({
        id: a.id,
        sx: 4 + ((hash(a.id) % 9000) / 9000) * 92,
        sy: 6 + ((hash(a.id + "y") % 9000) / 9000) * 74,
        tx: 6 + (i / Math.max(noise.length - 1, 1)) * 88,
        ty: 88,
        color: "#9ca3af",
      });
    });

    return out;
  }, [clusters, noise]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const play = useCallback(() => {
    clearTimers();
    setPhase("scatter");
    timers.current.push(setTimeout(() => setPhase("collapse"), 700));
    timers.current.push(setTimeout(() => setPhase("reveal"), 2100));
  }, [clearTimers]);

  useEffect(() => {
    if (dots.length > 0) play();
    return clearTimers;
  }, [dots.length, play, clearTimers]);

  if (dots.length === 0) return null;

  const collapsed = phase !== "scatter";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <Title className="text-base">Chaos → Order</Title>
          <Text className="text-xs text-gray-500">
            {rawCount} raw alerts collapsing into {clusters.length} incidents,
            with {noise.length} left as background noise.
          </Text>
        </div>
        <Button size="xs" variant="secondary" color="orange" icon={LuPlay} onClick={play}>
          Replay
        </Button>
      </div>

      <div className="relative w-full h-64 rounded-lg bg-gray-50 dark:bg-gray-900/40 overflow-hidden">
        {dots.map((d, i) => (
          <span
            key={d.id}
            className="absolute rounded-full"
            style={{
              width: 7,
              height: 7,
              backgroundColor: d.color,
              left: `${collapsed ? d.tx : d.sx}%`,
              top: `${collapsed ? d.ty : d.sy}%`,
              opacity: collapsed ? 0.95 : 0.55,
              transform: "translate(-50%, -50%)",
              transition:
                "left 1.1s cubic-bezier(0.22,1,0.36,1), top 1.1s cubic-bezier(0.22,1,0.36,1), opacity 0.6s ease",
              // Stagger so the collapse reads as a sweep rather than a snap.
              transitionDelay: `${(i % 25) * 18}ms`,
            }}
          />
        ))}

        {phase === "reveal" &&
          clusters.map((c, ci) => (
            <div
              key={c.cluster_id}
              className="absolute text-[11px] font-medium text-center -translate-x-1/2 whitespace-nowrap"
              style={{
                left: `${((ci + 1) / (clusters.length + 1)) * 100}%`,
                top: "56%",
                color: PALETTE[c.cluster_id % PALETTE.length],
              }}
            >
              {c.root_cause.service}
              <div className="text-gray-500">{c.size} alerts</div>
            </div>
          ))}

        {phase === "reveal" && noise.length > 0 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 text-[11px] text-gray-500"
            style={{ top: "93%" }}
          >
            {noise.length} uncorrelated
          </div>
        )}
      </div>
    </Card>
  );
}
