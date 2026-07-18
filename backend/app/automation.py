"""Workflow rule engine.

Not Keep's YAML step engine — a workflow rule here is one real,
small "if this condition, do this one thing" pair, evaluated against every
freshly-computed batch of clusters in run_pipeline(). Two trigger types
(risk threshold, new critical alert) and two action types (notify via a
real provider webhook, auto-escalate) is the whole vocabulary.
"""

from __future__ import annotations

from . import db
from .providers import notify_webhook


def _trigger_matches(rule: dict, cluster: dict) -> bool:
    trigger_type = rule["trigger_type"]
    config = rule.get("trigger_config") or {}
    if trigger_type == "risk_threshold":
        min_risk = float(config.get("min_risk", 0.8))
        return float((cluster.get("risk") or {}).get("score", 0)) >= min_risk
    if trigger_type == "new_critical_alert":
        return (cluster.get("root_cause") or {}).get("severity") == "critical"
    return False


def evaluate_workflow_rules(clusters: list[dict]) -> None:
    rules = [r for r in db.list_workflow_rules() if r["enabled"]]
    if not rules:
        return

    for rule in rules:
        for cluster in clusters:
            root = cluster.get("root_cause") or {}
            # Cluster ids are recomputed every pipeline run, but a cluster's
            # root-cause alert id is stable for the same incident - use that
            # as the dedup key so a rule fires once per real incident, not
            # once per rerun (ack/assign/dismiss/escalate all rerun the
            # pipeline over the same batch).
            incident_key = str(root.get("id") or cluster.get("cluster_id"))
            if db.has_fired(rule["id"], incident_key):
                continue
            if not _trigger_matches(rule, cluster):
                continue
            _fire(rule, cluster, incident_key)


def _fire(rule: dict, cluster: dict, incident_key: str) -> None:
    action_type = rule["action_type"]
    config = rule.get("action_config") or {}
    root = cluster.get("root_cause") or {}

    if action_type == "auto_escalate":
        alerts = cluster.get("alerts", [])
        for alert in alerts:
            db.set_escalated(alert["id"], True)
        db.log_notification(
            rule["id"], incident_key, None, "success",
            f"Auto-escalated {len(alerts)} alert(s) on {root.get('service')}.",
        )
        return

    if action_type == "notify":
        provider_id = config.get("provider_id")
        provider = db.get_provider(provider_id) if provider_id else None
        if not provider:
            db.log_notification(rule["id"], incident_key, provider_id, "failed",
                                 "Provider not found or not configured.")
            return
        payload = {
            "event": "alertlens.workflow_fired",
            "rule": rule["name"],
            "incident_id": cluster.get("cluster_id"),
            "root_cause": {"service": root.get("service"), "alertname": root.get("alertname")},
            "risk_level": (cluster.get("risk") or {}).get("level"),
            "risk_score": (cluster.get("risk") or {}).get("score"),
            "summary": cluster.get("summary"),
        }
        result = notify_webhook(provider["url"], payload)
        db.log_notification(rule["id"], incident_key, provider_id,
                             result["status"], result.get("detail"))
