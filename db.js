
import Database from "better-sqlite3";
import fs from "fs";
const db = new Database("./data/app.db");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'user',
    org_id INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id=1),
    business_name TEXT,
    tin TEXT,
    address TEXT,
    surcharge_rate REAL DEFAULT 0.25,
    interest_rate_annual REAL DEFAULT 0.20,
    compromise_min REAL DEFAULT 0.00
  );
  INSERT OR IGNORE INTO settings (id,business_name,tin,address) VALUES (1,'Demo Biz','123-456-789-000','Metro Manila');

  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tin TEXT
  );
  INSERT OR IGNORE INTO organizations(id,name,tin) VALUES (1,'Default Org','123-456-789-000');

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER DEFAULT 1,
    date TEXT,               -- YYYY-MM-DD
    type TEXT,               -- 'sale' | 'expense'
    particulars TEXT,
    amount REAL
  );

  CREATE TABLE IF NOT EXISTS credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER DEFAULT 1,
    date TEXT,
    type TEXT,               -- 'withholding' | 'quarterly' | etc.
    particulars TEXT,
    amount REAL
  );
`);

export default db;
