"""automation.py's notify path calls providers.notify_webhook, which does a
real HTTP POST — mocked here (patched where automation.py looks it up, i.e.
`app.automation.notify_webhook`, since `from .providers import notify_webhook`
binds a local name in automation.py's own namespace)."""

from unittest.mock import patch

from app.automation import evaluate_workflow_rules


class TestEvaluateWorkflowRules:
    def test_no_rules_is_noop(self, isolated_db, cluster_factory):
        evaluate_workflow_rules([cluster_factory(risk_score=0.99)])  # must not raise
        assert isolated_db.list_notifications() == []

    def test_disabled_rule_never_fires(self, isolated_db, cluster_factory):
        db = isolated_db
        db.create_workflow_rule(
            "r1", "High risk", "risk_threshold", {"min_risk": 0.5},
            "auto_escalate", {}, enabled=False,
        )
        evaluate_workflow_rules([cluster_factory(risk_score=0.99)])
        assert db.list_notifications() == []

    def test_risk_threshold_trigger_matches_above_threshold(self, isolated_db, cluster_factory):
        db = isolated_db
        db.create_workflow_rule(
            "r1", "High risk", "risk_threshold", {"min_risk": 0.5}, "auto_escalate", {},
        )
        cluster = cluster_factory(risk_score=0.9)
        evaluate_workflow_rules([cluster])
        assert len(db.list_notifications()) == 1
        assert db.list_notifications()[0]["status"] == "success"

    def test_risk_threshold_trigger_does_not_match_below_threshold(self, isolated_db, cluster_factory):
        db = isolated_db
        db.create_workflow_rule(
            "r1", "High risk", "risk_threshold", {"min_risk": 0.9}, "auto_escalate", {},
        )
        evaluate_workflow_rules([cluster_factory(risk_score=0.1)])
        assert db.list_notifications() == []

    def test_new_critical_alert_trigger(self, isolated_db, cluster_factory):
        db = isolated_db
        db.create_workflow_rule(
            "r1", "Critical", "new_critical_alert", {}, "auto_escalate", {},
        )
        critical = cluster_factory(root_severity="critical", risk_score=0.1)
        non_critical = cluster_factory(cluster_id=1, root_severity="info", risk_score=0.1)
        evaluate_workflow_rules([critical, non_critical])
        assert len(db.list_notifications()) == 1

    def test_auto_escalate_sets_escalated_flag_on_all_cluster_alerts(self, isolated_db, cluster_factory):
        db = isolated_db
        db.create_workflow_rule("r1", "Esc", "risk_threshold", {"min_risk": 0.1}, "auto_escalate", {})
        cluster = cluster_factory(n_alerts=3, risk_score=0.9)
        evaluate_workflow_rules([cluster])
        actions = db.get_actions()
        for alert in cluster["alerts"]:
            assert actions[alert["id"]]["escalated"] is True

    def test_rule_does_not_refire_on_same_incident(self, isolated_db, cluster_factory):
        """The dedup key is the root-cause alert id, matching main.py's
        comment that reruns (ack/assign/dismiss) must not refire a rule."""
        db = isolated_db
        db.create_workflow_rule("r1", "Esc", "risk_threshold", {"min_risk": 0.1}, "auto_escalate", {})
        cluster = cluster_factory(risk_score=0.9)
        evaluate_workflow_rules([cluster])
        evaluate_workflow_rules([cluster])  # simulate a pipeline rerun
        assert len(db.list_notifications()) == 1

    def test_notify_with_missing_provider_id_logs_failure(self, isolated_db, cluster_factory):
        db = isolated_db
        db.create_workflow_rule("r1", "Notify", "risk_threshold", {"min_risk": 0.1}, "notify", {})
        evaluate_workflow_rules([cluster_factory(risk_score=0.9)])
        notifications = db.list_notifications()
        assert len(notifications) == 1
        assert notifications[0]["status"] == "failed"
        assert "not found" in notifications[0]["detail"].lower() or "not configured" in notifications[0]["detail"].lower()

    def test_notify_with_unknown_provider_id_logs_failure(self, isolated_db, cluster_factory):
        db = isolated_db
        db.create_workflow_rule(
            "r1", "Notify", "risk_threshold", {"min_risk": 0.1},
            "notify", {"provider_id": "does-not-exist"},
        )
        evaluate_workflow_rules([cluster_factory(risk_score=0.9)])
        assert db.list_notifications()[0]["status"] == "failed"

    @patch("app.automation.notify_webhook")
    def test_notify_with_valid_provider_calls_webhook_and_logs_result(self, mock_notify, isolated_db, cluster_factory):
        db = isolated_db
        mock_notify.return_value = {"status": "success", "http_status": 200, "detail": "ok"}
        db.create_provider("p1", "Hook", "https://example.com/hook")
        db.create_workflow_rule(
            "r1", "Notify", "risk_threshold", {"min_risk": 0.1},
            "notify", {"provider_id": "p1"},
        )
        evaluate_workflow_rules([cluster_factory(risk_score=0.9)])
        mock_notify.assert_called_once()
        assert db.list_notifications()[0]["status"] == "success"

    @patch("app.automation.notify_webhook")
    def test_notify_payload_includes_incident_context(self, mock_notify, isolated_db, cluster_factory):
        db = isolated_db
        mock_notify.return_value = {"status": "success", "http_status": 200, "detail": "ok"}
        db.create_provider("p1", "Hook", "https://example.com/hook")
        db.create_workflow_rule(
            "r1", "Notify", "risk_threshold", {"min_risk": 0.1},
            "notify", {"provider_id": "p1"},
        )
        cluster = cluster_factory(risk_score=0.9, root_service="postgres-primary")
        evaluate_workflow_rules([cluster])
        payload = mock_notify.call_args[0][1]
        assert payload["root_cause"]["service"] == "postgres-primary"
        assert payload["event"] == "alertlens.workflow_fired"

    def test_multiple_rules_each_evaluated_independently(self, isolated_db, cluster_factory):
        db = isolated_db
        db.create_workflow_rule("r1", "A", "risk_threshold", {"min_risk": 0.1}, "auto_escalate", {})
        db.create_workflow_rule("r2", "B", "risk_threshold", {"min_risk": 0.1}, "auto_escalate", {})
        evaluate_workflow_rules([cluster_factory(risk_score=0.9)])
        assert len(db.list_notifications()) == 2
