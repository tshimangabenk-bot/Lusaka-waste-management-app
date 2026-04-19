-- ============================================================================
-- SMART WASTE MANAGEMENT SYSTEM — LUSAKA CITY COUNCIL
-- PostgreSQL + PostGIS Database Schema
-- ============================================================================
-- Requires: PostgreSQL 14+  |  PostGIS extension
-- Run:  psql -U postgres -f DB.sql
-- ============================================================================

-- 0. Create the database (run separately as superuser if needed)
-- CREATE DATABASE smart_waste_lusaka;
-- \c smart_waste_lusaka;

-- Enable PostGIS for spatial / GPS operations
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ENUMERATIONS
-- ============================================================================

CREATE TYPE user_role       AS ENUM ('resident', 'collector', 'admin');
CREATE TYPE bin_status      AS ENUM ('empty', 'low', 'medium', 'high', 'full', 'overflow', 'maintenance');
CREATE TYPE report_status   AS ENUM ('pending', 'acknowledged', 'in_progress', 'resolved', 'rejected');
CREATE TYPE report_category AS ENUM ('illegal_dumping', 'overflowing_bin', 'missed_collection', 'hazardous_waste', 'other');
CREATE TYPE route_status    AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE reward_action   AS ENUM ('recycling_drop_off', 'report_verified', 'community_cleanup', 'referral', 'redemption');
CREATE TYPE alert_severity  AS ENUM ('info', 'warning', 'critical');
CREATE TYPE alert_type      AS ENUM ('bin_full', 'bin_overflow', 'sensor_offline', 'maintenance_due', 'missed_collection');
CREATE TYPE vehicle_status  AS ENUM ('available', 'on_route', 'maintenance', 'decommissioned');
CREATE TYPE sensor_status   AS ENUM ('online', 'offline', 'low_battery', 'fault');

-- ============================================================================
-- 2. USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    phone           VARCHAR(20)  UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    role            user_role    NOT NULL DEFAULT 'resident',
    profile_image   TEXT,                       -- URL / S3 key
    compound        VARCHAR(150),               -- e.g. "Mtendere", "George"
    location        GEOMETRY(Point, 4326),      -- home GPS coordinates
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role     ON users (role);
CREATE INDEX idx_users_compound ON users (compound);
CREATE INDEX idx_users_location ON users USING GIST (location);

-- JWT refresh‐token store (allows multi‐device login & revocation)
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(512) NOT NULL,
    device_info     VARCHAR(255),
    expires_at      TIMESTAMPTZ  NOT NULL,
    revoked         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_user ON refresh_tokens (user_id);

-- ============================================================================
-- 3. ZONES & COMPOUNDS
-- ============================================================================

