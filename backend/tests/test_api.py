"""
HydroWatch — Backend Tests
Run: pytest tests/ -v
"""
import pytest
from fastapi.testclient import TestClient
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Mock DB before importing main
import unittest.mock as mock
with mock.patch("database.DatabaseManager.__init__", return_value=None):
    with mock.patch("database.DatabaseManager._init_tables", return_value=None):
        from main import app

client = TestClient(app)

# ── Auth Tests ──────────────────────────────────────────────────────────
def test_login_success():
    res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    assert "token" in res.json()
    assert res.json()["role"] == "admin"

def test_login_failure():
    res = client.post("/api/auth/login", json={"username": "admin", "password": "wrongpass"})
    assert res.status_code == 401

def test_login_unknown_user():
    res = client.post("/api/auth/login", json={"username": "nobody", "password": "pass"})
    assert res.status_code == 401

# ── Pipeline Tests ──────────────────────────────────────────────────────
def test_get_pipelines():
    res = client.get("/api/pipelines")
    assert res.status_code == 200
    data = res.json()
    assert "pipelines" in data
    assert data["total"] == 12  # Tamil Nadu pipeline count

def test_get_pipeline_live():
    res = client.get("/api/pipelines/P-101/live")
    assert res.status_code == 200
    data = res.json()
    assert "sensor" in data
    assert "prediction" in data
    assert data["sensor"]["pipelineId"] == "P-101"

def test_pipeline_not_found():
    res = client.get("/api/pipelines/INVALID/live")
    assert res.status_code == 404

# ── Prediction Tests ────────────────────────────────────────────────────
def test_predict_critical():
    res = client.post("/api/predict", json={
        "pressure": 98, "flow_rate": 150, "temperature": 29,
        "vibration": 0.9, "pipeline_age": 35
    })
    assert res.status_code == 200
    data = res.json()
    assert "probability" in data
    assert "severity" in data
    assert data["probability"] >= 0.0
    assert data["probability"] <= 1.0
    assert data["severity"] in ["NORMAL", "WARNING", "CRITICAL"]

def test_predict_normal():
    res = client.post("/api/predict", json={
        "pressure": 60, "flow_rate": 320, "temperature": 24,
        "vibration": 0.1, "pipeline_age": 5
    })
    assert res.status_code == 200
    data = res.json()
    assert data["severity"] in ["NORMAL", "WARNING"]

def test_predict_missing_field():
    res = client.post("/api/predict", json={
        "pressure": 60, "flow_rate": 320
        # Missing required fields
    })
    assert res.status_code == 422

# ── Dashboard Tests ─────────────────────────────────────────────────────
def test_dashboard_stats():
    res = client.get("/api/dashboard/stats")
    assert res.status_code == 200
    data = res.json()
    assert "total_pipelines" in data
    assert "active_alerts" in data
    assert "avg_pressure" in data
    assert data["total_pipelines"] == 12

def test_timeseries():
    res = client.get("/api/dashboard/timeseries?pipeline_id=P-101&points=10")
    assert res.status_code == 200
    data = res.json()
    assert "pipeline_id" in data
    assert data["pipeline_id"] == "P-101"

# ── Water Loss Calculator ───────────────────────────────────────────────
def test_water_loss_calc():
    res = client.get("/api/tools/water-loss?leak_rate=1000&cost_per_liter=0.5&hours=24")
    assert res.status_code == 200
    data = res.json()
    assert data["volume_liters"] == 24000.0
    assert data["total_cost_inr"] == 12000.0
    assert data["currency"] == "INR"

# ── Tamil Nadu Dataset ──────────────────────────────────────────────────
def test_tn_dataset():
    res = client.get("/api/dataset/tamilnadu")
    assert res.status_code == 200
    data = res.json()
    assert "districts" in data
    assert len(data["districts"]) == 11
    assert data["state_loss_percent"] == 26.8

# ── Monitoring Tests ────────────────────────────────────────────────────
def test_health_check():
    res = client.get("/api/monitoring/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data

def test_system_metrics():
    res = client.get("/api/monitoring/metrics")
    assert res.status_code == 200
    data = res.json()
    assert "cpu_usage" in data
    assert "memory_usage" in data
    assert "api_latency_ms" in data

def test_container_status():
    res = client.get("/api/monitoring/containers")
    assert res.status_code == 200
    data = res.json()
    assert "containers" in data
    assert len(data["containers"]) >= 5

# ── Risk Scores ─────────────────────────────────────────────────────────
def test_risk_scores():
    res = client.get("/api/predictions/risk-scores")
    assert res.status_code == 200
    data = res.json()
    assert "risk_scores" in data
    # Should be sorted by risk score (highest first)
    scores = [r["risk_score"] for r in data["risk_scores"]]
    assert scores == sorted(scores, reverse=True)

# ── All Pipelines Live ──────────────────────────────────────────────────
def test_all_pipelines_live():
    res = client.get("/api/pipelines/live/all")
    assert res.status_code == 200
    data = res.json()
    assert "data" in data
    assert data["count"] == 12

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
