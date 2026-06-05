-- ============================================================================
-- SMART WASTE MANAGEMENT SYSTEM — LUSAKA CITY COUNCIL
-- MariaDB (XAMPP) Database Schema
-- ============================================================================
-- Compatible with: MariaDB 10.4+ (bundled with XAMPP)
-- Run via phpMyAdmin or: mysql -u root smart_waste_lusaka < DB.sql
--
-- Setup:
--   1. Open phpMyAdmin → New → database name: smart_waste_lusaka
--      Collation: utf8mb4_unicode_ci → Create
--   2. Select smart_waste_lusaka → Import → choose this file → Go
-- ============================================================================

-- Switch to the target database
USE smart_waste_lusaka;

-- Use strict mode to catch data issues early
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- ============================================================================
-- 2. USERS & AUTHENTICATION
-- ============================================================================
-- Note: MariaDB ENUM replaces PostgreSQL CREATE TYPE ... AS ENUM.
--       CHAR(36) stores UUID strings (e.g. 'a1b2c3d4-...').
--       DATETIME replaces TIMESTAMPTZ — MariaDB stores in UTC by default.
--       GEOMETRY columns replace PostGIS; spatial queries use Python Haversine.

CREATE TABLE IF NOT EXISTS zones (
    id              INT             NOT NULL AUTO_INCREMENT,
    name            VARCHAR(150)    NOT NULL,
    population_est  INT,
    description     TEXT,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_zones_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
    id              CHAR(36)        NOT NULL,
    email           VARCHAR(255)    NOT NULL,
    phone           VARCHAR(20),
    password_hash   VARCHAR(255)    NOT NULL,
    first_name      VARCHAR(100)    NOT NULL,
    last_name       VARCHAR(100)    NOT NULL,
    role            ENUM('resident','collector','admin') NOT NULL DEFAULT 'resident',
    profile_image   TEXT,
    compound        VARCHAR(150),
    latitude        DOUBLE,
    longitude       DOUBLE,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    is_verified     TINYINT(1)      NOT NULL DEFAULT 0,
    fcm_token       VARCHAR(512),
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_phone (phone),
    KEY idx_users_role     (role),
    KEY idx_users_compound (compound)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              CHAR(36)        NOT NULL,
    user_id         CHAR(36)        NOT NULL,
    token_hash      VARCHAR(512)    NOT NULL,
    device_info     VARCHAR(255),
    expires_at      DATETIME        NOT NULL,
    revoked         TINYINT(1)      NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_refresh_user (user_id),
    CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. SMART BINS & IoT SENSORS
-- ============================================================================

CREATE TABLE IF NOT EXISTS smart_bins (
    id              CHAR(36)        NOT NULL,
    label           VARCHAR(100)    NOT NULL,
    zone_id         INT,
    latitude        DOUBLE          NOT NULL DEFAULT 0,
    longitude       DOUBLE          NOT NULL DEFAULT 0,
    address         TEXT,
    capacity_liters DECIMAL(8,2)    NOT NULL DEFAULT 240,
    bin_type        VARCHAR(50)     NOT NULL DEFAULT 'general',
    status          ENUM('empty','low','medium','high','full','overflow','maintenance')
                                    NOT NULL DEFAULT 'empty',
    fill_percentage DECIMAL(5,2)    NOT NULL DEFAULT 0.00,
    last_emptied_at DATETIME,
    installed_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bins_zone   (zone_id),
    KEY idx_bins_status (status),
    CONSTRAINT fk_bins_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sensors (
    id              CHAR(36)        NOT NULL,
    bin_id          CHAR(36)        NOT NULL,
    sensor_type     VARCHAR(50)     NOT NULL DEFAULT 'ultrasonic',
    hardware_id     VARCHAR(100)    NOT NULL,
    firmware_ver    VARCHAR(20),
    battery_level   DECIMAL(5,2),
    status          ENUM('online','offline','low_battery','fault') NOT NULL DEFAULT 'online',
    last_ping_at    DATETIME,
    installed_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sensors_hardware (hardware_id),
    KEY idx_sensors_bin    (bin_id),
    KEY idx_sensors_status (status),
    CONSTRAINT fk_sensors_bin FOREIGN KEY (bin_id) REFERENCES smart_bins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sensor_readings (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    sensor_id       CHAR(36)        NOT NULL,
    bin_id          CHAR(36)        NOT NULL,
    fill_percentage DECIMAL(5,2)    NOT NULL,
    distance_cm     DECIMAL(8,2),
    temperature_c   DECIMAL(5,2),
    weight_kg       DECIMAL(8,2),
    battery_level   DECIMAL(5,2),
    recorded_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_readings_sensor (sensor_id, recorded_at),
    KEY idx_readings_bin    (bin_id,    recorded_at),
    CONSTRAINT fk_readings_sensor FOREIGN KEY (sensor_id) REFERENCES sensors(id)    ON DELETE CASCADE,
    CONSTRAINT fk_readings_bin    FOREIGN KEY (bin_id)    REFERENCES smart_bins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. CITIZEN REPORTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reports (
    id              CHAR(36)        NOT NULL,
    reporter_id     CHAR(36),
    category        ENUM('illegal_dumping','overflowing_bin','missed_collection','hazardous_waste','other')
                                    NOT NULL,
    description     TEXT            NOT NULL,
    latitude        DOUBLE          NOT NULL DEFAULT 0,
    longitude       DOUBLE          NOT NULL DEFAULT 0,
    address         TEXT,
    zone_id         INT,
    status          ENUM('pending','acknowledged','in_progress','resolved','rejected')
                                    NOT NULL DEFAULT 'pending',
    assigned_to     CHAR(36),
    resolved_at     DATETIME,
    resolution_note TEXT,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_reports_reporter (reporter_id),
    KEY idx_reports_status   (status),
    KEY idx_reports_zone     (zone_id),
    CONSTRAINT fk_reports_reporter  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_zone      FOREIGN KEY (zone_id)     REFERENCES zones(id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_assigned  FOREIGN KEY (assigned_to) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_images (
    id              CHAR(36)        NOT NULL,
    report_id       CHAR(36)        NOT NULL,
    image_url       TEXT            NOT NULL,
    caption         VARCHAR(255),
    uploaded_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_report_images_report (report_id),
    CONSTRAINT fk_rimages_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 6. VEHICLES & FLEET
-- ============================================================================

CREATE TABLE IF NOT EXISTS vehicles (
    id              CHAR(36)        NOT NULL,
    registration_no VARCHAR(20)     NOT NULL,
    vehicle_type    VARCHAR(50)     NOT NULL DEFAULT 'compactor',
    capacity_tons   DECIMAL(6,2)    NOT NULL,
    status          ENUM('available','on_route','maintenance','decommissioned')
                                    NOT NULL DEFAULT 'available',
    current_lat     DOUBLE,
    current_lng     DOUBLE,
    assigned_driver CHAR(36),
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_vehicles_reg (registration_no),
    KEY idx_vehicles_status (status),
    CONSTRAINT fk_vehicles_driver FOREIGN KEY (assigned_driver) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 7. COLLECTION ROUTES & SCHEDULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS collection_routes (
    id                  CHAR(36)    NOT NULL,
    name                VARCHAR(150) NOT NULL,
    zone_id             INT,
    vehicle_id          CHAR(36),
    driver_id           CHAR(36),
    status              ENUM('planned','in_progress','completed','cancelled')
                                    NOT NULL DEFAULT 'planned',
    scheduled_date      DATE        NOT NULL,
    start_time          DATETIME,
    end_time            DATETIME,
    total_distance_km   DECIMAL(8,2),
    notes               TEXT,
    created_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_routes_zone   (zone_id),
    KEY idx_routes_date   (scheduled_date),
    KEY idx_routes_status (status),
    CONSTRAINT fk_routes_zone    FOREIGN KEY (zone_id)    REFERENCES zones(id),
    CONSTRAINT fk_routes_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    CONSTRAINT fk_routes_driver  FOREIGN KEY (driver_id)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_stops (
    id              INT             NOT NULL AUTO_INCREMENT,
    route_id        CHAR(36)        NOT NULL,
    bin_id          CHAR(36)        NOT NULL,
    stop_order      INT             NOT NULL,
    visited         TINYINT(1)      NOT NULL DEFAULT 0,
    visited_at      DATETIME,
    fill_at_visit   DECIMAL(5,2),
    PRIMARY KEY (id),
    UNIQUE KEY uq_stops_route_order (route_id, stop_order),
    KEY idx_stops_route (route_id),
    CONSTRAINT fk_stops_route FOREIGN KEY (route_id) REFERENCES collection_routes(id) ON DELETE CASCADE,
    CONSTRAINT fk_stops_bin   FOREIGN KEY (bin_id)   REFERENCES smart_bins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 8. REWARDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reward_catalog (
    id              INT             NOT NULL AUTO_INCREMENT,
    title           VARCHAR(200)    NOT NULL,
    description     TEXT,
    points_cost     INT             NOT NULL,
    stock           INT,
    image_url       TEXT,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_rewards (
    id              CHAR(36)        NOT NULL,
    user_id         CHAR(36)        NOT NULL,
    total_points    INT             NOT NULL DEFAULT 0,
    lifetime_points INT             NOT NULL DEFAULT 0,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_rewards_user (user_id),
    CONSTRAINT fk_urewards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_transactions (
    id              CHAR(36)        NOT NULL,
    user_id         CHAR(36)        NOT NULL,
    action          ENUM('recycling_drop_off','report_verified','community_cleanup','referral','redemption')
                                    NOT NULL,
    points          INT             NOT NULL,
    reference_id    CHAR(36),
    description     TEXT,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_reward_tx_user (user_id, created_at),
    CONSTRAINT fk_rtx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 9. ALERTS & NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS alerts (
    id              CHAR(36)        NOT NULL,
    bin_id          CHAR(36),
    alert_type      ENUM('bin_full','bin_overflow','sensor_offline','maintenance_due','missed_collection')
                                    NOT NULL,
    severity        ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
    message         TEXT            NOT NULL,
    is_read         TINYINT(1)      NOT NULL DEFAULT 0,
    resolved        TINYINT(1)      NOT NULL DEFAULT 0,
    resolved_at     DATETIME,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_alerts_bin      (bin_id),
    KEY idx_alerts_resolved (resolved, created_at),
    CONSTRAINT fk_alerts_bin FOREIGN KEY (bin_id) REFERENCES smart_bins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_notifications (
    id              CHAR(36)        NOT NULL,
    user_id         CHAR(36)        NOT NULL,
    title           VARCHAR(255)    NOT NULL,
    body            TEXT            NOT NULL,
    is_read         TINYINT(1)      NOT NULL DEFAULT 0,
    link            TEXT,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notif_user (user_id, is_read, created_at),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 10. ANALYTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS waste_generation_logs (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    zone_id         INT             NOT NULL,
    log_date        DATE            NOT NULL,
    total_volume_l  DECIMAL(12,2),
    total_weight_kg DECIMAL(12,2),
    bins_emptied    INT,
    avg_fill_pct    DECIMAL(5,2),
    weather_temp_c  DECIMAL(5,2),
    weather_rain_mm DECIMAL(6,2),
    PRIMARY KEY (id),
    UNIQUE KEY uq_waste_zone_date (zone_id, log_date),
    KEY idx_waste_zone_date (zone_id, log_date),
    CONSTRAINT fk_wgl_zone FOREIGN KEY (zone_id) REFERENCES zones(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ml_models (
    id              INT             NOT NULL AUTO_INCREMENT,
    model_name      VARCHAR(150)    NOT NULL,
    version         VARCHAR(20)     NOT NULL,
    description     TEXT,
    accuracy        DECIMAL(5,4),
    model_path      TEXT            NOT NULL,
    trained_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active       TINYINT(1)      NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 11. AUDIT LOG
-- ============================================================================
-- Note: JSONB → JSON (MariaDB supports JSON natively from 10.2+).
--       INET → VARCHAR(45) covers both IPv4 and IPv6 addresses.

CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    user_id         CHAR(36),
    action          VARCHAR(100)    NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       CHAR(36),
    details         JSON,
    ip_address      VARCHAR(45),
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_user   (user_id, created_at),
    KEY idx_audit_entity (entity_type, entity_id),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 12. PICKUP SCHEDULES & DRIVER LOCATIONS
-- (ORM-managed tables that mirror the SQLAlchemy models)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pickup_schedules (
    id              CHAR(36)        NOT NULL,
    zone_id         INT,
    user_id         CHAR(36),
    scheduled_date  DATE            NOT NULL,
    scheduled_time  TIME,
    status          ENUM('pending','confirmed','completed','cancelled')
                                    NOT NULL DEFAULT 'pending',
    notes           TEXT,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_schedule_zone (zone_id),
    KEY idx_schedule_user (user_id),
    CONSTRAINT fk_sched_zone FOREIGN KEY (zone_id) REFERENCES zones(id),
    CONSTRAINT fk_sched_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_locations (
    id              CHAR(36)        NOT NULL,
    driver_id       CHAR(36)        NOT NULL,
    latitude        DOUBLE          NOT NULL,
    longitude       DOUBLE          NOT NULL,
    recorded_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_drvloc_driver (driver_id, recorded_at),
    CONSTRAINT fk_drvloc_driver FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 13. SEED DATA
-- ============================================================================

INSERT IGNORE INTO zones (name, population_est, description) VALUES
    ('Mtendere',        85000,  'High-density residential compound in eastern Lusaka'),
    ('George Compound', 120000, 'One of the largest informal settlements in Lusaka'),
    ('Kalingalinga',    60000,  'Medium-density compound near the University of Zambia'),
    ('Kanyama',         150000, 'Highest-density compound on the western corridor'),
    ('Chawama',         90000,  'Southern Lusaka compound with significant waste challenges'),
    ('Mandevu',         70000,  'Eastern residential area with growing population'),
    ('Garden Compound', 45000,  'Central Lusaka residential zone'),
    ('Chipata Compound',55000,  'High-density area adjacent to Great East Road');

INSERT IGNORE INTO reward_catalog (title, description, points_cost, stock) VALUES
    ('Mobile Airtime ZMW 10',   'Redeemable for ZMW 10 airtime on any network',      100,  500),
    ('Shopping Voucher ZMW 25', 'Valid at partner supermarkets across Lusaka',         250,  200),
    ('Tree Seedling',           'Collect a free tree seedling from LCC nursery',        50, 1000),
    ('Community Champion Badge','Digital badge displayed on your profile',              25, NULL),
    ('Waste Bin (Home)',        'Free 120L household waste bin from LCC',             500,  100);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
