-- Schema initialization for fsi-kasse
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(31) NOT NULL UNIQUE,
  name VARCHAR(127) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  description TEXT
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  PRIMARY KEY (role_id, permission_key),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id BIGINT UNSIGNED NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  PRIMARY KEY (user_id, permission_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY (token_hash)
);

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  accounting_event_id BIGINT UNSIGNED NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  fachschaft_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  deposit DECIMAL(10,2),
  image VARCHAR(255),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stands (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stand_items (
  stand_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (stand_id, item_id),
  INDEX idx_stand_items_item (item_id),
  FOREIGN KEY (stand_id) REFERENCES stands(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS affiliations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guest_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  access_level ENUM('use', 'manage') NOT NULL DEFAULT 'use',
  affiliation_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliation_id) REFERENCES affiliations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS guest_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guest_user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  FOREIGN KEY (guest_user_id) REFERENCES guest_users(id) ON DELETE CASCADE,
  UNIQUE KEY (token_hash)
);

CREATE TABLE IF NOT EXISTS cashiers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  accounting_member_id BIGINT UNSIGNED NULL UNIQUE,
  image VARCHAR(255),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_guest TINYINT(1) NOT NULL DEFAULT 0,
  affiliation_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cashiers_affiliation FOREIGN KEY (affiliation_id) REFERENCES affiliations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cashier_id BIGINT UNSIGNED NOT NULL,
  fachschaft TINYINT(1) NOT NULL DEFAULT 0,
  event_id BIGINT UNSIGNED NOT NULL,
  stand_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_uuid CHAR(36) NULL,
  UNIQUE KEY uq_orders_client_uuid (client_uuid),
  INDEX idx_orders_event_stand (event_id, stand_id),
  FOREIGN KEY (cashier_id) REFERENCES cashiers(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_stand FOREIGN KEY (stand_id) REFERENCES stands(id)
);

CREATE TABLE IF NOT EXISTS item_groups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_group_items (
  group_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (group_id, item_id),
  INDEX idx_item_group_items_item (item_id),
  FOREIGN KEY (group_id) REFERENCES item_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS voucher_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  kind ENUM('paid', 'free') NOT NULL,
  item_group_id BIGINT UNSIGNED NOT NULL,
  units_per_voucher INT NOT NULL,
  sale_price DECIMAL(10,2) NULL,
  includes_deposit TINYINT(1) NOT NULL DEFAULT 0,
  event_id BIGINT UNSIGNED NULL,
  valid_until DATETIME NULL,
  note TEXT NULL,
  pdf_layout LONGTEXT NULL,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_group_id) REFERENCES item_groups(id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vouchers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT UNSIGNED NOT NULL,
  code CHAR(11) NOT NULL,
  status ENUM('unsold', 'active', 'revoked') NOT NULL,
  units_total INT NOT NULL,
  units_remaining INT NOT NULL,
  sold_order_id BIGINT UNSIGNED NULL,
  sold_at TIMESTAMP NULL,
  revoked_at TIMESTAMP NULL,
  revoked_by VARCHAR(255) NULL,
  revoke_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vouchers_code (code),
  INDEX idx_vouchers_batch (batch_id, status),
  FOREIGN KEY (batch_id) REFERENCES voucher_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (sold_order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT chk_vouchers_units CHECK (units_remaining >= 0 AND units_remaining <= units_total)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  unit_deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  line_kind ENUM('item', 'voucher_redemption', 'voucher_sale') NOT NULL DEFAULT 'item',
  voucher_id BIGINT UNSIGNED NULL,
  voucher_covers_deposit TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_order_items_voucher (voucher_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  CONSTRAINT fk_order_items_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
);

CREATE TABLE IF NOT EXISTS item_price_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  changed_by VARCHAR(255) NULL,
  valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_item_price_history_item (item_id, valid_from),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(127) NOT NULL PRIMARY KEY,
  setting_value TEXT NULL
);

CREATE TABLE IF NOT EXISTS app_settings_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(127) NOT NULL,
  setting_value TEXT NULL,
  changed_by VARCHAR(255) NULL,
  valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_app_settings_history_key (setting_key, valid_from)
);

CREATE TABLE IF NOT EXISTS fachschaft_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id BIGINT UNSIGNED NOT NULL,
  cashier_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_uuid CHAR(36) NULL,
  UNIQUE KEY uq_fachschaft_payments_client_uuid (client_uuid),
  FOREIGN KEY (member_id) REFERENCES cashiers(id),
  FOREIGN KEY (cashier_id) REFERENCES cashiers(id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS donations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  cashier_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  stand_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_uuid CHAR(36) NULL,
  UNIQUE KEY uq_donations_client_uuid (client_uuid),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (cashier_id) REFERENCES cashiers(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_donations_stand FOREIGN KEY (stand_id) REFERENCES stands(id)
);

CREATE TABLE IF NOT EXISTS order_change_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  order_client_uuid CHAR(36) NULL,
  cashier_id BIGINT UNSIGNED NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  reason TEXT NULL,
  original_fachschaft TINYINT(1) NOT NULL DEFAULT 0,
  proposed_fachschaft TINYINT(1) NOT NULL DEFAULT 0,
  requested_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(255) NULL,
  reviewed_at TIMESTAMP NULL,
  review_note TEXT NULL,
  INDEX idx_order_change_requests_order (order_id, status),
  INDEX idx_order_change_requests_status (status, created_at),
  INDEX idx_order_change_requests_event (event_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (cashier_id) REFERENCES cashiers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_change_request_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  version ENUM('original', 'proposed') NOT NULL,
  order_item_id BIGINT UNSIGNED NULL,
  item_id BIGINT UNSIGNED NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  unit_deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  line_kind ENUM('item', 'voucher_redemption', 'voucher_sale') NOT NULL DEFAULT 'item',
  voucher_id BIGINT UNSIGNED NULL,
  voucher_covers_deposit TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_order_change_request_lines_request (request_id, version),
  FOREIGN KEY (request_id) REFERENCES order_change_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  CONSTRAINT fk_order_change_request_lines_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL
);
