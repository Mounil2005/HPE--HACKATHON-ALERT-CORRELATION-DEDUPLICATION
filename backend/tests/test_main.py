"""Integration tests against the real FastAPI app via TestClient.

Every test that needs pipeline data loads it explicitly (usually
`/demo/load` with a fixed seed) rather than relying on startup timing —
see conftest.py's `client` fixture docstring for why. `_state` and the
AlertDNA singleton are module-level in app.main and persist across tests
within a session; nothing here assumes a pristine `_state` at test start.

Anything that would otherwise make a real network call (LLM providers,
webhooks) is monkeypatched — the real .env in this repo has real API keys,
and tests must never spend real API credits or depend on network access.
"""

import pytest


def _load_seeded_batch(client, seed=42, incidents=3, noise=20):
    resp = client.post(f"/demo/load?seed={seed}&incidents={incidents}&noise={noise}")
    assert resp.status_code == 200
    return resp.json()


class TestPipelineAndDemoLoad:
    def test_get_pipeline_shape(self, client):
        resp = client.get("/pipeline")
        assert resp.status_code == 200
        body = resp.json()
        assert set(body.keys()) >= {"dedup_stats", "clusters", "noise", "raw_alerts", "dataset"}

    def test_demo_load_populates_pipeline(self, client):
        result = _load_seeded_batch(client)
        assert result["raw_alerts"] > 0
        assert result["clusters_formed"] >= 0

        pipeline = client.get("/pipeline").json()
        assert pipeline["dataset"] == "synthetic"
        assert len(pipeline["raw_alerts"]) == result["raw_alerts"]

    def test_demo_load_same_seed_is_deterministic(self, client):
        first = _load_seeded_batch(client, seed=99)
        second = _load_seeded_batch(client, seed=99)
        assert first == second

    def test_ingest_with_real_alerts(self, client, cascade_factory):
        alerts = cascade_factory(n_services=4)
        resp = client.post("/ingest", json=alerts)
        assert resp.status_code == 200
        body = resp.json()
        assert body["raw_alerts"] == 4
        pipeline = client.get("/pipeline").json()
        assert pipeline["dataset"] == "custom-ingest"

    def test_ingest_empty_list_surfaces_the_clustering_edge_case(self, client):
        """Documents actual current behavior: POST /ingest with an empty
        list raises inside run_pipeline(), because cluster_alerts([]) raises
        (see test_clustering.py's test_empty_batch_raises_on_empty_vocabulary
        for the root cause) — in a real deployment this reaches the client as
        a 500; TestClient re-raises server exceptions by default instead of
        converting them, so the exception is asserted directly here. Not
        fixed here — flagged for the cleanup pass."""
        with pytest.raises(ValueError, match="empty vocabulary"):
            client.post("/ingest", json=[])

    def test_demo_load_real_loghub_dataset(self, client):
        resp = client.post("/demo/load-real")
        assert resp.status_code == 200
        pipeline = client.get("/pipeline").json()
        assert pipeline["dataset"] == "loghub-hdfs"

    def test_demo_load_aiops_dataset(self, client):
        resp = client.post("/demo/load-aiops")
        assert resp.status_code == 200
        pipeline = client.get("/pipeline").json()
        assert pipeline["dataset"] == "aiops-challenge"


