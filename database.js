const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'unit777.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
// Enable foreign keys
db.pragma('foreign_keys = ON');

// ─── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'New Project',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS date_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    project_id INTEGER,
    work_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_group_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'New Point',
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (date_group_id) REFERENCES date_groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    point_id INTEGER NOT NULL,
    unit_type TEXT NOT NULL DEFAULT 'UNIT805'
      CHECK(unit_type IN ('UNIT805','UNIT806','UNIT807','UNIT808','UNIT813','UNIT838','96 LCP Placement','288 LCP Placement')),
    quantity INTEGER NOT NULL DEFAULT 1
      CHECK(quantity BETWEEN 1 AND 199),
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE
  );
`);

// ─── Migrations ────────────────────────────────────────────────────────────────

try { db.exec(`ALTER TABLE date_groups ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE`); } catch (e) {}
try { db.exec(`ALTER TABLE points ADD COLUMN feet_in INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE points ADD COLUMN feet_out INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE points ADD COLUMN note TEXT DEFAULT ''`); } catch (e) {}

// Migration: expand unit_type CHECK constraint for new unit types
(function() {
  try {
    db.exec("SAVEPOINT _chk");
    try {
      db.prepare("INSERT INTO units (point_id, unit_type, quantity) VALUES (-1, 'UNIT806', 1)").run();
      db.exec("ROLLBACK TO _chk"); db.exec("RELEASE _chk");
      return;
    } catch(e) {
      db.exec("ROLLBACK TO _chk"); db.exec("RELEASE _chk");
    }
    db.transaction(() => {
      db.exec("ALTER TABLE units RENAME TO _units_old");
      db.exec(`CREATE TABLE units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        point_id INTEGER NOT NULL,
        unit_type TEXT NOT NULL DEFAULT 'UNIT805'
          CHECK(unit_type IN ('UNIT805','UNIT806','UNIT807','UNIT808','UNIT813','UNIT838','96 LCP Placement','288 LCP Placement')),
        quantity INTEGER NOT NULL DEFAULT 1
          CHECK(quantity BETWEEN 1 AND 199),
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE
      )`);
      db.exec("INSERT INTO units SELECT * FROM _units_old");
      db.exec("DROP TABLE _units_old");
    })();
  } catch(e) { console.error('Unit types migration:', e.message); }
})();

// ─── Prepared Statements ───────────────────────────────────────────────────────

// Users
const createUser = db.prepare(
  'INSERT INTO users (username, password_hash) VALUES (?, ?)'
);
const getUserByUsername = db.prepare(
  'SELECT * FROM users WHERE username = ?'
);

// Projects
const getProjects = db.prepare(`
  SELECT p.*, COALESCE(pc.cnt, 0) as point_count
  FROM projects p
  LEFT JOIN (
    SELECT dg.project_id, COUNT(pt.id) as cnt
    FROM date_groups dg JOIN points pt ON pt.date_group_id = dg.id
    GROUP BY dg.project_id
  ) pc ON pc.project_id = p.id
  WHERE p.user_id = ?
  ORDER BY p.sort_order, p.id
`);
const createProject = db.prepare(
  'INSERT INTO projects (user_id, name) VALUES (?, ?)'
);
const updateProject = db.prepare(
  'UPDATE projects SET name = ? WHERE id = ? AND user_id = ?'
);
const deleteProject = db.prepare(
  'DELETE FROM projects WHERE id = ? AND user_id = ?'
);

// Date Groups
const getDateGroupsByProject = db.prepare(
  'SELECT * FROM date_groups WHERE user_id = ? AND project_id = ? ORDER BY work_date DESC, id DESC'
);
const getDateGroups = db.prepare(
  'SELECT * FROM date_groups WHERE user_id = ? ORDER BY work_date DESC, id DESC'
);
const createDateGroup = db.prepare(
  'INSERT INTO date_groups (user_id, project_id, work_date) VALUES (?, ?, ?)'
);
const updateDateGroup = db.prepare(
  'UPDATE date_groups SET work_date = ? WHERE id = ? AND user_id = ?'
);
const deleteDateGroup = db.prepare(
  'DELETE FROM date_groups WHERE id = ? AND user_id = ?'
);
const getDateGroupOwner = db.prepare(
  'SELECT user_id FROM date_groups WHERE id = ?'
);

// Points
const getPointsByDateGroup = db.prepare(
  'SELECT * FROM points WHERE date_group_id = ? ORDER BY sort_order, id'
);
const createPoint = db.prepare(
  'INSERT INTO points (date_group_id, name) VALUES (?, ?)'
);
const updatePoint = db.prepare(
  'UPDATE points SET name = ? WHERE id = ?'
);
const updatePointFeet = db.prepare(
  'UPDATE points SET feet_in = ?, feet_out = ? WHERE id = ?'
);
const updatePointNote = db.prepare(
  'UPDATE points SET note = ? WHERE id = ?'
);
const deletePoint = db.prepare(
  'DELETE FROM points WHERE id = ?'
);
const getPointOwner = db.prepare(`
  SELECT dg.user_id FROM points p
  JOIN date_groups dg ON p.date_group_id = dg.id
  WHERE p.id = ?
