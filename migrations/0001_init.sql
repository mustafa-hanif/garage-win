-- Garage Pro: initial schema.
-- Money is stored as integer fils (1 AED = 100 fils). Timestamps are ISO-8601 UTC text.

CREATE TABLE tenants (
  id            TEXT PRIMARY KEY,
  name_en       TEXT NOT NULL,
  name_ar       TEXT,
  trn           TEXT,                 -- UAE Tax Registration Number (15 digits)
  country       TEXT NOT NULL DEFAULT 'AE',
  currency      TEXT NOT NULL DEFAULT 'AED',
  vat_rate_bp   INTEGER NOT NULL DEFAULT 500, -- basis points, 500 = 5%
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE branches (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  name_en          TEXT NOT NULL,
  name_ar          TEXT,
  address_line     TEXT,
  city             TEXT,
  emirate          TEXT,              -- e.g. DXB, AUH, SHJ
  phone            TEXT,
  invoice_prefix   TEXT NOT NULL,     -- e.g. EXS1
  next_invoice_no  INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (tenant_id, invoice_prefix)
);

CREATE TABLE customers (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  phone           TEXT NOT NULL,       -- E.164, e.g. +971501234567
  email           TEXT,
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
  trn             TEXT,                -- set for VAT-registered business customers
  address_line    TEXT,
  city            TEXT,
  emirate         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX customers_tenant_name ON customers(tenant_id, name_en);

CREATE TABLE vehicles (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  plate_emirate TEXT NOT NULL,         -- DXB, AUH, SHJ, AJM, UAQ, RAK, FUJ
  plate_code    TEXT NOT NULL DEFAULT '', -- letter/number code on the plate
  plate_number  TEXT NOT NULL,
  make          TEXT,
  model         TEXT,
  year          INTEGER,
  vin           TEXT,
  color         TEXT,
  last_odometer INTEGER,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (tenant_id, plate_emirate, plate_code, plate_number)
);
CREATE INDEX vehicles_customer ON vehicles(customer_id);
CREATE INDEX vehicles_plate ON vehicles(tenant_id, plate_number);

CREATE TABLE odometer_readings (
  id          TEXT PRIMARY KEY,
  vehicle_id  TEXT NOT NULL REFERENCES vehicles(id),
  km          INTEGER NOT NULL,
  source      TEXT NOT NULL,           -- intake | service
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX odometer_vehicle ON odometer_readings(vehicle_id, recorded_at);

-- A service order is the record of work done on a car during one visit (a simple job card).
CREATE TABLE service_orders (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  branch_id    TEXT NOT NULL REFERENCES branches(id),
  customer_id  TEXT NOT NULL REFERENCES customers(id),
  vehicle_id   TEXT NOT NULL REFERENCES vehicles(id),
  odometer_in  INTEGER,
  complaint    TEXT,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','invoiced')),
  opened_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX service_orders_branch ON service_orders(branch_id, status, opened_at);
CREATE INDEX service_orders_vehicle ON service_orders(vehicle_id, opened_at);

CREATE TABLE service_lines (
  id               TEXT PRIMARY KEY,
  service_order_id TEXT NOT NULL REFERENCES service_orders(id),
  kind             TEXT NOT NULL CHECK (kind IN ('labour','part')),
  description      TEXT NOT NULL,
  quantity_milli   INTEGER NOT NULL CHECK (quantity_milli > 0), -- quantity x 1000
  unit_price_fils  INTEGER NOT NULL CHECK (unit_price_fils >= 0),
  discount_fils    INTEGER NOT NULL DEFAULT 0 CHECK (discount_fils >= 0),
  net_fils         INTEGER NOT NULL,   -- round(qty * unit) - discount
  vat_rate_bp      INTEGER NOT NULL,
  vat_fils         INTEGER NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX service_lines_order ON service_lines(service_order_id, sort_order);

-- Tax invoices. Rows are snapshots: supplier and customer details are copied in,
-- and triggers below forbid any update or delete once posted.
CREATE TABLE invoices (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id),
  branch_id          TEXT NOT NULL REFERENCES branches(id),
  service_order_id   TEXT NOT NULL UNIQUE REFERENCES service_orders(id),
  invoice_number     TEXT NOT NULL,
  sequence_no        INTEGER NOT NULL,
  issue_date         TEXT NOT NULL,     -- YYYY-MM-DD (Asia/Dubai)
  issued_at          TEXT NOT NULL,
  currency           TEXT NOT NULL,
  supplier_name_en   TEXT NOT NULL,
  supplier_name_ar   TEXT,
  supplier_trn       TEXT,
  supplier_address   TEXT,
  branch_name_en     TEXT NOT NULL,
  branch_name_ar     TEXT,
  customer_id        TEXT NOT NULL,
  customer_name_en   TEXT NOT NULL,
  customer_name_ar   TEXT,
  customer_phone     TEXT,
  customer_trn       TEXT,
  customer_address   TEXT,
  vehicle_desc       TEXT NOT NULL,
  odometer           INTEGER,
  subtotal_fils      INTEGER NOT NULL,  -- sum of net line amounts (taxable amount)
  vat_fils           INTEGER NOT NULL,
  total_fils         INTEGER NOT NULL,
  UNIQUE (branch_id, sequence_no),
  UNIQUE (tenant_id, invoice_number)
);
CREATE INDEX invoices_branch_date ON invoices(branch_id, issue_date);

CREATE TABLE invoice_lines (
  id               TEXT PRIMARY KEY,
  invoice_id       TEXT NOT NULL REFERENCES invoices(id),
  line_no          INTEGER NOT NULL,
  kind             TEXT NOT NULL,
  description      TEXT NOT NULL,
  quantity_milli   INTEGER NOT NULL,
  unit_price_fils  INTEGER NOT NULL,
  discount_fils    INTEGER NOT NULL,
  net_fils         INTEGER NOT NULL,
  vat_rate_bp      INTEGER NOT NULL,
  vat_fils         INTEGER NOT NULL,
  UNIQUE (invoice_id, line_no)
);

CREATE TRIGGER invoices_no_update BEFORE UPDATE ON invoices
BEGIN SELECT RAISE(ABORT, 'posted invoices cannot be changed; issue a credit note'); END;
CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices
BEGIN SELECT RAISE(ABORT, 'posted invoices cannot be deleted; issue a credit note'); END;
CREATE TRIGGER invoice_lines_no_update BEFORE UPDATE ON invoice_lines
BEGIN SELECT RAISE(ABORT, 'posted invoice lines cannot be changed'); END;
CREATE TRIGGER invoice_lines_no_delete BEFORE DELETE ON invoice_lines
BEGIN SELECT RAISE(ABORT, 'posted invoice lines cannot be deleted'); END;

-- Lines of an invoiced service order are frozen too.
CREATE TRIGGER service_lines_frozen_insert BEFORE INSERT ON service_lines
WHEN (SELECT status FROM service_orders WHERE id = NEW.service_order_id) <> 'open'
BEGIN SELECT RAISE(ABORT, 'service order is already invoiced'); END;
CREATE TRIGGER service_lines_frozen_update BEFORE UPDATE ON service_lines
WHEN (SELECT status FROM service_orders WHERE id = OLD.service_order_id) <> 'open'
BEGIN SELECT RAISE(ABORT, 'service order is already invoiced'); END;
CREATE TRIGGER service_lines_frozen_delete BEFORE DELETE ON service_lines
WHEN (SELECT status FROM service_orders WHERE id = OLD.service_order_id) <> 'open'
BEGIN SELECT RAISE(ABORT, 'service order is already invoiced'); END;
