-- HydroWatch — PostgreSQL Schema
-- Tamil Nadu Water Infrastructure Monitoring Database

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Pipeline Registry ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipelines (
    id              VARCHAR(20)  PRIMARY KEY,
    zone            VARCHAR(100) NOT NULL,
    district        VARCHAR(100) NOT NULL,
    lat             DECIMAL(9,6),
    lng             DECIMAL(9,6),
    age_years       INTEGER      NOT NULL DEFAULT 0,
    diameter_mm     INTEGER      NOT NULL DEFAULT 300,
    material        VARCHAR(50)  DEFAULT 'Cast Iron',
    install_date    DATE,
    last_inspection DATE,
    status          VARCHAR(20)  DEFAULT 'Active',
    created_at      TIMESTAMP    DEFAULT NOW()
);

-- Seed Tamil Nadu pipeline data
INSERT INTO pipelines (id, zone, district, lat, lng, age_years, diameter_mm, material) VALUES
    ('P-101', 'Chennai Zone A',    'Chennai',     13.0827, 80.2707, 18, 400, 'Ductile Iron'),
    ('P-102', 'Chennai Zone B',    'Chennai',     13.0569, 80.2425, 22, 350, 'Cast Iron'),
    ('P-103', 'Coimbatore North',  'Coimbatore',  11.0168, 76.9558, 12, 300, 'HDPE'),
    ('P-104', 'Madurai Central',   'Madurai',      9.9252, 78.1198, 28, 500, 'Cast Iron'),
    ('P-105', 'Tiruchirappalli',   'Trichy',      10.7905, 78.7047, 15, 350, 'Ductile Iron'),
    ('P-106', 'Salem Main',        'Salem',       11.6643, 78.1460, 10, 250, 'HDPE'),
    ('P-107', 'Vellore East',      'Vellore',     12.9165, 79.1325, 19, 300, 'Cast Iron'),
    ('P-108', 'Tirunelveli South', 'Tirunelveli',  8.7139, 77.7567, 32, 400, 'Cast Iron'),
    ('P-109', 'Thanjavur Old',     'Thanjavur',   10.7870, 79.1378, 35, 300, 'Cast Iron'),
    ('P-110', 'Erode West',        'Erode',       11.3410, 77.7172,  8, 200, 'PVC'),
    ('P-111', 'Thoothukudi Port',  'Thoothukudi',  8.7642, 78.1348, 20, 350, 'Ductile Iron'),
    ('P-112', 'Dindigul Central',  'Dindigul',    10.3673, 77.9803, 14, 250, 'HDPE')
ON CONFLICT (id) DO NOTHING;

-- ── Sensor Data ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensor_data (
    id              BIGSERIAL    PRIMARY KEY,
    pipeline_id     VARCHAR(20)  REFERENCES pipelines(id),
    pressure_psi    DECIMAL(6,2) NOT NULL,
    flow_rate_lpm   DECIMAL(8,2) NOT NULL,
    temperature_c   DECIMAL(5,2) NOT NULL,
    vibration_index DECIMAL(6,3) NOT NULL,
    has_anomaly     BOOLEAN      DEFAULT FALSE,
    anomaly_type    VARCHAR(50),
    recorded_at     TIMESTAMP    DEFAULT NOW()
);

-- Partition by month for performance
CREATE INDEX idx_sensor_pipeline ON sensor_data(pipeline_id);
CREATE INDEX idx_sensor_time     ON sensor_data(recorded_at DESC);
CREATE INDEX idx_sensor_anomaly  ON sensor_data(has_anomaly) WHERE has_anomaly = TRUE;

-- ── Predictions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictions (
    id              BIGSERIAL    PRIMARY KEY,
    pipeline_id     VARCHAR(20)  REFERENCES pipelines(id),
    sensor_id       BIGINT       REFERENCES sensor_data(id),
    probability     DECIMAL(5,3) NOT NULL,
    severity        VARCHAR(20)  NOT NULL CHECK (severity IN ('NORMAL', 'WARNING', 'CRITICAL')),
    water_loss_lph  INTEGER      NOT NULL DEFAULT 0,
    action_required TEXT,
    model_version   VARCHAR(20)  DEFAULT 'v1.0',
    predicted_at    TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX idx_pred_pipeline  ON predictions(pipeline_id);
CREATE INDEX idx_pred_severity  ON predictions(severity);
CREATE INDEX idx_pred_time      ON predictions(predicted_at DESC);

-- ── Incidents ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
    id              BIGSERIAL    PRIMARY KEY,
    pipeline_id     VARCHAR(20)  REFERENCES pipelines(id),
    severity        VARCHAR(20)  NOT NULL,
    probability     DECIMAL(5,3),
    water_loss_lph  INTEGER,
    action_required TEXT,
    status          VARCHAR(20)  DEFAULT 'Open' CHECK (status IN ('Open', 'Monitoring', 'Resolved', 'False Positive')),
    detected_at     TIMESTAMP    DEFAULT NOW(),
    resolved_at     TIMESTAMP,
    resolved_by     VARCHAR(100),
    notes           TEXT
);

CREATE INDEX idx_inc_pipeline ON incidents(pipeline_id);
CREATE INDEX idx_inc_status   ON incidents(status);
CREATE INDEX idx_inc_time     ON incidents(detected_at DESC);

-- ── Alert Log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_log (
    id          BIGSERIAL   PRIMARY KEY,
    incident_id BIGINT      REFERENCES incidents(id),
    pipeline_id VARCHAR(20),
    channel     VARCHAR(50) NOT NULL,
    message     TEXT,
    sent        BOOLEAN     DEFAULT FALSE,
    error       TEXT,
    sent_at     TIMESTAMP   DEFAULT NOW()
);

-- ── Users ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL      PRIMARY KEY,
    username    VARCHAR(50) UNIQUE NOT NULL,
    email       VARCHAR(100) UNIQUE,
    role        VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('admin', 'engineer', 'viewer')),
    password_hash TEXT      NOT NULL,
    last_login  TIMESTAMP,
    created_at  TIMESTAMP   DEFAULT NOW()
);

-- Seed default admin user (password: admin123)
INSERT INTO users (username, email, role, password_hash) VALUES
    ('admin',    'admin@hydrowatch.tn',    'admin',    '$2b$12$adminHashHere'),
    ('engineer', 'eng@hydrowatch.tn',      'engineer', '$2b$12$engHashHere'),
    ('viewer',   'viewer@hydrowatch.tn',   'viewer',   '$2b$12$viewerHashHere')
ON CONFLICT (username) DO NOTHING;

-- ── Views ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW dashboard_summary AS
SELECT
    COUNT(DISTINCT p.id)                                    AS total_pipelines,
    COUNT(CASE WHEN i.status = 'Open' THEN 1 END)          AS active_incidents,
    AVG(sd.pressure_psi)                                    AS avg_pressure_psi,
    SUM(CASE WHEN i.status = 'Open' THEN i.water_loss_lph ELSE 0 END) AS total_water_loss_lph,
    COUNT(CASE WHEN i.severity = 'CRITICAL' THEN 1 END)    AS critical_count,
    COUNT(CASE WHEN i.severity = 'WARNING' THEN 1 END)     AS warning_count
FROM pipelines p
LEFT JOIN sensor_data sd ON sd.pipeline_id = p.id AND sd.recorded_at > NOW() - INTERVAL '5 minutes'
LEFT JOIN incidents i    ON i.pipeline_id  = p.id AND i.detected_at  > NOW() - INTERVAL '1 hour';

-- ── Grant Permissions ─────────────────────────────────────────────────
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO hydrowatch_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hydrowatch_user;
