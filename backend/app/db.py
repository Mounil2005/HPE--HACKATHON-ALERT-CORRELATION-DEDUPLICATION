"""SQLite persistence layer.

Alerts and clustering are still recomputed in-memory on every pipeline run
(see main.py) — that part of the architecture doesn't need a database. What
was missing is durability: raw ingested alerts and user actions (ack/assign/
dismiss/escalate) lived only in the `_state` dict and the frontend's React
state, so a backend restart or page refresh silently threw them away.

This module gives those two things a home:
  - `alerts` table: every raw alert ever ingested/generated, so a restart
    doesn't lose history.
  - `alert_actions` table: one row per alert id holding the user-applied
    overrides (ack, assignee, status override, escalated), keyed so they
    survive independently of whatever batch the alert came from.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import Column, String, Boolean, DateTime, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DB_PATH = Path(__file__).resolve().parents[1] / "alertlens.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class AlertRow(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True)
    payload = Column(String, nullable=False)  # full alert dict, JSON-encoded
    timestamp = Column(DateTime, nullable=False)


class AlertAction(Base):
    __tablename__ = "alert_actions"

    alert_id = Column(String, primary_key=True)
    acked = Column(Boolean, default=False)
    assignee = Column(String, nullable=True)
    status_override = Column(String, nullable=True)  # "suppressed" | "resolved" | None
    escalated = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow)


def init_db() -> None:
    Base.metadata.create_all(engine)


def save_alerts(alerts: list[dict]) -> None:
    """Upsert a batch of raw alerts (id is the natural key)."""
    if not alerts:
        return
    with SessionLocal() as db:
        for a in alerts:
            ts = a["timestamp"]
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts)
            existing = db.get(AlertRow, a["id"])
            payload = json.dumps(a, default=str)
            if existing:
                existing.payload = payload
                existing.timestamp = ts
            else:
                db.add(AlertRow(id=a["id"], payload=payload, timestamp=ts))
        db.commit()


def load_alerts() -> list[dict]:
    with SessionLocal() as db:
        rows = db.query(AlertRow).order_by(AlertRow.timestamp.desc()).all()
        return [json.loads(r.payload) for r in rows]


def clear_alerts() -> None:
    """Used before persisting a fresh batch (new demo batch, dataset switch,
    or /ingest payload) so the alerts table always mirrors exactly what's
    currently shown, rather than accumulating every batch ever loaded.

    Deliberately leaves alert_actions alone: on a plain backend restart,
    run_pipeline() re-saves the *same* persisted alerts (same ids), and
    actions taken on them must survive that round-trip. Rows for ids that
    genuinely never reappear (e.g. after a real dataset switch) just become
    inert — cheap enough to leave as-is rather than add clear-on-switch
    logic that would risk wiping actions on the restart path too."""
    with SessionLocal() as db:
        db.query(AlertRow).delete()
        db.commit()


def get_actions() -> dict[str, dict]:
    with SessionLocal() as db:
        rows = db.query(AlertAction).all()
        return {
            r.alert_id: {
                "acked": r.acked,
                "assignee": r.assignee,
                "status_override": r.status_override,
                "escalated": r.escalated,
            }
            for r in rows
        }


def _get_or_create_action(db, alert_id: str) -> AlertAction:
    action = db.get(AlertAction, alert_id)
    if not action:
        action = AlertAction(alert_id=alert_id)
        db.add(action)
    return action


def set_ack(alert_id: str, value: bool) -> None:
    with SessionLocal() as db:
        action = _get_or_create_action(db, alert_id)
        action.acked = value
        action.updated_at = datetime.utcnow()
        db.commit()


def set_assignee(alert_id: str, assignee: str | None) -> None:
    with SessionLocal() as db:
        action = _get_or_create_action(db, alert_id)
        action.assignee = assignee
        action.updated_at = datetime.utcnow()
        db.commit()


def set_status_override(alert_id: str, status: str | None) -> None:
    with SessionLocal() as db:
        action = _get_or_create_action(db, alert_id)
        action.status_override = status
        action.updated_at = datetime.utcnow()
        db.commit()


def set_escalated(alert_id: str, value: bool) -> None:
    with SessionLocal() as db:
        action = _get_or_create_action(db, alert_id)
        action.escalated = value
        action.updated_at = datetime.utcnow()
        db.commit()


class ProviderRow(Base):
    """A provider is a real webhook target - the only kind of external
    integration the backend can actually exercise (one HTTP POST), rather
    than pretending to support Slack/Jira/etc OAuth flows that would just be
    fake buttons."""
    __tablename__ = "providers"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False, default="webhook")
    url = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


def _provider_dict(row: ProviderRow) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "type": row.type,
        "url": row.url,
        "enabled": row.enabled,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def list_providers() -> list[dict]:
    with SessionLocal() as db:
        rows = db.query(ProviderRow).order_by(ProviderRow.created_at.desc()).all()
        return [_provider_dict(r) for r in rows]


def get_provider(provider_id: str) -> dict | None:
    with SessionLocal() as db:
        row = db.get(ProviderRow, provider_id)
        return _provider_dict(row) if row else None


def create_provider(provider_id: str, name: str, url: str, enabled: bool = True) -> dict:
    with SessionLocal() as db:
        row = ProviderRow(id=provider_id, name=name, type="webhook", url=url, enabled=enabled)
        db.add(row)
        db.commit()
        db.refresh(row)
        return _provider_dict(row)


def set_provider_enabled(provider_id: str, enabled: bool) -> dict | None:
    with SessionLocal() as db:
        row = db.get(ProviderRow, provider_id)
        if not row:
            return None
        row.enabled = enabled
        db.commit()
        db.refresh(row)
        return _provider_dict(row)


class WorkflowRuleRow(Base):
    """A real trigger->action rule - not Keep's YAML step engine, just
    "if this condition, do this one thing" - evaluated against every fresh
    batch of clusters in run_pipeline()."""
    __tablename__ = "workflow_rules"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    trigger_type = Column(String, nullable=False)  # "risk_threshold" | "new_critical_alert"
    trigger_config = Column(String, nullable=False, default="{}")  # JSON-encoded
    action_type = Column(String, nullable=False)  # "notify" | "auto_escalate"
    action_config = Column(String, nullable=False, default="{}")  # JSON-encoded
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class NotificationLogRow(Base):
    """One row per workflow rule firing - real execution history, and the
    dedup key that stops a rule re-firing on the same incident every time
    run_pipeline() reruns (e.g. after an unrelated ack/assign action)."""
    __tablename__ = "notification_log"

    id = Column(String, primary_key=True)
    rule_id = Column(String, nullable=False)
    incident_key = Column(String, nullable=False)  # root-cause alert id
    provider_id = Column(String, nullable=True)
    status = Column(String, nullable=False)  # "success" | "failed"
    detail = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


def _workflow_rule_dict(row: WorkflowRuleRow) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "trigger_type": row.trigger_type,
        "trigger_config": json.loads(row.trigger_config),
        "action_type": row.action_type,
        "action_config": json.loads(row.action_config),
        "enabled": row.enabled,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def list_workflow_rules() -> list[dict]:
    with SessionLocal() as db:
        rows = db.query(WorkflowRuleRow).order_by(WorkflowRuleRow.created_at.desc()).all()
        return [_workflow_rule_dict(r) for r in rows]


def get_workflow_rule(rule_id: str) -> dict | None:
    with SessionLocal() as db:
        row = db.get(WorkflowRuleRow, rule_id)
        return _workflow_rule_dict(row) if row else None


def create_workflow_rule(rule_id: str, name: str, trigger_type: str, trigger_config: dict,
                          action_type: str, action_config: dict, enabled: bool = True) -> dict:
    with SessionLocal() as db:
        row = WorkflowRuleRow(
            id=rule_id, name=name, trigger_type=trigger_type,
            trigger_config=json.dumps(trigger_config), action_type=action_type,
            action_config=json.dumps(action_config), enabled=enabled,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _workflow_rule_dict(row)


def set_workflow_rule_enabled(rule_id: str, enabled: bool) -> dict | None:
    with SessionLocal() as db:
        row = db.get(WorkflowRuleRow, rule_id)
        if not row:
            return None
        row.enabled = enabled
        db.commit()
        db.refresh(row)
        return _workflow_rule_dict(row)


def delete_workflow_rule(rule_id: str) -> None:
    with SessionLocal() as db:
        row = db.get(WorkflowRuleRow, rule_id)
        if row:
            db.delete(row)
            db.commit()


def has_fired(rule_id: str, incident_key: str) -> bool:
    with SessionLocal() as db:
        return (
            db.query(NotificationLogRow)
            .filter_by(rule_id=rule_id, incident_key=incident_key)
            .first()
            is not None
        )


def log_notification(rule_id: str, incident_key: str, provider_id: str | None,
                      status: str, detail: str | None) -> None:
    with SessionLocal() as db:
        db.add(NotificationLogRow(
            id=f"{rule_id}:{incident_key}:{datetime.utcnow().timestamp()}",
            rule_id=rule_id, incident_key=incident_key, provider_id=provider_id,
            status=status, detail=detail,
        ))
        db.commit()


def list_notifications(limit: int = 200) -> list[dict]:
    """Real firing history - every row is a real evaluate_workflow_rules()
    outcome (automation.py), success or failure, not sample data."""
    with SessionLocal() as db:
        rows = (
            db.query(NotificationLogRow)
            .order_by(NotificationLogRow.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "rule_id": r.rule_id,
                "incident_key": r.incident_key,
                "provider_id": r.provider_id,
                "status": r.status,
                "detail": r.detail,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]


def last_fired_at(rule_id: str) -> str | None:
    with SessionLocal() as db:
        row = (
            db.query(NotificationLogRow)
            .filter_by(rule_id=rule_id)
            .order_by(NotificationLogRow.created_at.desc())
            .first()
        )
        return row.created_at.isoformat() if row else None


def delete_provider(provider_id: str) -> None:
    with SessionLocal() as db:
        row = db.get(ProviderRow, provider_id)
        if row:
            db.delete(row)
            db.commit()


class MaintenanceWindowRow(Base):
    """A real time window during which alerts from a service (or every
    service, if unset) are suppressed - evaluated against wall-clock time on
    every run_pipeline() call, not a persisted per-alert action, so a window
    stops applying the moment it ends."""
    __tablename__ = "maintenance_windows"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    service = Column(String, nullable=True)  # None = applies to every service
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


def _maintenance_window_dict(row: MaintenanceWindowRow) -> dict:
    now = datetime.utcnow()
    return {
        "id": row.id,
        "name": row.name,
        "service": row.service,
        "start_time": row.start_time.isoformat(),
        "end_time": row.end_time.isoformat(),
        "enabled": row.enabled,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "active": bool(row.enabled and row.start_time <= now <= row.end_time),
    }


def list_maintenance_windows() -> list[dict]:
    with SessionLocal() as db:
        rows = (
            db.query(MaintenanceWindowRow)
            .order_by(MaintenanceWindowRow.start_time.desc())
            .all()
        )
        return [_maintenance_window_dict(r) for r in rows]


def list_active_maintenance_windows() -> list[dict]:
    """Real, computed right now - not a cached "is active" flag that could
    go stale between pipeline runs."""
    now = datetime.utcnow()
    with SessionLocal() as db:
        rows = (
            db.query(MaintenanceWindowRow)
            .filter(
                MaintenanceWindowRow.enabled == True,  # noqa: E712
                MaintenanceWindowRow.start_time <= now,
                MaintenanceWindowRow.end_time >= now,
            )
            .all()
        )
        return [_maintenance_window_dict(r) for r in rows]


def create_maintenance_window(window_id: str, name: str, service: str | None,
                               start_time: datetime, end_time: datetime,
                               enabled: bool = True) -> dict:
    with SessionLocal() as db:
        row = MaintenanceWindowRow(
            id=window_id, name=name, service=service,
            start_time=start_time, end_time=end_time, enabled=enabled,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _maintenance_window_dict(row)


def set_maintenance_window_enabled(window_id: str, enabled: bool) -> dict | None:
    with SessionLocal() as db:
        row = db.get(MaintenanceWindowRow, window_id)
        if not row:
            return None
        row.enabled = enabled
        db.commit()
        db.refresh(row)
        return _maintenance_window_dict(row)


def delete_maintenance_window(window_id: str) -> None:
    with SessionLocal() as db:
        row = db.get(MaintenanceWindowRow, window_id)
        if row:
            db.delete(row)
            db.commit()
