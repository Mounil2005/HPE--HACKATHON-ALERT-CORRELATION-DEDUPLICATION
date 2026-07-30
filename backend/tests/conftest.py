"""Shared fixtures.

Two isolation concerns drive this file:

1. db.py binds a SQLAlchemy engine/sessionmaker to a fixed file
   (backend/alertlens.db) at import time. Tests must never touch that real
   file, so `isolated_db` monkeypatches `db.engine`/`db.SessionLocal` to a
   fresh SQLite file under pytest's tmp_path for every test function.

2. main.py's lifespan kicks off `_initial_load()` in a background thread
   that races with anything a test does immediately after creating the
   TestClient (it calls run_pipeline() same as any /demo/load request,
   against the same shared `_state` dict). `client` neuters it to a no-op —
   every test that needs pipeline data asks for it explicitly instead of
   relying on startup timing.
"""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ -> `app` importable
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "data"))  # synthetic_alert_generator


@pytest.fixture(autouse=True)
def no_real_llm_calls_by_default(monkeypatch):
    """Guards every test against accidentally making a real network call to
    Cerebras/Groq using whatever real keys happen to be in the repo's real
    .env — run_pipeline() calls summarize() for every cluster it forms, so
    any test that loads pipeline data (most of test_main.py) would otherwise
    hit the real network on every /demo/load, /ingest, or alert action.
    Tests that specifically want to exercise the LLM-call path monkeypatch
    these back within the test itself, which safely overrides this default
    (same monkeypatch fixture, same undo stack)."""
    from app import summarizer

    monkeypatch.setattr(summarizer, "_configured_providers", lambda: [])


@pytest.fixture
def isolated_db(monkeypatch, tmp_path):
    from app import db

    test_engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )
    test_session = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(db, "engine", test_engine)
    monkeypatch.setattr(db, "SessionLocal", test_session)
    db.Base.metadata.create_all(test_engine)
    yield db
    test_engine.dispose()


@pytest.fixture
def client(isolated_db, monkeypatch):
    from fastapi.testclient import TestClient

    import app.main as main_module

    # Every test drives pipeline state explicitly (via /demo/load etc.) —
    # the background initial-load thread would otherwise race it.
    monkeypatch.setattr(main_module, "_initial_load", lambda: None)
    with TestClient(main_module.app) as c:
        yield c


def make_alert(
    service="svc-a",
    alertname="HighErrorRate",
    message="HTTP 5xx rate at 22%",
    severity="critical",
    status="firing",
    ts=None,
    ground_truth="incident",
    id=None,
    source="prometheus",
    duplicate_count=None,
):
    """Builds one alert dict matching data/synthetic_alert_generator.py's
    exact schema (see _make_alert there) — every pipeline stage expects
    these fields."""
    ts = ts or datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    alert = {
        "id": id or str(uuid.uuid4()),
        "service": service,
        "alertname": alertname,
        "message": message,
        "severity": severity,
        "status": status,
        "timestamp": ts.isoformat(timespec="seconds"),
        "source": source,
        "assignee": "n/a",
        "dismissed": status != "firing",
        "ground_truth": ground_truth,
    }
    if duplicate_count is not None:
        alert["duplicate_count"] = duplicate_count
    return alert


def make_cascade(
    n_services=3,
    start=None,
    step_seconds=30,
    severity="critical",
    root_service="postgres-primary",
):
    """A tight, unambiguous cluster: n_services alerts, close in time and
    sharing vocabulary, so clustering.py's DBSCAN reliably groups them as
    one incident in tests that don't care about clustering internals."""
    start = start or datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    alerts = [
        make_alert(
            service=root_service,
            alertname="ConnectionPoolExhausted",
            message="Connection pool exhausted: 200/200 in use",
            severity=severity,
            ts=start,
        )
    ]
    for i in range(1, n_services):
        alerts.append(
            make_alert(
                service=f"downstream-svc-{i}",
                alertname="UpstreamTimeout",
                message="Upstream timeout: connection pool exhausted upstream",
                severity=severity,
                ts=start + timedelta(seconds=i * step_seconds),
            )
        )
    return alerts


def make_cluster(
    cluster_id=0,
    root_service="postgres-primary",
    root_alertname="DBConnectionPoolExhausted",
    root_severity="critical",
    risk_score=0.75,
    risk_level="high",
    n_alerts=3,
    n_services=3,
    dna_match=None,
    factors=None,
):
    """Builds one cluster dict matching main.py's run_pipeline() output
    shape — the shape forecast.py / root_cause_confidence.py / playbook.py
    all consume."""
    start = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    alerts = []
    for i in range(n_alerts):
        svc = root_service if i == 0 else f"downstream-svc-{i % max(n_services - 1, 1)}"
        alerts.append(
            make_alert(
                service=svc,
                alertname=root_alertname if i == 0 else "UpstreamTimeout",
                ts=start + timedelta(seconds=i * 30),
                severity=root_severity if i == 0 else "high",
            )
        )
    root_cause = {
        "id": alerts[0]["id"],
        "service": root_service,
        "alertname": root_alertname,
        "severity": root_severity,
    }
    return {
        "cluster_id": cluster_id,
        "size": len(alerts),
        "raw_alert_count": len(alerts),
        "root_cause": root_cause,
        "risk": {
            "score": risk_score,
            "level": risk_level,
            "factors": factors or {"growth_rate": 0.4, "severity_trend": 0.4, "service_spread": 0.4},
            "services_affected": len({a["service"] for a in alerts}),
        },
        "dna_match": dna_match,
        "summary": f"Suspected root cause: {root_alertname} on {root_service}.",
        "est_triage_minutes_saved": 12,
        "alerts": alerts,
    }


def make_dna_match(
    incident_id="INC-0389",
    similarity_pct=87.0,
    resolution="Restarted the connection pool",
    resolution_minutes=12,
    services_affected=None,
):
    return {
        "incident_id": incident_id,
        "title": "Postgres connection pool exhaustion",
        "symptom_pattern": "connection pool exhausted, connections queued",
        "similarity_pct": similarity_pct,
        "root_cause": "Connection leak after deploy",
        "resolution": resolution,
        "resolution_minutes": resolution_minutes,
        "services_affected": services_affected or ["postgres-primary", "api-gateway"],
    }


@pytest.fixture
def alert_factory():
    return make_alert


@pytest.fixture
def cascade_factory():
    return make_cascade


@pytest.fixture
def cluster_factory():
    return make_cluster


@pytest.fixture
def dna_match_factory():
    return make_dna_match
