/**
 * Database Initialization Script
 * 
 * Run with: npm run db:init
 * 
 * This script manually triggers database initialization:
 * - Creates data directory if not exists
 * - Creates SQLite database file
 * - Creates all required tables
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database path
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'ai-service.sqlite');

console.log('=== AI Service Database Initialization ===\n');
console.log(`Database path: ${DB_PATH}`);

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Created directory: ${dbDir}`);
} else {
  console.log(`Directory exists: ${dbDir}`);
}

// Check if database already exists
const dbExists = fs.existsSync(DB_PATH);

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  -- Model providers table
  CREATE TABLE IF NOT EXISTS model_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    base_url TEXT,
    supported_models TEXT,
    requires_api_key INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- User API keys table
  CREATE TABLE IF NOT EXISTS user_api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    api_key TEXT NOT NULL,
    base_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES model_providers(id),
    UNIQUE(user_id, provider_id)
  );

  -- User model preferences table
  CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    default_provider_id TEXT,
    default_model TEXT,
    temperature REAL DEFAULT 0.7,
    top_p REAL DEFAULT 0.9,
    max_tokens INTEGER DEFAULT 2048,
    custom_prompt TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (default_provider_id) REFERENCES model_providers(id)
  );

  -- Chat history table
  CREATE TABLE IF NOT EXISTS chat_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    provider_id TEXT,
    model TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Show results
if (dbExists) {
  console.log(`Database already existed, tables ensured.`);
} else {
  console.log(`Database created successfully!`);
}

// List tables
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[];
console.log(`\nTables in database:`);
tables.forEach((t, i) => {
  const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${t.name}`).get() as { cnt: number };
  console.log(`  ${i + 1}. ${t.name} (${count.cnt} rows)`);
});

db.close();

console.log('\n=== Initialization complete ===');