CREATE TABLE zones (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL UNIQUE,       -- e.g. "Mtendere Ward"
    boundary        GEOMETRY(Polygon, 4326),             -- ward / zone polygon
    population_est  INTEGER,
    description     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_zones_boundary ON zones USING GIST (boundary);

-- ============================================================================
-- 4. SMART BINS & IoT SENSORS
-- ============================================================================

CREATE TABLE smart_bins (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label           VARCHAR(100) NOT NULL,              -- human‐friendly label
    zone_id         INTEGER      REFERENCES zones(id) ON DELETE SET NULL,
    location        GEOMETRY(Point, 4326) NOT NULL,     -- GPS coordinates
    address         TEXT,
    capacity_liters NUMERIC(8,2) NOT NULL DEFAULT 240,  -- bin capacity
    bin_type        VARCHAR(50)  NOT NULL DEFAULT 'general', -- general / recyclable / organic / hazardous
    status          bin_status   NOT NULL DEFAULT 'empty',
    fill_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00, -- 0.00 – 100.00
    last_emptied_at TIMESTAMPTZ,
    installed_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bins_zone     ON smart_bins (zone_id);
CREATE INDEX idx_bins_status   ON smart_bins (status);
CREATE INDEX idx_bins_location ON smart_bins USING GIST (location);

CREATE TABLE sensors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bin_id          UUID         NOT NULL REFERENCES smart_bins(id) ON DELETE CASCADE,
    sensor_type     VARCHAR(50)  NOT NULL DEFAULT 'ultrasonic',  -- ultrasonic / weight / temperature
    hardware_id     VARCHAR(100) UNIQUE NOT NULL,                -- MAC address or serial
    firmware_ver    VARCHAR(20),
    battery_level   NUMERIC(5,2),               -- percentage
    status          sensor_status NOT NULL DEFAULT 'online',
    last_ping_at    TIMESTAMPTZ,
    installed_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sensors_bin    ON sensors (bin_id);
CREATE INDEX idx_sensors_status ON sensors (status);

-- Time‐series readings from MQTT messages
CREATE TABLE sensor_readings (
    id              BIGSERIAL PRIMARY KEY,
    sensor_id       UUID         NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    bin_id          UUID         NOT NULL REFERENCES smart_bins(id) ON DELETE CASCADE,
    fill_percentage NUMERIC(5,2) NOT NULL,      -- calculated from distance
    distance_cm     NUMERIC(8,2),               -- raw ultrasonic reading
    temperature_c   NUMERIC(5,2),
    weight_kg       NUMERIC(8,2),
    battery_level   NUMERIC(5,2),
    recorded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_readings_sensor ON sensor_readings (sensor_id, recorded_at DESC);
CREATE INDEX idx_readings_bin    ON sensor_readings (bin_id, recorded_at DESC);

-- ============================================================================
-- 5. CITIZEN REPORTS (illegal dumping, missed collection, etc.)
-- ============================================================================

CREATE TABLE reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id     UUID            NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    category        report_category NOT NULL,
    description     TEXT            NOT NULL,
    location        GEOMETRY(Point, 4326) NOT NULL,
    address         TEXT,
    zone_id         INTEGER         REFERENCES zones(id) ON DELETE SET NULL,
    status          report_status   NOT NULL DEFAULT 'pending',
    assigned_to     UUID            REFERENCES users(id),   -- collector / inspector
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_reporter ON reports (reporter_id);
CREATE INDEX idx_reports_status   ON reports (status);
CREATE INDEX idx_reports_zone     ON reports (zone_id);
CREATE INDEX idx_reports_location ON reports USING GIST (location);

-- Photos / evidence attached to a report
CREATE TABLE report_images (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id       UUID         NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    image_url       TEXT         NOT NULL,      -- S3 / local path
    caption         VARCHAR(255),
    uploaded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_images_report ON report_images (report_id);

-- ============================================================================
-- 6. COLLECTION VEHICLES & FLEET
-- ============================================================================

CREATE TABLE vehicles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_no VARCHAR(20) UNIQUE NOT NULL,
    vehicle_type    VARCHAR(50) NOT NULL DEFAULT 'compactor', -- compactor / tipper / skip_loader
    capacity_tons   NUMERIC(6,2) NOT NULL,
    status          vehicle_status NOT NULL DEFAULT 'available',
    current_location GEOMETRY(Point, 4326),
    assigned_driver UUID        REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vehicles_status   ON vehicles (status);
CREATE INDEX idx_vehicles_location ON vehicles USING GIST (current_location);

-- ============================================================================
-- 7. ROUTE OPTIMIZATION & COLLECTION SCHEDULES
-- ============================================================================

CREATE TABLE collection_routes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(150) NOT NULL,
    zone_id         INTEGER      REFERENCES zones(id),
    vehicle_id      UUID         REFERENCES vehicles(id),
    driver_id       UUID         REFERENCES users(id),        -- collector role
    status          route_status NOT NULL DEFAULT 'planned',
    scheduled_date  DATE         NOT NULL,
    start_time      TIMESTAMPTZ,
    end_time        TIMESTAMPTZ,
    total_distance_km NUMERIC(8,2),
    route_geometry  GEOMETRY(LineString, 4326),  -- optimised path from Google Maps
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_routes_zone   ON collection_routes (zone_id);
CREATE INDEX idx_routes_date   ON collection_routes (scheduled_date);
CREATE INDEX idx_routes_status ON collection_routes (status);

-- Ordered stops on each route
CREATE TABLE route_stops (
    id              SERIAL PRIMARY KEY,
    route_id        UUID    NOT NULL REFERENCES collection_routes(id) ON DELETE CASCADE,
    bin_id          UUID    NOT NULL REFERENCES smart_bins(id),
    stop_order      INTEGER NOT NULL,
    visited         BOOLEAN NOT NULL DEFAULT FALSE,
    visited_at      TIMESTAMPTZ,
    fill_at_visit   NUMERIC(5,2),               -- fill % recorded at collection
    UNIQUE (route_id, stop_order)
);

CREATE INDEX idx_stops_route ON route_stops (route_id);

-- ============================================================================
-- 8. RECYCLING INCENTIVE / REWARD SYSTEM
-- ============================================================================

CREATE TABLE reward_catalog (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    points_cost     INTEGER      NOT NULL,
    stock           INTEGER,                     -- NULL = unlimited
    image_url       TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE user_rewards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_points    INTEGER      NOT NULL DEFAULT 0,
    lifetime_points INTEGER      NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_rewards_user ON user_rewards (user_id);

CREATE TABLE reward_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action          reward_action NOT NULL,
    points          INTEGER       NOT NULL,      -- positive = earn, negative = spend
    reference_id    UUID,                        -- FK to report / catalog item depending on action
    description     TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reward_tx_user ON reward_transactions (user_id, created_at DESC);

-- ============================================================================
-- 9. ALERTS & NOTIFICATIONS
-- ============================================================================

CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bin_id          UUID           REFERENCES smart_bins(id) ON DELETE CASCADE,
    alert_type      alert_type     NOT NULL,
    severity        alert_severity NOT NULL DEFAULT 'info',
    message         TEXT           NOT NULL,
    is_read         BOOLEAN        NOT NULL DEFAULT FALSE,
    resolved        BOOLEAN        NOT NULL DEFAULT FALSE,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_bin      ON alerts (bin_id);
CREATE INDEX idx_alerts_resolved ON alerts (resolved, created_at DESC);

CREATE TABLE user_notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    body            TEXT         NOT NULL,
    is_read         BOOLEAN      NOT NULL DEFAULT FALSE,
    link            TEXT,                        -- deep link into app
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user ON user_notifications (user_id, is_read, created_at DESC);

-- ============================================================================
-- 10. PREDICTIVE ANALYTICS — WASTE GENERATION LOGS
-- ============================================================================

-- Aggregated daily data per zone, consumed by Scikit‐learn models
CREATE TABLE waste_generation_logs (
    id              BIGSERIAL PRIMARY KEY,
    zone_id         INTEGER     NOT NULL REFERENCES zones(id),
    log_date        DATE        NOT NULL,
    total_volume_l  NUMERIC(12,2),   -- litres collected
    total_weight_kg NUMERIC(12,2),   -- weight collected
    bins_emptied    INTEGER,
    avg_fill_pct    NUMERIC(5,2),
    weather_temp_c  NUMERIC(5,2),    -- external factors for ML
    weather_rain_mm NUMERIC(6,2),
    UNIQUE (zone_id, log_date)
);

CREATE INDEX idx_waste_logs_zone_date ON waste_generation_logs (zone_id, log_date DESC);

-- Model metadata & version tracking
CREATE TABLE ml_models (
    id              SERIAL PRIMARY KEY,
    model_name      VARCHAR(150) NOT NULL,
    version         VARCHAR(20)  NOT NULL,
    description     TEXT,
    accuracy        NUMERIC(5,4),   -- e.g. 0.9210
    model_path      TEXT NOT NULL,   -- filesystem / S3 path to .pkl
    trained_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 11. AUDIT LOG
-- ============================================================================

CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,       -- e.g. "bin.emptied", "report.resolved"
    entity_type     VARCHAR(50),                 -- e.g. "smart_bins", "reports"
    entity_id       UUID,
    details         JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user   ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);

-- ============================================================================
-- 12. HELPER FUNCTIONS
-- ============================================================================

-- Automatically update the updated_at column on row modification
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to every table that has an updated_at column
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at'
          AND table_schema = 'public'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();',
            tbl, tbl
        );
    END LOOP;
END;
$$;

-- ============================================================================
-- 13. SEED DATA — Lusaka Zones
-- ============================================================================

INSERT INTO zones (name, population_est, description) VALUES
    ('Mtendere',        85000,  'High-density residential compound in eastern Lusaka'),
    ('George Compound', 120000, 'One of the largest informal settlements in Lusaka'),
    ('Kalingalinga',    60000,  'Medium-density compound near the University of Zambia'),
    ('Kanyama',         150000, 'Highest-density compound on the western corridor'),
    ('Chawama',         90000,  'Southern Lusaka compound with significant waste challenges'),
    ('Mandevu',         70000,  'Eastern residential area with growing population'),
    ('Garden Compound', 45000,  'Central Lusaka residential zone'),
    ('Chipata Compound',55000,  'High-density area adjacent to Great East Road');

-- Seed reward catalog
INSERT INTO reward_catalog (title, description, points_cost, stock) VALUES
    ('Mobile Airtime ZMW 10',   'Redeemable for ZMW 10 airtime on any network',       100,  500),
    ('Shopping Voucher ZMW 25', 'Valid at partner supermarkets across Lusaka',          250,  200),
    ('Tree Seedling',           'Collect a free tree seedling from LCC nursery',         50, 1000),
    ('Community Champion Badge','Digital badge displayed on your profile',               25, NULL),
    ('Waste Bin (Home)',        'Free 120L household waste bin from LCC',              500,  100);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
