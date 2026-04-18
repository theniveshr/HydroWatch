"""
HydroWatch — Pipeline Data Simulator
Simulates real-time Tamil Nadu water infrastructure sensor readings.
"""
import random
import datetime
import math

class PipelineSimulator:
    """Simulates IoT sensor data for Tamil Nadu water pipelines."""

    TN_PIPELINES = [
        {"id": "P-101", "zone": "Chennai Zone A",    "district": "Chennai",      "lat": 13.0827, "lng": 80.2707, "age": 18, "diameter_mm": 400},
        {"id": "P-102", "zone": "Chennai Zone B",    "district": "Chennai",      "lat": 13.0569, "lng": 80.2425, "age": 22, "diameter_mm": 350},
        {"id": "P-103", "zone": "Coimbatore North",  "district": "Coimbatore",   "lat": 11.0168, "lng": 76.9558, "age": 12, "diameter_mm": 300},
        {"id": "P-104", "zone": "Madurai Central",   "district": "Madurai",      "lat": 9.9252,  "lng": 78.1198, "age": 28, "diameter_mm": 500},
        {"id": "P-105", "zone": "Tiruchirappalli",   "district": "Trichy",       "lat": 10.7905, "lng": 78.7047, "age": 15, "diameter_mm": 350},
        {"id": "P-106", "zone": "Salem Main",         "district": "Salem",        "lat": 11.6643, "lng": 78.1460, "age": 10, "diameter_mm": 250},
        {"id": "P-107", "zone": "Vellore East",      "district": "Vellore",      "lat": 12.9165, "lng": 79.1325, "age": 19, "diameter_mm": 300},
        {"id": "P-108", "zone": "Tirunelveli South", "district": "Tirunelveli",  "lat": 8.7139,  "lng": 77.7567, "age": 32, "diameter_mm": 400},
        {"id": "P-109", "zone": "Thanjavur Old",     "district": "Thanjavur",    "lat": 10.7870, "lng": 79.1378, "age": 35, "diameter_mm": 300},
        {"id": "P-110", "zone": "Erode West",         "district": "Erode",        "lat": 11.3410, "lng": 77.7172, "age": 8,  "diameter_mm": 200},
        {"id": "P-111", "zone": "Thoothukudi Port",  "district": "Thoothukudi",  "lat": 8.7642,  "lng": 78.1348, "age": 20, "diameter_mm": 350},
        {"id": "P-112", "zone": "Dindigul Central",  "district": "Dindigul",     "lat": 10.3673, "lng": 77.9803, "age": 14, "diameter_mm": 250},
    ]

    def simulate_sensor(self, pipeline: dict) -> dict:
        """
        Generate realistic sensor readings for a pipeline.
        Older pipes and higher-diameter pipes have higher anomaly probability.
        """
        age        = pipeline["age"]
        diameter   = pipeline.get("diameter_mm", 300)
        age_factor = min(age / 40.0, 1.0)

        # Baseline sensor values with natural variation
        base_pressure = 65 + random.gauss(0, 8)
        base_flow     = 300 + random.gauss(0, 40) - (age_factor * 40)
        base_temp     = 24 + random.gauss(0, 4) + (1 if pipeline["district"] in ["Thoothukudi", "Tirunelveli"] else 0)
        base_vib      = 0.15 + random.gauss(0, 0.08) + (age_factor * 0.2)

        # Random anomaly injection
        anomaly_prob = 0.12 + age_factor * 0.15
        has_anomaly  = random.random() < anomaly_prob

        if has_anomaly:
            anomaly_type = random.choice(["pressure_surge", "flow_drop", "vibration_spike", "combined"])
            if anomaly_type == "pressure_surge":
                base_pressure += random.uniform(15, 35)
                base_vib      += random.uniform(0.1, 0.3)
            elif anomaly_type == "flow_drop":
                base_flow     -= random.uniform(60, 120)
                base_pressure += random.uniform(5, 20)
            elif anomaly_type == "vibration_spike":
                base_vib      += random.uniform(0.3, 0.7)
            elif anomaly_type == "combined":
                base_pressure += random.uniform(20, 40)
                base_flow     -= random.uniform(80, 150)
                base_vib      += random.uniform(0.4, 0.8)
        else:
            anomaly_type = None

        return {
            "pipelineId":   pipeline["id"],
            "zone":         pipeline["zone"],
            "district":     pipeline["district"],
            "lat":          pipeline["lat"],
            "lng":          pipeline["lng"],
            "age":          age,
            "diameter_mm":  diameter,
            "pressure":     round(max(20, base_pressure), 1),
            "flowRate":     round(max(0, base_flow), 1),
            "temperature":  round(max(15, base_temp), 1),
            "vibration":    round(max(0, base_vib), 3),
            "anomaly":      has_anomaly,
            "anomaly_type": anomaly_type,
            "timestamp":    datetime.datetime.now().isoformat(),
        }

    def generate_historical(self, pipeline: dict, points: int = 20) -> list:
        """Generate historical time-series data for charts."""
        history = []
        now     = datetime.datetime.now()
        for i in range(points, 0, -1):
            ts     = now - datetime.timedelta(seconds=i * 3)
            sensor = self.simulate_sensor(pipeline)
            sensor["timestamp"] = ts.isoformat()
            history.append(sensor)
        return history

    def get_pipeline_by_id(self, pipeline_id: str) -> dict:
        return next((p for p in self.TN_PIPELINES if p["id"] == pipeline_id), None)
