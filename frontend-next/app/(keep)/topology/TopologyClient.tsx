"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Background,
  Controls,
  Edge,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Badge, Card, Text } from "@tremor/react";
import {
  EmptyStateCard,
  KeepLoader,
  PageSubtitle,
  PageTitle,
} from "@/shared/ui";
import { TbTopologyRing } from "react-icons/tb";
import { HiOutlineServerStack } from "react-icons/hi2";
import { usePipelineState } from "@/entities/alertlens";
import { StatCard } from "@/entities/alertlens/ui/StatCard";
import {
  buildTopology,
  layoutTopology,
  NODE_H,
  NODE_W,
  type TopologyNode,
} from "@/entities/alertlens/lib/buildTopology";

const STATUS_STYLE: Record<string, { ring: string; badge: string; label: string }> = {
  critical: {
    ring: "border-red-400 bg-red-50",
    badge: "red",
    label: "Critical",
  },
  warning: {
    ring: "border-amber-400 bg-amber-50",
    badge: "amber",
    label: "Degraded",
  },
  healthy: {
    ring: "border-gray-200 bg-white",
    badge: "emerald",
    label: "Healthy",
  },
};

type ServiceNodeData = { topo: TopologyNode };

function ServiceNode({ data }: NodeProps<Node<ServiceNodeData>>) {
  const { topo } = data;
  const style = STATUS_STYLE[topo.status] ?? STATUS_STYLE.healthy;

  const body = (
    <div
      className={`rounded-lg border-2 p-3 shadow-sm ${style.ring}`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm truncate">{topo.service}</div>
        {topo.isRoot && (
          <Badge size="xs" color="red">
            root
          </Badge>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {topo.activeAlerts} alert{topo.activeAlerts === 1 ? "" : "s"}
        {topo.activeAlerts > 0 && ` · ${topo.errorRate}% sev`}
      </div>
      <div className="mt-1">
        <Badge size="xs" color={style.badge as never}>
          {style.label}
        </Badge>
      </div>
    </div>
  );

  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      {topo.cluster ? (
        <Link href={`/incidents/${topo.cluster.cluster_id}`}>{body}</Link>
      ) : (
        body
      )}
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
}

const nodeTypes = { service: ServiceNode };

export function TopologyClient() {
  const { state, isLoading, error } = usePipelineState();

  const { flowNodes, flowEdges, stats } = useMemo(() => {
    const { nodes, edges } = buildTopology(state);
    const positions = layoutTopology(nodes, edges);

    const fNodes: Node<ServiceNodeData>[] = nodes.map((n) => ({
      id: n.id,
      type: "service",
      position: positions[n.id] ?? { x: 0, y: 0 },
      data: { topo: n },
      draggable: true,
      // Declare dimensions up front: React Flow needs measured nodes before it
      // will route edges or run fitView, and relying on its ResizeObserver
      // leaves them unmeasured when we swap node objects on data refresh.
      width: NODE_W,
      height: NODE_H,
    }));

    const fEdges: Edge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.cluster.risk.level === "high",
      style: {
        stroke: e.cluster.risk.level === "high" ? "#ef4444" : "#f59e0b",
        strokeWidth: 2,
      },
      markerEnd: { type: MarkerType.ArrowClosed },
    }));

    return {
      flowNodes: fNodes,
      flowEdges: fEdges,
      stats: {
        total: nodes.length,
        critical: nodes.filter((n) => n.status === "critical").length,
        warning: nodes.filter((n) => n.status === "warning").length,
        healthy: nodes.filter((n) => n.status === "healthy").length,
        edges: edges.length,
      },
    };
  }, [state]);

  // React Flow v12 needs to own node state so it can record measured
  // dimensions — fully controlled `nodes` with no onNodesChange leaves nodes
  // unmeasured and edges never render.
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
  }, [flowNodes, setNodes]);

  useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  if (isLoading) {
    return <KeepLoader loadingText="Building service topology..." />;
  }

  if (error) {
    return (
      <div className="p-4">
        <EmptyStateCard
          icon={TbTopologyRing}
          title="Could not load topology"
          description={String(error)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div>
        <PageTitle>Service Topology</PageTitle>
        <PageSubtitle>
          Service dependencies inferred from correlated incidents — links are
          drawn from a root-cause service to the other services in its incident.
        </PageSubtitle>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label="Services"
          value={stats.total}
          hint="Seen in the current batch"
          icon={HiOutlineServerStack}
          color="blue"
        />
        <StatCard
          label="Critical"
          value={stats.critical}
          hint="Root cause or high-risk incident"
          icon={TbTopologyRing}
          color="red"
        />
        <StatCard
          label="Degraded"
          value={stats.warning}
          hint="In an incident, not the root"
          icon={TbTopologyRing}
          color="amber"
        />
        <StatCard
          label="Correlated links"
          value={stats.edges}
          hint="Incident-derived dependencies"
          icon={TbTopologyRing}
          color="orange"
        />
      </div>

      {flowNodes.length === 0 ? (
        <Card>
          <EmptyStateCard
            noCard
            icon={TbTopologyRing}
            title="No services to map"
            description="Load an alert batch to derive the service topology."
          />
        </Card>
      ) : (
        <Card className="flex-1 min-h-[500px] p-0 overflow-hidden">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </Card>
      )}

      <Text className="text-xs text-gray-500">
        Click a service that belongs to an incident to open it.
      </Text>
    </div>
  );
}