class TestAlertActions:
    def test_ack_alert_persists_and_reflects_in_pipeline(self, client):
        _load_seeded_batch(client)
        alert_id = client.get("/pipeline").json()["raw_alerts"][0]["id"]

        resp = client.post(f"/alerts/{alert_id}/ack", json={"value": True})
        assert resp.status_code == 200

        pipeline = client.get("/pipeline").json()
        acked = next(a for a in pipeline["raw_alerts"] if a["id"] == alert_id)
        assert acked["acked"] is True

    def test_assign_alert(self, client):
        _load_seeded_batch(client)
        alert_id = client.get("/pipeline").json()["raw_alerts"][0]["id"]
        client.post(f"/alerts/{alert_id}/assign", json={"assignee": "Aditya"})
        pipeline = client.get("/pipeline").json()
        assigned = next(a for a in pipeline["raw_alerts"] if a["id"] == alert_id)
        assert assigned["assignee"] == "Aditya"

    def test_dismiss_alert_overrides_status(self, client):
        _load_seeded_batch(client)
        alert_id = client.get("/pipeline").json()["raw_alerts"][0]["id"]
        client.post(f"/alerts/{alert_id}/dismiss", json={"status": "resolved"})
        pipeline = client.get("/pipeline").json()
        dismissed = next(a for a in pipeline["raw_alerts"] if a["id"] == alert_id)
        assert dismissed["status"] == "resolved"

    def test_dismiss_alert_clear_override(self, client, cascade_factory):
        # A controlled, known-"firing" alert — a random synthetic pick can
        # itself already be "suppressed" (duplicates start that way), which
        # would make clearing the override look like a no-op by coincidence.
        alerts = cascade_factory(n_services=3)
        client.post("/ingest", json=alerts)
        alert_id = alerts[0]["id"]
        assert alerts[0]["status"] == "firing"

        client.post(f"/alerts/{alert_id}/dismiss", json={"status": "suppressed"})
        pipeline = client.get("/pipeline").json()
        assert next(a for a in pipeline["raw_alerts"] if a["id"] == alert_id)["status"] == "suppressed"

        client.post(f"/alerts/{alert_id}/dismiss", json={"status": None})
        pipeline = client.get("/pipeline").json()
        assert next(a for a in pipeline["raw_alerts"] if a["id"] == alert_id)["status"] == "firing"

    def test_escalate_alert(self, client):
        _load_seeded_batch(client)
        alert_id = client.get("/pipeline").json()["raw_alerts"][0]["id"]
        client.post(f"/alerts/{alert_id}/escalate", json={"value": True})
        pipeline = client.get("/pipeline").json()
        escalated = next(a for a in pipeline["raw_alerts"] if a["id"] == alert_id)
        assert escalated["escalated"] is True

    def test_action_on_unknown_alert_id_does_not_error(self, client):
        """Documents actual behavior: alert actions never validate the id
        exists — they just persist an action row and rerun the pipeline
        over whatever's currently in the DB."""
        _load_seeded_batch(client)
        resp = client.post("/alerts/does-not-exist/ack", json={"value": True})
        assert resp.status_code == 200


class TestIncidentDetailEndpoints:
    def _first_cluster_id(self, client):
        _load_seeded_batch(client, seed=42, incidents=3, noise=5)
        clusters = client.get("/pipeline").json()["clusters"]
        assert clusters, "seed=42 must produce at least one cluster"
        return clusters[0]["cluster_id"]

    def test_forecast_success(self, client):
        cluster_id = self._first_cluster_id(client)
        resp = client.get(f"/forecast/{cluster_id}")
        assert resp.status_code == 200
        assert "forecast" in resp.json()

    def test_forecast_missing_incident_404(self, client):
        _load_seeded_batch(client)
        resp = client.get("/forecast/nonexistent-id")
        assert resp.status_code == 404

    def test_comparison_success(self, client):
        cluster_id = self._first_cluster_id(client)
        resp = client.get(f"/incidents/{cluster_id}/comparison")
        assert resp.status_code == 200
        assert "has_match" in resp.json()

    def test_comparison_missing_incident_404(self, client):
        _load_seeded_batch(client)
        resp = client.get("/incidents/nonexistent-id/comparison")
        assert resp.status_code == 404

    def test_root_cause_confidence_success(self, client):
        cluster_id = self._first_cluster_id(client)
        resp = client.get(f"/incidents/{cluster_id}/root_cause_confidence")
        assert resp.status_code == 200
        assert "candidates" in resp.json()

    def test_root_cause_confidence_missing_incident_404(self, client):
        _load_seeded_batch(client)
        resp = client.get("/incidents/nonexistent-id/root_cause_confidence")
        assert resp.status_code == 404

    def test_playbook_success(self, client):
        cluster_id = self._first_cluster_id(client)
        resp = client.get(f"/incidents/{cluster_id}/playbook")
        assert resp.status_code == 200
        assert "steps" in resp.json()

    def test_playbook_missing_incident_404(self, client):
        _load_seeded_batch(client)
        resp = client.get("/incidents/nonexistent-id/playbook")
        assert resp.status_code == 404


