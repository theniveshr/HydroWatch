"""
HydroWatch — ML Model Training Script
Trains Random Forest + Isolation Forest models on
synthetic Tamil Nadu pipeline sensor data.

Run: python train_model.py
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, IsolationForest, GradientBoostingClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from sklearn.preprocessing import StandardScaler
import pickle
import os
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s — %(message)s')
logger = logging.getLogger(__name__)

# ── Dataset Generation ────────────────────────────────────────────────────
def generate_dataset(n_samples: int = 10000) -> pd.DataFrame:
    """
    Generate synthetic labeled dataset based on Tamil Nadu pipeline characteristics.
    Labels: 0 = Normal, 1 = Leak
    """
    np.random.seed(42)
    records = []

    for _ in range(n_samples):
        age     = np.random.randint(5, 40)
        af      = age / 40.0

        # Normal operating parameters
        pressure    = np.random.normal(65, 10)
        flow_rate   = np.random.normal(300, 30) - af * 30
        temperature = np.random.normal(26, 4)
        vibration   = np.random.normal(0.2, 0.08) + af * 0.1

        # Determine if this is a leak scenario
        leak_prob = 0.0
        if pressure    > 85:   leak_prob += 0.30
        if pressure    < 40:   leak_prob += 0.25
        if flow_rate   < 220:  leak_prob += 0.25
        if vibration   > 0.7:  leak_prob += 0.20
        if age         > 28:   leak_prob += 0.15
        if temperature > 34:   leak_prob += 0.05

        label = 1 if np.random.random() < min(leak_prob, 0.95) else 0

        # Add more dramatic values for positive examples
        if label == 1:
            pressure    += np.random.uniform(10, 30)
            flow_rate   -= np.random.uniform(50, 120)
            vibration   += np.random.uniform(0.2, 0.6)

        records.append({
            "pressure":    max(10, pressure),
            "flow_rate":   max(0, flow_rate),
            "temperature": max(15, temperature),
            "vibration":   max(0, vibration),
            "age":         age,
            "label":       label,
        })

    df = pd.DataFrame(records)
    logger.info(f"Dataset: {len(df)} samples | Leak rate: {df['label'].mean():.1%}")
    return df

# ── Model Training ─────────────────────────────────────────────────────────
def train_models():
    os.makedirs("models", exist_ok=True)

    logger.info("📊 Generating training dataset...")
    df = generate_dataset(n_samples=15000)

    X = df[["pressure", "flow_rate", "temperature", "vibration", "age"]]
    y = df["label"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    # ── Random Forest ──────────────────────────────────────────────────────
    logger.info("🌲 Training Random Forest Classifier...")
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)

    rf_preds = rf.predict(X_test)
    rf_proba = rf.predict_proba(X_test)[:, 1]
    logger.info("\n📈 Random Forest Results:")
    logger.info(f"AUC-ROC: {roc_auc_score(y_test, rf_proba):.4f}")
    logger.info(f"\n{classification_report(y_test, rf_preds)}")

    cv_scores = cross_val_score(rf, X, y, cv=5, scoring="roc_auc")
    logger.info(f"Cross-Validation AUC: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # ── Gradient Boosting ─────────────────────────────────────────────────
    logger.info("\n🚀 Training Gradient Boosting Classifier...")
    gb = GradientBoostingClassifier(
        n_estimators=150,
        learning_rate=0.1,
        max_depth=5,
        random_state=42,
    )
    gb.fit(X_train, y_train)
    gb_proba = gb.predict_proba(X_test)[:, 1]
    logger.info(f"GB AUC-ROC: {roc_auc_score(y_test, gb_proba):.4f}")

    # ── Isolation Forest (Anomaly Detection) ─────────────────────────────
    logger.info("\n🔍 Training Isolation Forest (Anomaly Detection)...")
    iso = IsolationForest(
        n_estimators=100,
        contamination=0.15,
        random_state=42,
        n_jobs=-1,
    )
    iso.fit(X_train[y_train == 0])  # Train on normal data only

    # ── Feature Importance ─────────────────────────────────────────────────
    features = ["Pressure", "Flow Rate", "Temperature", "Vibration", "Age"]
    importances = rf.feature_importances_
    logger.info("\n📊 Feature Importances (Random Forest):")
    for feat, imp in sorted(zip(features, importances), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        logger.info(f"  {feat:15} {imp:.3f}  {bar}")

    # ── Save Models ────────────────────────────────────────────────────────
    with open("models/rf_model.pkl",  "wb") as f: pickle.dump(rf, f)
    with open("models/gb_model.pkl",  "wb") as f: pickle.dump(gb, f)
    with open("models/iso_model.pkl", "wb") as f: pickle.dump(iso, f)
    logger.info("\n✅ Models saved to models/")

    # ── Save Sample Predictions ─────────────────────────────────────────────
    sample_inputs = pd.DataFrame([
        {"pressure": 95, "flow_rate": 180, "temperature": 28, "vibration": 0.85, "age": 30},
        {"pressure": 60, "flow_rate": 320, "temperature": 25, "vibration": 0.15, "age": 8},
        {"pressure": 78, "flow_rate": 265, "temperature": 31, "vibration": 0.55, "age": 22},
    ])
    sample_proba = rf.predict_proba(sample_inputs)[:, 1]
    logger.info("\n🔮 Sample Predictions:")
    labels = ["High Leak Risk", "Normal", "Warning"]
    for i, (prob, lbl) in enumerate(zip(sample_proba, labels)):
        logger.info(f"  Sample {i+1}: {prob:.3f} probability — Expected: {lbl}")

    return rf, gb, iso

if __name__ == "__main__":
    train_models()
    logger.info("\n🎉 Training complete! Models ready at ml/models/")
