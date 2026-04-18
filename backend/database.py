"""
HydroWatch — Database Manager
PostgreSQL database interface using psycopg2.
Falls back to in-memory storage for development/demo mode.
"""
import logging
import datetime
import random
from collections import deque

logger = logging.getLogger("hydrowatch.db")

class DatabaseManager:
    """
    Manages all database operations.
    Uses PostgreSQL in production, in-memory in demo mode.
    """

    def __init__(self):
        self._in_memory = True
        self._sensor_log    = deque(maxlen=1000)
        self._predictions   = deque(maxlen=1000)
        self._alerts        = []
        self._incidents     = []
        self._alert_counter = 0

        try:
            import psycopg2
            self.conn = psycopg2.connect(
                host="localhost", port=5432,
                database="hydrowatch",
                user="hydrowatch_user",
                password="hydrowatch_pass"
            )
            self._in_memory = False
            self._init_tables()
            logger.info("✅ PostgreSQL connected")
        except Exception as e:
            logger.info(f"ℹ️  Running in demo mode (no DB): {e}")

    def _init_tables(self):
        """Initialize PostgreSQL tables."""
        if self._in_memory:
            return
        with self.conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sensor_data (
                    id          SERIAL PRIMARY KEY,
                    pipeline_id VARCHAR(20),
                    zone        VARCHAR(100),
                    district    VARCHAR(100),
                    pressure    FLOAT,
                    flow_rate   FLOAT,
                    temperature FLOAT,
                    vibration   FLOAT,
                    anomaly     BOOLEAN,
                    timestamp   TIMESTAMP DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS predictions (
                    id          SERIAL PRIMARY KEY,
                    pipeline_id VARCHAR(20),
                    probability FLOAT,
                    severity    VARCHAR(20),
                    water_loss  INTEGER,
                    action      TEXT,
                    timestamp   TIMESTAMP DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS incidents (
                    id          SERIAL PRIMARY KEY,
                    pipeline_id VARCHAR(20),
                    location    VARCHAR(200),
                    severity    VARCHAR(20),
                    water_loss  INTEGER,
                    status      VARCHAR(20) DEFAULT 'Open',
                    detected_at TIMESTAMP DEFAULT NOW(),
                    resolved_at TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS alert_log (
                    id          SERIAL PRIMARY KEY,
                    pipeline_id VARCHAR(20),
                    severity    VARCHAR(20),
                    message     TEXT,
                    channel     VARCHAR(50),
                    sent_at     TIMESTAMP DEFAULT NOW()
                );
            """)
            self.conn.commit()

    def log_sensor_data(self, sensor: dict, pred: dict):
        """Log sensor reading + prediction."""
        record = {
            "pipeline_id": sensor.get("pipelineId"),
            "zone":        sensor.get("zone"),
            "district":    sensor.get("district"),
            "pressure":    sensor.get("pressure"),
            "flow_rate":   sensor.get("flowRate"),
            "temperature": sensor.get("temperature"),
            "vibration":   sensor.get("vibration"),
            "anomaly":     sensor.get("anomaly", False),
            "probability": pred.get("probability"),
            "severity":    pred.get("severity"),
            "water_loss":  pred.get("waterLoss"),
            "timestamp":   datetime.datetime.now().isoformat(),
        }
        self._sensor_log.append(record)
        self._predictions.append(record)

        if pred.get("severity") in ["CRITICAL", "WARNING"]:
            self._alert_counter += 1
            alert = {
                "id":          self._alert_counter,
                "pipeline_id": sensor.get("pipelineId"),
                "zone":        sensor.get("zone"),
                "district":    sensor.get("district"),
                "severity":    pred.get("severity"),
                "probability": pred.get("probability"),
                "water_loss":  pred.get("waterLoss"),
                "action":      pred.get("action"),
                "status":      "Open",
                "detected_at": datetime.datetime.now().isoformat(),
            }
            self._alerts.append(alert)
            self._incidents.append(alert)

    def bulk_log(self, results: list):
        """Bulk log multiple pipeline readings."""
        for r in results:
            self.log_sensor_data(r.get("sensor", {}), r.get("prediction", {}))

    def get_predictions(self, limit: int = 50) -> list:
        return list(self._predictions)[-limit:]

    def get_active_alerts(self) -> list:
        return [a for a in self._alerts if a.get("status") == "Open"][-20:]

    def count_active_alerts(self) -> int:
        return sum(1 for a in self._alerts if a.get("status") == "Open")

    def get_incidents(self, limit: int = 50, severity: str = None) -> list:
        incidents = list(self._incidents)
        if severity:
            incidents = [i for i in incidents if i.get("severity") == severity.upper()]
        return incidents[-limit:]

    def resolve_alert(self, alert_id: int) -> bool:
        for a in self._alerts:
            if a["id"] == alert_id:
                a["status"]      = "Resolved"
                a["resolved_at"] = datetime.datetime.now().isoformat()
                return True
        return False

    def get_timeseries(self, pipeline_id: str, points: int = 20) -> list:
        data = [r for r in self._sensor_log if r.get("pipeline_id") == pipeline_id]
        return data[-points:] if data else []
