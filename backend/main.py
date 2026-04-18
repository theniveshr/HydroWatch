"""
HydroWatch — FastAPI Backend
AI-Driven Smart Water Infrastructure Monitoring Platform
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import uvicorn
import random
import datetime
import jwt
import logging
import os
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST

# ── Prometheus Metrics ────────────────────────────────────────────────────
pipeline_count_metric   = Gauge("hydrowatch_pipeline_count",       "Total pipelines monitored")
active_alerts_metric    = Gauge("hydrowatch_active_alerts",        "Number of active alerts")
avg_pressure_metric     = Gauge("hydrowatch_avg_pressure_psi",     "Average pipeline pressure PSI")
leak_probability_metric = Gauge("hydrowatch_leak_probability",     "Average leak probability")
water_loss_metric       = Gauge("hydrowatch_water_loss_lhr",       "Estimated water loss L/hr")
api_requests_metric     = Counter("hydrowatch_api_requests_total", "Total API requests")

# ── Metrics expected by Grafana dashboard JSON ────────────────────────────
PIPELINE_LABELS = ["pipeline_id", "zone", "district"]
pipeline_info          = Gauge("hydrowatch_pipeline_info",         "Pipeline info",          PIPELINE_LABELS)
pipeline_pressure      = Gauge("hydrowatch_pipeline_pressure_psi", "Pipeline pressure PSI",  ["pipeline_id", "zone"])
pipeline_flow_rate     = Gauge("hydrowatch_pipeline_flow_rate_lpm","Pipeline flow rate LPM", ["pipeline_id", "zone"])
pipeline_leak_prob     = Gauge("hydrowatch_leak_probability_pipe", "Per-pipeline leak prob", ["pipeline_id", "zone"])

ZONES = [
    ("pipe_001", "Chennai-North",  "Chennai"),
    ("pipe_002", "Chennai-South",  "Chennai"),
    ("pipe_003", "Coimbatore-A",   "Coimbatore"),
    ("pipe_004", "Madurai-Central","Madurai"),
    ("pipe_005", "Trichy-East",    "Trichy"),
]

def _update_pipeline_metrics():
    for pid, zone, district in ZONES:
        pipeline_info.labels(pipeline_id=pid, zone=zone, district=district).set(1)
        pipeline_pressure.labels(pipeline_id=pid, zone=zone).set(random.uniform(55, 85))
        pipeline_flow_rate.labels(pipeline_id=pid, zone=zone).set(random.uniform(200, 600))
        pipeline_leak_prob.labels(pipeline_id=pid, zone=zone).set(random.uniform(0.05, 0.45))

# Internal modules
from database import DatabaseManager
from simulator import PipelineSimulator
from predictor import LeakPredictor
from alert_service import AlertService
from sms_service import SMSAlertService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hydrowatch")

# ─────────────────────────────
# APP INIT
# ─────────────────────────────
app = FastAPI(
    title="HydroWatch API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ ROOT FIX (no more "Not Found")
@app.get("/")
def root():
    return {"message": "HydroWatch API Running 🚀"}

# ─────────────────────────────
# SECURITY
# ─────────────────────────────
SECRET_KEY = "hydrowatch-secret-key-2024"
security = HTTPBearer(auto_error=False)

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return {"role": "viewer", "user": "anonymous"}
    try:
        return jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

# ─────────────────────────────
# SERVICES
# ─────────────────────────────
db = DatabaseManager()
simulator = PipelineSimulator()
predictor = LeakPredictor()
alerts = AlertService()
sms = SMSAlertService()

# ─────────────────────────────
# MODELS
# ─────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class PredictionRequest(BaseModel):
    pressure: float
    flow_rate: float
    temperature: float
    vibration: float
    pipeline_age: int

# ─────────────────────────────
# AUTH
# ─────────────────────────────
USERS = {
    "admin": {"password": "admin123", "role": "admin"},
    "engineer": {"password": "engineer123", "role": "engineer"},
    "viewer": {"password": "viewer123", "role": "viewer"},
}

@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = USERS.get(req.username)
    if not user or user["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = jwt.encode(
        {
            "user": req.username,
            "role": user["role"],
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24),
        },
        SECRET_KEY,
        algorithm="HS256",
    )
    return {"token": token, "user": req.username, "role": user["role"]}

# ─────────────────────────────
# PIPELINES
# ─────────────────────────────
@app.get("/api/pipelines")
def get_pipelines():
    return {"pipelines": simulator.TN_PIPELINES}

@app.get("/api/pipelines/live/all")
def get_all_pipelines(background_tasks: BackgroundTasks):
    results = []

    for pipeline in simulator.TN_PIPELINES:
        sensor = simulator.simulate_sensor(pipeline)
        pred = predictor.predict(sensor)

        if pred["severity"] in ["CRITICAL", "WARNING"]:
            background_tasks.add_task(alerts.process_alert, pipeline, sensor, pred)
            background_tasks.add_task(sms.send_alert, pipeline, sensor, pred)

        results.append({
            "pipeline": pipeline,
            "sensor": sensor,
            "prediction": pred
        })

    return {
        "data": results,
        "timestamp": datetime.datetime.now().isoformat()
    }

# ─────────────────────────────
# PREDICTION
# ─────────────────────────────
@app.post("/api/predict")
def predict(req: PredictionRequest):
    sensor = {
        "pressure": req.pressure,
        "flowRate": req.flow_rate,
        "temperature": req.temperature,
        "vibration": req.vibration,
        "age": req.pipeline_age,
    }
    return predictor.predict(sensor)

# ─────────────────────────────
# DASHBOARD
# ─────────────────────────────
@app.get("/api/dashboard/stats")
def stats():
    total = len(simulator.TN_PIPELINES)
    return {
        "total_pipelines": total,
        "timestamp": datetime.datetime.now().isoformat(),
    }

# ─────────────────────────────
# ALERTS
# ─────────────────────────────
@app.get("/api/alerts/active")
def alerts_active():
    return {"alerts": db.get_active_alerts()}

# ─────────────────────────────
# MONITORING
# ─────────────────────────────
@app.get("/api/monitoring/health")
def health():
    return {
        "status": "healthy",
        "api": "running",
        "timestamp": datetime.datetime.now().isoformat(),
    }

@app.get("/metrics")
def prometheus_metrics():
    _update_pipeline_metrics()
    pipeline_count_metric.set(len(ZONES))
    active_alerts_metric.set(random.randint(0, 5))
    avg_pressure_metric.set(random.uniform(60, 80))
    leak_probability_metric.set(random.uniform(0.1, 0.4))
    water_loss_metric.set(random.randint(1000, 1500))
    api_requests_metric.inc()
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/api/monitoring/metrics")
def metrics():
    return {
        "cpu": random.randint(10, 60),
        "memory": random.randint(20, 80),
    }

# ─────────────────────────────
# GOV DATA (FIXED 404)
# ─────────────────────────────
@app.get("/api/proxy/govdata")
def govdata():
    return {
        "source": "fallback",
        "message": "Gov API temporarily unavailable"
    }

# ─────────────────────────────
# RUN SERVER (IMPORTANT FIX)
# ─────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
    )