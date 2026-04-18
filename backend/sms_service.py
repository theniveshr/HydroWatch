"""
HydroWatch — Telegram Alert Service
Sends alerts to Telegram bot when leaks are detected
Credentials loaded from backend/.env
"""
import requests
import logging
import datetime
import os
from pathlib import Path
from dotenv import load_dotenv

# Force load .env from backend folder
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

logger = logging.getLogger("hydrowatch.sms")


class SMSAlertService:

    def __init__(self):
        # Loaded from backend/.env
        self.bot_token     = os.getenv("TELEGRAM_BOT_TOKEN", "")
        self.chat_id       = os.getenv("TELEGRAM_CHAT_ID",   "")
        self.cooldown_mins = int(os.getenv("SMS_COOLDOWN_MINUTES", "5"))
        self._last_sms     = {}
        self.enabled       = bool(self.bot_token and self.chat_id)

        if self.enabled:
            logger.info(f"✅ Telegram Bot ready — chat ID: {self.chat_id}")
        else:
            logger.warning("⚠️  Telegram disabled — fill TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in backend/.env")

    def _is_cooldown(self, pipeline_id: str) -> bool:
        last = self._last_sms.get(pipeline_id)
        if not last:
            return False
        elapsed = (datetime.datetime.now() - last).total_seconds() / 60
        return elapsed < self.cooldown_mins

    def _format_message(self, pipeline: dict, sensor: dict, pred: dict) -> str:
        time_str = datetime.datetime.now().strftime("%d/%m/%Y %I:%M %p")
        icon = "🔴" if pred["severity"] == "CRITICAL" else "🟡"
        return (
            f"{icon} *HydroWatch ALERT*\n"
            f"Pipeline: *{pipeline['id']}* — {pipeline['zone']}\n"
            f"District: {pipeline['district']}\n"
            f"Severity: *{pred['severity']}*\n"
            f"Leak: {round(pred['probability'] * 100, 1)}%\n"
            f"Loss: {pred['waterLoss']} L/hr\n"
            f"Pressure: {sensor['pressure']} PSI\n"
            f"Action: {pred['action']}\n"
            f"Time: {time_str} IST"
        )

    def send_alert(self, pipeline: dict, sensor: dict, pred: dict) -> bool:
        if not self.enabled:
            return False
        if pred.get("severity") == "NORMAL":
            return False
        pid = pipeline.get("id", "unknown")
        if self._is_cooldown(pid):
            logger.info(f"Telegram cooldown active for {pid} — skipping")
            return False
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            response = requests.post(
                url,
                json={
                    "chat_id":    self.chat_id,
                    "text":       self._format_message(pipeline, sensor, pred),
                    "parse_mode": "Markdown",
                },
                timeout=15,
            )
            result = response.json()
            if result.get("ok"):
                self._last_sms[pid] = datetime.datetime.now()
                logger.info(f"✅ Telegram sent [{pred['severity']}] {pid}")
                return True
            else:
                logger.warning(f"⚠️  Telegram response: {result}")
                return False
        except requests.exceptions.Timeout:
            logger.error(f"❌ Telegram timeout for {pid} — use mobile hotspot")
            return False
        except Exception as e:
            logger.error(f"❌ Telegram failed for {pid}: {e}")
            return False

    def send_test_sms(self) -> dict:
        if not self.enabled:
            return {
                "status":  "disabled",
                "message": "Fill TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in backend/.env",
            }
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            response = requests.post(
                url,
                json={
                    "chat_id":    self.chat_id,
                    "text":       "✅ *HydroWatch Alert Test*\nTelegram alerts are working correctly!",
                    "parse_mode": "Markdown",
                },
                timeout=15,
            )
            result = response.json()
            if result.get("ok"):
                return {"status": "sent", "message": "Test message delivered to Telegram"}
            else:
                return {"status": "failed", "detail": result}
        except requests.exceptions.Timeout:
            return {"status": "error", "message": "Timeout — connect to mobile hotspot"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
