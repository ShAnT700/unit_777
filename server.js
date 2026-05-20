const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'unit777-secret-key-change-in-production';

// ─── Middleware ─────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Auth Routes ────────────────────────────────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db.getUserByUsername.get(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.createUser.run(username, hash);
    const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ token, username });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = db.getUserByUsername.get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Project Routes ─────────────────────────────────────────────────────────────

app.get('/api/projects', authMiddleware, (req, res) => {
  try {
    const projects = db.getProjects.all(req.userId);
    res.json(projects);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/projects', authMiddleware, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    const result = db.createProject.run(req.userId, name.trim());
    res.status(201).json({
      id: result.lastInsertRowid,
      user_id: req.userId,
      name: name.trim(),
    });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/projects/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    const result = db.updateProject.run(name.trim(), id, req.userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/projects/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const result = db.deleteProject.run(id, req.userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Date Group Routes ─────────────────────────────────────────────────────────

app.get('/api/projects/:projectId/date-groups', authMiddleware, (req, res) => {
  try {
    const { projectId } = req.params;
    const data = db.getFullDataByProject(req.userId, Number(projectId));
    res.json(data);
  } catch (err) {
    console.error('Get date groups error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/date-groups', authMiddleware, (req, res) => {
  try {
    const { work_date, project_id } = req.body;
    if (!work_date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    if (!project_id) {
      return res.status(400).json({ error: 'Project is required' });
    }
    const result = db.createDateGroup.run(req.userId, project_id, work_date);
    res.status(201).json({
      id: result.lastInsertRowid,
      user_id: req.userId,
      project_id,
      work_date,
      points: [],
    });
  } catch (err) {
    console.error('Create date group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/date-groups/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { work_date } = req.body;
    if (!work_date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    const result = db.updateDateGroup.run(work_date, id, req.userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Date group not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update date group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/date-groups/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const result = db.deleteDateGroup.run(id, req.userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Date group not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete date group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Point Routes ───────────────────────────────────────────────────────────────

app.post('/api/date-groups/:id/points', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Verify ownership
    const owner = db.getDateGroupOwner.get(id);
    if (!owner || owner.user_id !== req.userId) {
      return res.status(404).json({ error: 'Date group not found' });
    }

    const result = db.createPoint.run(id, name || 'New Point');
    res.status(201).json({
      id: result.lastInsertRowid,
      date_group_id: Number(id),
      name: name || 'New Point',
      feet_in: 0, feet_out: 0,
      note: '',
      units: [],
    });
  } catch (err) {
    console.error('Create point error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/points/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const owner = db.getPointOwner.get(id);
    if (!owner || owner.user_id !== req.userId) {
      return res.status(404).json({ error: 'Point not found' });
    }

    db.updatePoint.run(name, id);
    res.json({ success: true });
  } catch (err) {
    console.error('Update point error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/points/:id/feet', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { feet_in, feet_out } = req.body;

    const owner = db.getPointOwner.get(id);
    if (!owner || owner.user_id !== req.userId) {
      return res.status(404).json({ error: 'Point not found' });
    }

    const fIn = Math.max(0, Math.min(99999, parseInt(feet_in) || 0));
    const fOut = Math.max(0, Math.min(99999, parseInt(feet_out) || 0));
    db.updatePointFeet.run(fIn, fOut, id);
    res.json({ success: true });
  } catch (err) {
    console.error('Update point feet error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/points/:id/note', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const owner = db.getPointOwner.get(id);
    if (!owner || owner.user_id !== req.userId) {
      return res.status(404).json({ error: 'Point not found' });
    }

    const trimmed = (note || '').slice(0, 300);
    db.updatePointNote.run(trimmed, id);
    res.json({ success: true });
  } catch (err) {
    console.error('Update point note error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/points/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const owner = db.getPointOwner.get(id);
    if (!owner || owner.user_id !== req.userId) {
      return res.status(404).json({ error: 'Point not found' });
    }

    db.deletePoint.run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete point error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Point Name Autocomplete ────────────────────────────────────────────────────

app.get('/api/point-names', authMiddleware, (req, res) => {
  try {
    const names = db.getDistinctPointNames.all(req.userId).map(r => r.name);
    res.json(names);
  } catch (err) {
    console.error('Get point names error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Unit Routes ────────────────────────────────────────────────────────────────

app.post('/api/points/:id/units', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { unit_type, quantity } = req.body;

    // Verify ownership
    const owner = db.getPointOwner.get(id);
    if (!owner || owner.user_id !== req.userId) {
      return res.status(404).json({ error: 'Point not found' });
    }

    // Check limit of 5 units per point
    const count = db.getUnitCountByPoint.get(id);
    if (count.count >= 5) {
      return res.status(400).json({ error: 'Maximum 5 units per point' });
    }

    const type = unit_type || 'UNIT805';
    const qty = quantity || 1;
    const result = db.createUnit.run(id, type, qty);
    res.status(201).json({
      id: result.lastInsertRowid,
      point_id: Number(id),
      unit_type: type,
      quantity: qty,
    });
  } catch (err) {
    console.error('Create unit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/units/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { unit_type, quantity } = req.body;

    // Verify ownership
    const owner = db.getUnitOwner.get(id);
    if (!owner || owner.user_id !== req.userId) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    if (!['UNIT805', 'UNIT806', 'UNIT807', 'UNIT808', 'UNIT813', 'UNIT838', '96 LCP Placement', '288 LCP Placement'].includes(unit_type)) {
      return res.status(400).json({ error: 'Invalid unit type' });
    }
    if (!quantity || quantity < 1 || quantity > 199) {
      return res.status(400).json({ error: 'Quantity must be between 1 and 199' });
    }

    db.updateUnit.run(unit_type, quantity, id);
    res.json({ success: true });
  } catch (err) {
    console.error('Update unit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/units/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const owner = db.getUnitOwner.get(id);
    if (!owner || owner.user_id !== req.userId) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    db.deleteUnit.run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete unit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SPA Fallback ───────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ⚡ Unit 777 server running at http://localhost:${PORT}\n`);
});
