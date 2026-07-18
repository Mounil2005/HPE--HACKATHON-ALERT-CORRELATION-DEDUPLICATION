"""AI Remediation Playbook Module.

Generates structured, actionable incident response runbooks derived from existing
pipeline outputs (Root Cause, Risk Score, Alert DNA, and Affected Services).
"""

from typing import Any, Dict, List


def generate_playbook(cluster: Dict[str, Any]) -> Dict[str, Any]:
    """Generates an enterprise SRE remediation playbook for an incident cluster."""
    if not cluster:
        return {
            "title": "Generic Incident Recovery Playbook",
            "priority": "High P2",
            "estimated_resolution": "15 minutes",
            "confidence": 80,
            "steps": [],
            "validation": [],
            "rollback": [],
            "business_impact": {},
        }

    root = cluster.get("root_cause", {})
    risk = cluster.get("risk", {})
    dna = cluster.get("dna_match")
    alerts = cluster.get("alerts", [])

    root_svc = root.get("service", "unknown-service")
    root_alertname = root.get("alertname", "ServiceFailure")
    root_severity = root.get("severity", "high")

    affected_services = list({a.get("service") for a in alerts if a.get("service")})
    downstream_svcs = [s for s in affected_services if s != root_svc]

    risk_level = risk.get("level", "high")
    priority = "Critical P1" if risk_level == "high" or root_severity == "critical" else "High P2"

    res_minutes = dna.get("resolution_minutes") if dna else (cluster.get("est_triage_minutes_saved") or 12)
    confidence = int(round(dna.get("similarity_pct", 88.0))) if dna else 85

    title = f"{root_svc.replace('-', ' ').title()} Incident Remediation Playbook"

    hist_resolution = dna.get("resolution") if dna else f"Restart {root_svc} worker pool and flush stale connection queues."

    steps = [
        {
            "step_number": 1,
            "title": f"Verify {root_svc} Health & Connectivity",
            "description": f"Execute ICMP ping & TCP health check on {root_svc} (port 5432/8080). Verify container status via kubectl / docker ps.",
            "estimated_duration": "2 min",
            "priority": "Critical",
            "risk": "Low",
            "dependency": "None",
        },
        {
            "step_number": 2,
            "title": f"Inspect Resource Limits & Storage",
            "description": f"Verify disk volume usage, CPU saturation, and memory limits on {root_svc} primary node.",
            "estimated_duration": "3 min",
            "priority": "High",
            "risk": "Low",
            "dependency": "Step 1",
        },
        {
            "step_number": 3,
            "title": "Execute Primary Recovery Action",
            "description": f"{hist_resolution}",
            "estimated_duration": f"{max(1, res_minutes // 3)} min",
            "priority": "Critical",
            "risk": "Medium",
            "dependency": "Step 2",
        },
        {
            "step_number": 4,
            "title": "Verify Downstream Consumer Recovery",
            "description": f"Confirm 5xx error rate drops below 0.1% on downstream services: {', '.join(downstream_svcs[:3]) if downstream_svcs else root_svc}.",
            "estimated_duration": "3 min",
            "priority": "High",
            "risk": "Low",
            "dependency": "Step 3",
        },
    ]

    validation = [
        f"Verify {root_svc} health endpoint returns HTTP 200 OK",
        f"Confirm active queue depth on {root_svc} remains below 15%",
        f"Validate HTTP 5xx error rate across {len(affected_services)} services drops below 0.1%",
        "Ensure Prometheus alert firing status transitions to Resolved",
    ]

    rollback = [
        f"Restore previous deployment configuration for {root_svc}",
        f"Flush connection poolers and fail over {root_svc} to standby read-replica",
        "Escalate to Tier-2 SRE Incident Commander & notify Security Operations Center (SOC)",
    ]

    business_impact = {
        "current": f"Degraded performance on {root_svc} impacting {len(affected_services)} dependent services.",
        "estimated_if_unresolved": f"Potential ${len(affected_services) * 14000:,} revenue risk if unresolved within 30 minutes.",
        "impacted_systems": affected_services,
    }

    return {
        "title": title,
        "priority": priority,
        "estimated_resolution": f"{res_minutes}-{res_minutes + 5} minutes",
        "confidence": confidence,
        "steps": steps,
        "validation": validation,
        "rollback": rollback,
        "business_impact": business_impact,
    }
