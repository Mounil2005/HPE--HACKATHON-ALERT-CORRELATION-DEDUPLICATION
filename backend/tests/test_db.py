from datetime import datetime, timedelta, timezone


class TestAlertsPersistence:
    def test_save_and_load_round_trip(self, isolated_db, alert_factory):
        db = isolated_db
        alerts = [alert_factory(id="a1"), alert_factory(id="a2")]
        db.save_alerts(alerts)
        loaded = db.load_alerts()
        assert {a["id"] for a in loaded} == {"a1", "a2"}

    def test_save_empty_list_is_noop(self, isolated_db):
        db = isolated_db
        db.save_alerts([])
        assert db.load_alerts() == []

    def test_save_upserts_existing_id(self, isolated_db, alert_factory):
        db = isolated_db
        db.save_alerts([alert_factory(id="a1", severity="info")])
        db.save_alerts([alert_factory(id="a1", severity="critical")])
        loaded = db.load_alerts()
        assert len(loaded) == 1
        assert loaded[0]["severity"] == "critical"

    def test_clear_alerts_empties_table(self, isolated_db, alert_factory):
        db = isolated_db
        db.save_alerts([alert_factory(id="a1")])
        db.clear_alerts()
        assert db.load_alerts() == []

    def test_clear_alerts_preserves_actions(self, isolated_db, alert_factory):
        """Documented contract in db.py: clear_alerts() must NOT wipe
        alert_actions, so a restart replaying the same persisted batch keeps
        user actions (ack/assign/etc) intact."""
        db = isolated_db
        db.save_alerts([alert_factory(id="a1")])
        db.set_ack("a1", True)
        db.clear_alerts()
        assert db.get_actions()["a1"]["acked"] is True

    def test_load_alerts_sorted_newest_first(self, isolated_db, alert_factory):
        db = isolated_db
        base = datetime(2026, 1, 1, tzinfo=timezone.utc)
        db.save_alerts([
            alert_factory(id="old", ts=base),
            alert_factory(id="new", ts=base + timedelta(hours=1)),
        ])
        loaded = db.load_alerts()
        assert [a["id"] for a in loaded] == ["new", "old"]


class TestAlertActions:
    def test_get_actions_empty_by_default(self, isolated_db):
        assert isolated_db.get_actions() == {}

    def test_set_ack_creates_action_row(self, isolated_db):
        db = isolated_db
        db.set_ack("a1", True)
        actions = db.get_actions()
        assert actions["a1"]["acked"] is True
        assert actions["a1"]["assignee"] is None

    def test_set_assignee_and_ack_are_independent_fields_on_same_row(self, isolated_db):
        db = isolated_db
        db.set_ack("a1", True)
        db.set_assignee("a1", "Aditya")
        action = db.get_actions()["a1"]
        assert action["acked"] is True
        assert action["assignee"] == "Aditya"

    def test_set_status_override_and_clear(self, isolated_db):
        db = isolated_db
        db.set_status_override("a1", "suppressed")
        assert db.get_actions()["a1"]["status_override"] == "suppressed"
        db.set_status_override("a1", None)
        assert db.get_actions()["a1"]["status_override"] is None

    def test_set_escalated(self, isolated_db):
        db = isolated_db
        db.set_escalated("a1", True)
        assert db.get_actions()["a1"]["escalated"] is True


class TestProviders:
    def test_create_and_list(self, isolated_db):
        db = isolated_db
        created = db.create_provider("p1", "Slack Webhook", "https://example.com/hook", True)
        assert created["id"] == "p1"
        assert db.list_providers() == [created]

    def test_get_missing_provider_returns_none(self, isolated_db):
        assert isolated_db.get_provider("nonexistent") is None

    def test_set_provider_enabled_toggles(self, isolated_db):
        db = isolated_db
        db.create_provider("p1", "Hook", "https://example.com", True)
        updated = db.set_provider_enabled("p1", False)
        assert updated["enabled"] is False
        assert db.get_provider("p1")["enabled"] is False

    def test_set_enabled_on_missing_provider_returns_none(self, isolated_db):
        assert isolated_db.set_provider_enabled("nonexistent", True) is None

    def test_delete_provider(self, isolated_db):
        db = isolated_db
        db.create_provider("p1", "Hook", "https://example.com")
        db.delete_provider("p1")
        assert db.get_provider("p1") is None

    def test_delete_missing_provider_does_not_raise(self, isolated_db):
        isolated_db.delete_provider("nonexistent")  # must not raise