class TestEvaluation:
    def test_evaluation_shape(self, client):
        resp = client.get("/evaluation")
        assert resp.status_code == 200
        body = resp.json()
        assert "incident_detection_pct" in body
        assert "dna_accuracy_pct" in body
        assert len(body["per_seed"]) == body["seeds_tested"]

    def test_evaluation_is_cached_across_calls(self, client):
        first = client.get("/evaluation").json()
        second = client.get("/evaluation").json()
        assert first == second


class TestDebugSummarizerCheck:
    def test_no_providers_configured_reports_no_key(self, client, monkeypatch):
        from app import summarizer
        monkeypatch.setattr(summarizer, "_configured_providers", lambda: [])
        resp = client.get("/debug/summarizer-check")
        assert resp.status_code == 200
        assert resp.json()["status"] == "no_key"

    def test_working_provider_reports_working(self, client, monkeypatch):
        from app import summarizer
        monkeypatch.setattr(
            summarizer, "_configured_providers",
            lambda: [("groq", "fake-key", "https://fake", "fake-model")],
        )
        monkeypatch.setattr(summarizer, "_call_chat_api", lambda *a, **k: "pong")
        resp = client.get("/debug/summarizer-check")
        body = resp.json()
        assert body["status"] == "working"
        assert body["provider"] == "groq"


class TestAssistantEndpoints:
    def test_assistant_incident_not_found(self, client):
        _load_seeded_batch(client)
        resp = client.post("/assistant", json={"incident_id": "nonexistent", "question": "why?"})
        assert resp.status_code == 200  # errors are in-body, not HTTP-level
        assert resp.json()["status"] == "error"

    def test_assistant_incident_mode_template_fallback(self, client, monkeypatch):
        from app import assistant
        monkeypatch.setattr(assistant, "_configured_providers", lambda: [])
        cluster_id = TestIncidentDetailEndpoints()._first_cluster_id(client)
        resp = client.post("/assistant", json={"incident_id": str(cluster_id), "question": "explain"})
        assert resp.status_code == 200
        assert resp.json()["provider"] == "template"

    def test_assistant_workspace_mode_no_incident_id(self, client, monkeypatch):
        from app import assistant
        monkeypatch.setattr(assistant, "_configured_providers", lambda: [])
        _load_seeded_batch(client)
        resp = client.post("/assistant/workspace", json={"question": "what's the top risk?"})
        assert resp.status_code == 200
        assert resp.json()["mode"] == "workspace"

    def test_assistant_workspace_delegates_when_incident_id_given(self, client, monkeypatch):
        from app import assistant
        monkeypatch.setattr(assistant, "_configured_providers", lambda: [])
        cluster_id = TestIncidentDetailEndpoints()._first_cluster_id(client)
        resp = client.post(
            "/assistant/workspace",
            json={"incident_id": str(cluster_id), "question": "explain"},
        )
        assert resp.status_code == 200
        assert "mode" not in resp.json()  # incident-mode response shape, not workspace


class TestProvidersCRUD:
    def test_create_list_delete(self, client):
        assert client.get("/providers").json() == []
        created = client.post("/providers", json={"name": "Hook", "url": "https://example.com"}).json()
        assert created["name"] == "Hook"
        assert len(client.get("/providers").json()) == 1
        client.delete(f"/providers/{created['id']}")
        assert client.get("/providers").json() == []

    def test_test_provider_success(self, client, monkeypatch):
        # main.py does `from .providers import test_webhook`, binding its
        # own local name — patching app.providers.test_webhook wouldn't
        # affect what main.py actually calls.
        import app.main as main_module
        monkeypatch.setattr(main_module, "test_webhook", lambda url: {"status": "success", "http_status": 200, "detail": "ok"})
        created = client.post("/providers", json={"name": "Hook", "url": "https://example.com"}).json()
        resp = client.post(f"/providers/{created['id']}/test")
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

    def test_test_provider_missing_404(self, client):
        resp = client.post("/providers/nonexistent/test")
        assert resp.status_code == 404


