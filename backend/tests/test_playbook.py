from app.playbook import generate_playbook


class TestGeneratePlaybook:
    def test_falsy_cluster_returns_generic_playbook(self):
        result = generate_playbook({})
        assert result["title"] == "Generic Incident Recovery Playbook"
        assert result["steps"] == []

    def test_none_cluster_does_not_crash(self):
        result = generate_playbook(None)
        assert result["steps"] == []

    def test_result_shape(self, cluster_factory):
        result = generate_playbook(cluster_factory())
        assert set(result.keys()) == {
            "title", "priority", "estimated_resolution", "confidence",
            "steps", "validation", "rollback", "business_impact",
        }

    def test_four_steps_always_present(self, cluster_factory):
        result = generate_playbook(cluster_factory())
        assert len(result["steps"]) == 4
        assert [s["step_number"] for s in result["steps"]] == [1, 2, 3, 4]

    def test_high_risk_or_critical_gets_p1_priority(self, cluster_factory):
        result = generate_playbook(cluster_factory(risk_level="high", root_severity="critical"))
        assert result["priority"] == "Critical P1"

    def test_low_risk_non_critical_gets_p2_priority(self, cluster_factory):
        result = generate_playbook(cluster_factory(risk_level="low", root_severity="info"))
        assert result["priority"] == "High P2"

    def test_dna_match_supplies_real_resolution_step(self, cluster_factory, dna_match_factory):
        dna = dna_match_factory(resolution="Restarted the connection pool")
        result = generate_playbook(cluster_factory(dna_match=dna))
        recovery_step = result["steps"][2]
        assert "Restarted the connection pool" in recovery_step["description"]

    def test_dna_resolution_minutes_drive_estimated_resolution(self, cluster_factory, dna_match_factory):
        dna = dna_match_factory(resolution_minutes=20)
        result = generate_playbook(cluster_factory(dna_match=dna))
        assert result["estimated_resolution"] == "20-25 minutes"

    def test_no_dna_match_falls_back_to_generic_resolution(self, cluster_factory):
        result = generate_playbook(cluster_factory(dna_match=None, root_service="worker-node-3"))
        recovery_step = result["steps"][2]
        assert "worker-node-3" in recovery_step["description"]

    def test_business_impact_lists_all_affected_services(self, cluster_factory):
        cluster = cluster_factory(n_services=3, n_alerts=3)
        result = generate_playbook(cluster)
        affected = {a["service"] for a in cluster["alerts"]}
        assert set(result["business_impact"]["impacted_systems"]) == affected

    def test_confidence_uses_dna_similarity_when_present(self, cluster_factory, dna_match_factory):
        dna = dna_match_factory(similarity_pct=93.0)
        result = generate_playbook(cluster_factory(dna_match=dna))
        assert result["confidence"] == 93

    def test_single_service_cluster_downstream_falls_back_to_root(self, cluster_factory):
        cluster = cluster_factory(n_services=1, n_alerts=1)
        result = generate_playbook(cluster)
        # no downstream services beyond the root — step 4 must not crash on an empty join
        assert cluster["root_cause"]["service"] in result["steps"][3]["description"]