class TestWorkflowRules:
    def test_create_round_trips_json_configs(self, isolated_db):
        db = isolated_db
        rule = db.create_workflow_rule(
            "r1", "High risk notify", "risk_threshold", {"min_risk": 0.8},
            "notify", {"provider_id": "p1"}, True,
        )
        assert rule["trigger_config"] == {"min_risk": 0.8}
        assert rule["action_config"] == {"provider_id": "p1"}
        fetched = db.get_workflow_rule("r1")
        assert fetched["trigger_config"] == {"min_risk": 0.8}

    def test_list_workflow_rules(self, isolated_db):
        db = isolated_db
        db.create_workflow_rule("r1", "A", "risk_threshold", {}, "notify", {})
        db.create_workflow_rule("r2", "B", "new_critical_alert", {}, "auto_escalate", {})
        assert {r["id"] for r in db.list_workflow_rules()} == {"r1", "r2"}

    def test_set_workflow_rule_enabled(self, isolated_db):
        db = isolated_db
        db.create_workflow_rule("r1", "A", "risk_threshold", {}, "notify", {}, enabled=True)
        updated = db.set_workflow_rule_enabled("r1", False)
        assert updated["enabled"] is False

    def test_set_enabled_missing_rule_returns_none(self, isolated_db):
        assert isolated_db.set_workflow_rule_enabled("nonexistent", True) is None

    def test_delete_workflow_rule(self, isolated_db):
        db = isolated_db
        db.create_workflow_rule("r1", "A", "risk_threshold", {}, "notify", {})
        db.delete_workflow_rule("r1")
        assert db.get_workflow_rule("r1") is None


class TestNotificationLog:
    def test_has_fired_false_before_any_log(self, isolated_db):
        assert isolated_db.has_fired("r1", "incident-a") is False

    def test_has_fired_true_after_log_notification(self, isolated_db):
        db = isolated_db
        db.log_notification("r1", "incident-a", "p1", "success", "notified")
        assert db.has_fired("r1", "incident-a") is True

    def test_has_fired_is_scoped_to_rule_and_incident(self, isolated_db):
        db = isolated_db
        db.log_notification("r1", "incident-a", None, "success", None)
        assert db.has_fired("r1", "incident-b") is False
        assert db.has_fired("r2", "incident-a") is False

    def test_list_notifications_newest_first(self, isolated_db):
        db = isolated_db
        db.log_notification("r1", "inc-1", None, "success", "first")
        db.log_notification("r1", "inc-2", None, "failed", "second")
        notifications = db.list_notifications()
        assert len(notifications) == 2
        assert notifications[0]["detail"] == "second"

    def test_last_fired_at_none_when_never_fired(self, isolated_db):
        assert isolated_db.last_fired_at("nonexistent-rule") is None

    def test_last_fired_at_returns_timestamp_after_firing(self, isolated_db):
        db = isolated_db
        db.log_notification("r1", "inc-1", None, "success", None)
        assert db.last_fired_at("r1") is not None


class TestMaintenanceWindows:
    def test_create_and_list(self, isolated_db):
        db = isolated_db
        now = datetime.utcnow()
        window = db.create_maintenance_window(
            "w1", "DB maintenance", "postgres-primary",
            now - timedelta(minutes=5), now + timedelta(minutes=30),
        )
        assert window["id"] == "w1"
        assert len(db.list_maintenance_windows()) == 1

    def test_active_window_flag_true_when_within_range(self, isolated_db):
        db = isolated_db
        now = datetime.utcnow()
        db.create_maintenance_window(
            "w1", "Active", None, now - timedelta(minutes=5), now + timedelta(minutes=30),
        )
        windows = db.list_maintenance_windows()
        assert windows[0]["active"] is True

    def test_active_flag_false_when_in_future(self, isolated_db):
        db = isolated_db
        now = datetime.utcnow()
        db.create_maintenance_window(
            "w1", "Future", None, now + timedelta(hours=1), now + timedelta(hours=2),
        )
        windows = db.list_maintenance_windows()
        assert windows[0]["active"] is False

    def test_active_flag_false_when_in_past(self, isolated_db):
        db = isolated_db
        now = datetime.utcnow()
        db.create_maintenance_window(
            "w1", "Past", None, now - timedelta(hours=2), now - timedelta(hours=1),
        )
        windows = db.list_maintenance_windows()
        assert windows[0]["active"] is False

    def test_active_flag_false_when_disabled_even_if_in_range(self, isolated_db):
        db = isolated_db
        now = datetime.utcnow()
        db.create_maintenance_window(
            "w1", "Disabled", None, now - timedelta(minutes=5), now + timedelta(minutes=30),
            enabled=False,
        )
        windows = db.list_maintenance_windows()
        assert windows[0]["active"] is False

    def test_list_active_maintenance_windows_filters_correctly(self, isolated_db):
        db = isolated_db
        now = datetime.utcnow()
        db.create_maintenance_window("active", "A", None, now - timedelta(minutes=5), now + timedelta(minutes=5))
        db.create_maintenance_window("future", "F", None, now + timedelta(hours=1), now + timedelta(hours=2))
        db.create_maintenance_window("past", "P", None, now - timedelta(hours=2), now - timedelta(hours=1))
        active = db.list_active_maintenance_windows()
        assert [w["id"] for w in active] == ["active"]

    def test_set_enabled_and_delete(self, isolated_db):
        db = isolated_db
        now = datetime.utcnow()
        db.create_maintenance_window("w1", "A", None, now, now + timedelta(hours=1))
        updated = db.set_maintenance_window_enabled("w1", False)
        assert updated["enabled"] is False
        db.delete_maintenance_window("w1")
        assert db.list_maintenance_windows() == []

    def test_set_enabled_missing_window_returns_none(self, isolated_db):
        assert isolated_db.set_maintenance_window_enabled("nonexistent", True) is None