class TestWorkflowsCRUD:
    def test_create_list_update_delete(self, client):
        created = client.post("/workflows", json={
            "name": "High risk", "trigger_type": "risk_threshold",
            "trigger_config": {"min_risk": 0.8}, "action_type": "auto_escalate",
        }).json()
        assert created["enabled"] is True
        assert created["last_fired_at"] is None

        rules = client.get("/workflows").json()
        assert any(r["id"] == created["id"] for r in rules)

        updated = client.put(f"/workflows/{created['id']}", json={"enabled": False})
        assert updated.json()["enabled"] is False

        client.delete(f"/workflows/{created['id']}")
        assert not any(r["id"] == created["id"] for r in client.get("/workflows").json())

    def test_update_missing_workflow_404(self, client):
        resp = client.put("/workflows/nonexistent", json={"enabled": True})
        assert resp.status_code == 404


class TestNotifications:
    def test_empty_by_default(self, client):
        assert client.get("/notifications").json() == []

    def test_reflects_a_fired_workflow_rule(self, client):
        client.post("/workflows", json={
            "name": "Always fire", "trigger_type": "risk_threshold",
            "trigger_config": {"min_risk": 0.0}, "action_type": "auto_escalate",
        })
        _load_seeded_batch(client, seed=42, incidents=3, noise=5)
        notifications = client.get("/notifications").json()
        assert len(notifications) > 0


class TestSettingsStatus:
    def test_shape_and_reflects_loaded_dataset(self, client):
        _load_seeded_batch(client)
        status = client.get("/settings/status").json()
        assert status["dataset"] == "synthetic"
        assert status["persisted_alert_count"] > 0
        assert "llm_configured" in status
        assert "db_path" in status


class TestRulesConfig:
    def test_shape(self, client):
        config = client.get("/rules/config").json()
        assert set(config.keys()) == {"dedup", "clustering", "root_cause"}
        assert config["clustering"]["eps"] == pytest.approx(1.00)


class TestMaintenanceWindowsCRUD:
    def test_create_requires_end_after_start(self, client):
        resp = client.post("/maintenance", json={
            "name": "Bad window", "start_time": "2026-01-01T12:00:00", "end_time": "2026-01-01T11:00:00",
        })
        assert resp.status_code == 400

    def test_create_list_update_delete(self, client):
        created = client.post("/maintenance", json={
            "name": "DB maintenance", "service": "postgres-primary",
            "start_time": "2026-01-01T12:00:00", "end_time": "2026-01-01T13:00:00",
        }).json()
        assert len(client.get("/maintenance").json()) == 1

        updated = client.put(f"/maintenance/{created['id']}", json={"enabled": False})
        assert updated.json()["enabled"] is False

        client.delete(f"/maintenance/{created['id']}")
        assert client.get("/maintenance").json() == []

    def test_update_missing_window_404(self, client):
        resp = client.put("/maintenance/nonexistent", json={"enabled": True})
        assert resp.status_code == 404

    def test_active_maintenance_window_suppresses_matching_service_alerts(self, client, cascade_factory):
        """Integration of the interdependency documented in main.py's
        _apply_maintenance_windows: a window covering "now" for a given
        service must suppress that service's alerts on the next pipeline run."""
        from datetime import datetime, timedelta

        now = datetime.utcnow()
        client.post("/maintenance", json={
            "name": "Suppress postgres", "service": "postgres-primary",
            "start_time": (now - timedelta(minutes=5)).isoformat(),
            "end_time": (now + timedelta(minutes=30)).isoformat(),
        })
        alerts = cascade_factory(n_services=3, root_service="postgres-primary")
        client.post("/ingest", json=alerts)
        pipeline = client.get("/pipeline").json()
        root_alert = next(a for a in pipeline["raw_alerts"] if a["service"] == "postgres-primary")
        assert root_alert["status"] == "suppressed"