`);

// Autocomplete: distinct point names for a user
const getDistinctPointNames = db.prepare(`
  SELECT DISTINCT p.name FROM points p
  JOIN date_groups dg ON p.date_group_id = dg.id
  WHERE dg.user_id = ? AND p.name != 'New Point'
  ORDER BY p.name
`);

// Units
const getUnitsByPoint = db.prepare(
  'SELECT * FROM units WHERE point_id = ? ORDER BY sort_order, id'
);
const getUnitCountByPoint = db.prepare(
  'SELECT COUNT(*) as count FROM units WHERE point_id = ?'
);
const createUnit = db.prepare(
  'INSERT INTO units (point_id, unit_type, quantity) VALUES (?, ?, ?)'
);
const updateUnit = db.prepare(
  'UPDATE units SET unit_type = ?, quantity = ? WHERE id = ?'
);
const deleteUnit = db.prepare(
  'DELETE FROM units WHERE id = ?'
);
const getUnitOwner = db.prepare(`
  SELECT dg.user_id FROM units u
  JOIN points p ON u.point_id = p.id
  JOIN date_groups dg ON p.date_group_id = dg.id
  WHERE u.id = ?
`);

// ─── Stats Queries ─────────────────────────────────────────────────────────────

const getMonthlyStats = db.prepare(`
  SELECT
    strftime('%Y-%m', dg.work_date) as period,
    COUNT(DISTINCT dg.id) as days,
    COUNT(DISTINCT pt.id) as points,
    COALESCE(SUM(u.quantity * CASE u.unit_type
      WHEN 'UNIT805' THEN 42.19 WHEN 'UNIT806' THEN 45.56
      WHEN 'UNIT807' THEN 64.12 WHEN 'UNIT808' THEN 27.00
      WHEN 'UNIT813' THEN 9.11  WHEN 'UNIT838' THEN 37.12
      WHEN '96 LCP Placement' THEN 135.00 WHEN '288 LCP Placement' THEN 135.00
      ELSE 0 END), 0) as total
  FROM date_groups dg
  JOIN points pt ON pt.date_group_id = dg.id
  LEFT JOIN units u ON u.point_id = pt.id
  WHERE dg.user_id = ?
  GROUP BY period ORDER BY period DESC LIMIT 12
`);

const getWeeklyStats = db.prepare(`
  SELECT
    strftime('%Y-W%W', dg.work_date) as period,
    MIN(dg.work_date) as week_start,
    MAX(dg.work_date) as week_end,
    COUNT(DISTINCT dg.id) as days,
    COUNT(DISTINCT pt.id) as points,
    COALESCE(SUM(u.quantity * CASE u.unit_type
      WHEN 'UNIT805' THEN 42.19 WHEN 'UNIT806' THEN 45.56
      WHEN 'UNIT807' THEN 64.12 WHEN 'UNIT808' THEN 27.00
      WHEN 'UNIT813' THEN 9.11  WHEN 'UNIT838' THEN 37.12
      WHEN '96 LCP Placement' THEN 135.00 WHEN '288 LCP Placement' THEN 135.00
      ELSE 0 END), 0) as total
  FROM date_groups dg
  JOIN points pt ON pt.date_group_id = dg.id
  LEFT JOIN units u ON u.point_id = pt.id
  WHERE dg.user_id = ?
  GROUP BY period ORDER BY period DESC LIMIT 12
`);

// ─── Composite Query: Full data tree for a project ─────────────────────────────

function getFullDataByProject(userId, projectId) {
  const dateGroupsList = getDateGroupsByProject.all(userId, projectId);
  return dateGroupsList.map(dg => {
    const points = getPointsByDateGroup.all(dg.id).map(pt => {
      const units = getUnitsByPoint.all(pt.id);
      return { ...pt, units };
    });
    return { ...dg, points };
  });
}

// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  db,
  createUser,
  getUserByUsername,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getDateGroups,
  getDateGroupsByProject,
  createDateGroup,
  updateDateGroup,
  deleteDateGroup,
  getDateGroupOwner,
  getPointsByDateGroup,
  createPoint,
  updatePoint,
  deletePoint,
  getPointOwner,
  updatePointFeet,
  getDistinctPointNames,
  updatePointNote,
  getUnitsByPoint,
  getUnitCountByPoint,
  createUnit,
  updateUnit,
  deleteUnit,
  getUnitOwner,
  getFullDataByProject,
  getMonthlyStats,
  getWeeklyStats,
};
