"""
HydroWatch — Alert Service
Handles multi-channel alerts: Dashboard, Email, Telegram, Webhook
"""
import logging
import datetime
import json
import os

logger = logging.getLogger("hydrowatch.alerts")

class AlertService:
    """Multi-channel alert service for leak detection events."""

    def __init__(self):
        self.email_enabled    = False
        self.telegram_enabled = False
        self.webhook_url      = os.getenv("ALERT_WEBHOOK_URL", "")
        self.telegram_token   = os.getenv("TELEGRAM_BOT_TOKEN", "")
        self.telegram_chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
        self.smtp_host        = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port        = int(os.getenv("SMTP_PORT", 587))
        self.alert_email      = os.getenv("ALERT_EMAIL", "")
        self.alert_log        = []

    def format_message(self, pipeline: dict, sensor: dict, pred: dict) -> str:
        return (
            f"⚠️ HydroWatch Alert\n"
            f"Pipeline: {pipeline['id']} — {pipeline['zone']}\n"
            f"District: {pipeline['district']}\n"
            f"Severity: {pred['severity']}\n"
            f"Leak Probability: {round(pred['probability'] * 100, 1)}%\n"
            f"Est. Water Loss: {pred['waterLoss']} L/hr\n"
            f"Pressure: {sensor['pressure']} PSI\n"
            f"Flow Rate: {sensor['flowRate']} L/min\n"
            f"Action: {pred['action']}\n"
            f"Time: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S IST')}"
        )

    async def process_alert(self, pipeline: dict, sensor: dict, pred: dict):
        """Process and dispatch alerts via configured channels."""
        msg = self.format_message(pipeline, sensor, pred)
        log_entry = {
            "pipeline_id": pipeline["id"],
            "severity":    pred["severity"],
            "message":     msg,
            "channels":    [],
            "timestamp":   datetime.datetime.now().isoformat(),
        }

        # Dashboard alert (always logged)
        log_entry["channels"].append("dashboard")
        logger.info(f"🚨 ALERT [{pred['severity']}] {pipeline['id']}: {pred['waterLoss']} L/hr loss")

        # Email alert
        if self.email_enabled and self.alert_email:
            try:
                await self._send_email(msg, pred["severity"])
                log_entry["channels"].append("email")
            except Exception as e:
                logger.warning(f"Email alert failed: {e}")

        # Telegram alert
        if self.telegram_enabled and self.telegram_token:
            try:
                await self._send_telegram(msg)
                log_entry["channels"].append("telegram")
            except Exception as e:
                logger.warning(f"Telegram alert failed: {e}")

        # Webhook
        if self.webhook_url:
            try:
                await self._send_webhook(pipeline, sensor, pred)
                log_entry["channels"].append("webhook")
            except Exception as e:
                logger.warning(f"Webhook alert failed: {e}")

        self.alert_log.append(log_entry)

    async def _send_email(self, message: str, severity: str):
        """Send alert email via SMTP."""
        import smtplib
        from email.mime.text import MIMEText
        smtp_pass = os.getenv("SMTP_PASSWORD", "")
        if not smtp_pass:
            return
        msg = MIMEText(message)
        msg["Subject"] = f"[HydroWatch] {severity} Alert — Leak Detected"
        msg["From"]    = self.alert_email
        msg["To"]      = self.alert_email
        with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
            server.starttls()
            server.login(self.alert_email, smtp_pass)
            server.send_message(msg)

    async def _send_telegram(self, message: str):
        """Send alert via Telegram Bot API."""
        import httpx
        url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
        async with httpx.AsyncClient() as client:
            await client.post(url, json={"chat_id": self.telegram_chat_id, "text": message, "parse_mode": "HTML"})

    async def _send_webhook(self, pipeline: dict, sensor: dict, pred: dict):
        """Send structured alert payload to webhook URL."""
        import httpx
        payload = {
            "event":     "leak_detected",
            "pipeline":  pipeline["id"],
            "zone":      pipeline["zone"],
            "district":  pipeline["district"],
            "severity":  pred["severity"],
            "probability": pred["probability"],
            "water_loss":  pred["waterLoss"],
            "timestamp": datetime.datetime.now().isoformat(),
        }
        async with httpx.AsyncClient() as client:
            await client.post(self.webhook_url, json=payload, timeout=5)
