/**
 * Simple Database Admin API
 * 
 * Provides basic SQLite administration endpoints:
 * - GET  /db-admin/tables        - List all tables
 * - GET  /db-admin/tables/:name  - Get table schema and data
 * - POST /db-admin/query         - Execute SQL query
 */

import { Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';

// Get database instance
function getDb(): Database.Database {
  const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'ai-service.sqlite');
  return new Database(DB_PATH, { readonly: false });
}

/**
 * List all tables in the database
 */
export async function listTablesHandler(req: Request, res: Response): Promise<void> {
  try {
    const db = getDb();
    const tables = db.prepare(`
      SELECT name, sql FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as { name: string; sql: string }[];

    const result = tables.map(t => {
      const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as { cnt: number };
      return {
        name: t.name,
        rowCount: count.cnt,
        sql: t.sql
      };
    });

    db.close();
    res.json({ success: true, tables: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get table schema and data
 */
export async function getTableHandler(req: Request, res: Response): Promise<void> {
  try {
    const { name } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const db = getDb();

    // Get table info
    const columns = db.prepare(`PRAGMA table_info("${name}")`).all();
    
    // Get row count
    const countResult = db.prepare(`SELECT COUNT(*) as cnt FROM "${name}"`).get() as { cnt: number };
    
    // Get data with pagination
    const rows = db.prepare(`SELECT * FROM "${name}" LIMIT ? OFFSET ?`).all(limit, offset);

    db.close();

    res.json({
      success: true,
      table: {
        name,
        columns,
        totalRows: countResult.cnt,
        limit,
        offset,
        rows
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Execute SQL query
 */
export async function executeQueryHandler(req: Request, res: Response): Promise<void> {
  try {
    const { sql } = req.body;

    if (!sql || typeof sql !== 'string') {
      res.status(400).json({ success: false, error: 'SQL query is required' });
      return;
    }

    const db = getDb();
    const trimmedSql = sql.trim().toUpperCase();

    let result: any;
    let changes = 0;

    // Determine if it's a SELECT or modifying query
    if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
      result = db.prepare(sql).all();
    } else {
      // INSERT, UPDATE, DELETE, etc.
      const info = db.prepare(sql).run();
      changes = info.changes;
      result = { changes, lastInsertRowid: info.lastInsertRowid };
    }

    db.close();

    res.json({
      success: true,
      sql,
      result,
      changes,
      rowCount: Array.isArray(result) ? result.length : undefined
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Serve a simple HTML admin page
 */
export async function adminPageHandler(req: Request, res: Response): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SQLite Admin - AI Service</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    h1 { color: #333; margin-bottom: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .card h2 { margin-top: 0; color: #555; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f9f9f9; font-weight: 600; }
    tr:hover { background: #f5f5f5; }
    .btn { background: #4a90d9; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .btn:hover { background: #357abd; }
    .btn-sm { padding: 4px 8px; font-size: 12px; }
    .btn-danger { background: #d9534f; }
    .btn-danger:hover { background: #c9302c; }
    textarea { width: 100%; height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; font-size: 14px; resize: vertical; }
    #result { margin-top: 15px; max-height: 400px; overflow: auto; }
    .success { color: #5cb85c; }
    .error { color: #d9534f; }
    .tables-list { display: flex; flex-wrap: wrap; gap: 10px; }
    .table-item { background: #f0f0f0; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
    .table-item:hover { background: #e0e0e0; }
    .table-item .count { color: #888; font-size: 12px; margin-left: 5px; }
    pre { background: #f9f9f9; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>SQLite Admin - AI Service</h1>
    
    <div class="card">
      <h2>Tables</h2>
      <div id="tables" class="tables-list">Loading...</div>
    </div>
    
    <div class="card">
      <h2>SQL Query</h2>
      <textarea id="sql" placeholder="Enter SQL query...">SELECT * FROM user_api_keys LIMIT 10;</textarea>
      <div style="margin-top: 10px;">
        <button class="btn" onclick="executeQuery()">Execute</button>
        <span id="status" style="margin-left: 10px;"></span>
      </div>
      <div id="result"></div>
    </div>
    
    <div class="card" id="tableData" style="display: none;">
      <h2>Table: <span id="tableName"></span></h2>
      <div id="tableContent"></div>
    </div>
  </div>
  
  <script>
    const API = '/db-admin';
    
    async function loadTables() {
      try {
        const res = await fetch(API + '/tables');
        const data = await res.json();
        if (data.success) {
          document.getElementById('tables').innerHTML = data.tables.map(t => 
            '<div class="table-item" onclick="loadTable(\\'' + t.name + '\\')">' + 
            t.name + '<span class="count">(' + t.rowCount + ')</span></div>'
          ).join('');
        }
      } catch (e) {
        document.getElementById('tables').innerHTML = '<span class="error">Error loading tables</span>';
      }
    }
    
    async function loadTable(name) {
      try {
        const res = await fetch(API + '/tables/' + name);
        const data = await res.json();
        if (data.success) {
          const t = data.table;
          document.getElementById('tableName').textContent = t.name + ' (' + t.totalRows + ' rows)';
          
          let html = '<table><tr>';
          t.columns.forEach(c => { html += '<th>' + c.name + '</th>'; });
          html += '</tr>';
          t.rows.forEach(row => {
            html += '<tr>';
            t.columns.forEach(c => { 
              const val = row[c.name];
              html += '<td>' + (val === null ? '<i style="color:#999">NULL</i>' : escapeHtml(String(val).substring(0, 100))) + '</td>'; 
            });
            html += '</tr>';
          });
          html += '</table>';
          if (t.totalRows > t.rows.length) {
            html += '<p style="color:#888;font-size:12px;">Showing ' + t.rows.length + ' of ' + t.totalRows + ' rows</p>';
          }
          
          document.getElementById('tableContent').innerHTML = html;
          document.getElementById('tableData').style.display = 'block';
        }
      } catch (e) {
        alert('Error loading table: ' + e.message);
      }
    }
    
    async function executeQuery() {
      const sql = document.getElementById('sql').value;
      const status = document.getElementById('status');
      const result = document.getElementById('result');
      
      status.innerHTML = 'Executing...';
      result.innerHTML = '';
      
      try {
        const res = await fetch(API + '/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql })
        });
        const data = await res.json();
        
        if (data.success) {
          status.innerHTML = '<span class="success">Success</span>';
          
          if (Array.isArray(data.result) && data.result.length > 0) {
            const cols = Object.keys(data.result[0]);
            let html = '<table><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr>';
            data.result.forEach(row => {
              html += '<tr>' + cols.map(c => '<td>' + escapeHtml(String(row[c] ?? '')) + '</td>').join('') + '</tr>';
            });
            html += '</table>';
            html += '<p style="color:#888;font-size:12px;">' + data.rowCount + ' rows</p>';
            result.innerHTML = html;
          } else if (data.changes !== undefined) {
            result.innerHTML = '<p class="success">' + data.changes + ' row(s) affected</p>';
          } else {
            result.innerHTML = '<pre>' + JSON.stringify(data.result, null, 2) + '</pre>';
          }
          loadTables();
        } else {
          status.innerHTML = '<span class="error">Error</span>';
          result.innerHTML = '<pre class="error">' + data.error + '</pre>';
        }
      } catch (e) {
        status.innerHTML = '<span class="error">Error</span>';
        result.innerHTML = '<pre class="error">' + e.message + '</pre>';
      }
    }
    
    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    loadTables();
  </script>
</body>
</html>`;
  
  res.type('html').send(html);
}
