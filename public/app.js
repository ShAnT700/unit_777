// Unit 777 — Frontend Application
const UNIT_PRICES = { UNIT805: 42.19, UNIT806: 45.56, UNIT807: 64.12, UNIT808: 27.00, UNIT813: 9.11, UNIT838: 37.12, '96 LCP Placement': 135.00, '288 LCP Placement': 135.00 };
const UNIT_LABELS = { UNIT805: 'UNIT805', UNIT806: 'UNIT806', UNIT807: 'UNIT807', UNIT808: 'UNIT808', UNIT813: 'UNIT813', UNIT838: 'UNIT838', '96 LCP Placement': '96 LCP', '288 LCP Placement': '288 LCP' };
const UNIT_TYPES = Object.keys(UNIT_PRICES);
const MAX_UNITS = 5;
let authMode = 'login', token = localStorage.getItem('token'), username = localStorage.getItem('username');
let projects = [], activeProjectId = null, dateGroups = [], pointNameCache = [], editingDgId = null;

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem('theme') || 'dark');
  if (token) { showDashboard(); loadProjects(); } else showAuth();
  document.addEventListener('click', e => {
    if (!e.target.closest('.point-name-wrapper')) closeAllAutocomplete();
    if (!e.target.closest('.map-dropdown-wrap')) closeMapDropdown();
  });
});

// ─── Theme ───
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', next); applyTheme(next);
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const moon = document.getElementById('theme-icon-moon'), sun = document.getElementById('theme-icon-sun');
  if (moon && sun) { moon.style.display = t === 'dark' ? '' : 'none'; sun.style.display = t === 'light' ? '' : 'none'; }
}

// ─── Views ───
function showAuth() { document.getElementById('auth-view').style.display = ''; document.getElementById('dashboard-view').style.display = 'none'; }
function showDashboard() { document.getElementById('auth-view').style.display = 'none'; document.getElementById('dashboard-view').style.display = ''; document.getElementById('username-display').textContent = username || ''; }

// ─── Auth ───
function switchAuthTab(mode) { authMode = mode; document.getElementById('tab-login').classList.toggle('active', mode === 'login'); document.getElementById('tab-register').classList.toggle('active', mode === 'register'); document.getElementById('auth-btn-text').textContent = mode === 'login' ? 'Sign In' : 'Create Account'; document.getElementById('auth-error').style.display = 'none'; }

async function handleAuth(e) {
  e.preventDefault();
  const user = document.getElementById('auth-username').value.trim(), pass = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error'), btnText = document.getElementById('auth-btn-text'), btnLoad = document.getElementById('auth-btn-loading');
  if (!user || !pass) return;
  errorEl.style.display = 'none'; btnText.style.display = 'none'; btnLoad.style.display = '';
  try {
    const res = await fetch(authMode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error);
    token = data.token; username = data.username; localStorage.setItem('token', token); localStorage.setItem('username', username);
    showDashboard(); loadProjects(); showToast('success', `Welcome${authMode === 'register' ? '' : ' back'}, ${username}!`);
  } catch (err) { errorEl.textContent = err.message; errorEl.style.display = ''; }
  finally { btnText.style.display = ''; btnLoad.style.display = 'none'; }
}
function logout() { token = null; username = null; projects = []; dateGroups = []; activeProjectId = null; pointNameCache = []; editingDgId = null; localStorage.removeItem('token'); localStorage.removeItem('username'); closeEditModal(); showAuth(); document.getElementById('auth-form').reset(); }

// ─── API ───
async function api(method, path, body) {
  const opts = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Request failed'); return data;
}

// ─── Maps (formerly Projects) ───
async function loadProjects() {
  try {
    projects = await api('GET', '/api/projects'); renderProjectTabs();
    if (projects.length > 0) { const s = localStorage.getItem('activeProjectId'); const m = projects.find(p => p.id === Number(s)); selectProject(m ? m.id : projects[0].id); }
    else { activeProjectId = null; dateGroups = []; renderContent(); }
    loadPointNames();
  } catch (err) { showToast('error', err.message); }
}
async function selectProject(id) {
  activeProjectId = id; localStorage.setItem('activeProjectId', id); renderProjectTabs();
  try { dateGroups = await api('GET', `/api/projects/${id}/date-groups`); renderContent(); } catch (err) { showToast('error', err.message); }
}
function renderProjectTabs() {
  // Update dropdown trigger label
  const proj = projects.find(p => p.id === activeProjectId);
  document.getElementById('map-trigger-label').textContent = proj ? proj.name : 'Maps';
  // Render dropdown items
  const dd = document.getElementById('map-dropdown');
  const editIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const delIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  dd.innerHTML = projects.map(p => `<div class="map-dropdown-item ${p.id === activeProjectId ? 'active' : ''}" onclick="selectProject(${p.id});closeMapDropdown()">
    <span><span class="map-point-count">${p.point_count || 0}</span>${esc(p.name)}</span>
    <span class="map-dropdown-item-actions">
      <button class="btn-icon" onclick="event.stopPropagation();closeMapDropdown();promptEditProject(${p.id},'${escA(p.name)}')" title="Rename">${editIcon}</button>
      <button class="btn-icon delete" onclick="event.stopPropagation();closeMapDropdown();confirmDeleteProject(${p.id})" title="Delete">${delIcon}</button>
    </span>
  </div>`).join('') + `<div class="map-dropdown-add" onclick="closeMapDropdown();promptAddProject()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Map</div>`;
}
function toggleMapDropdown() {
  const dd = document.getElementById('map-dropdown');
  dd.style.display = dd.style.display === 'none' ? '' : 'none';
}
function closeMapDropdown() { document.getElementById('map-dropdown').style.display = 'none'; }
function promptAddProject() { showPrompt('New Map', 'Enter a name for the new map:', '', async n => { if (!n.trim()) return; try { const p = await api('POST', '/api/projects', { name: n.trim() }); projects.push(p); selectProject(p.id); showToast('success', 'Map created'); } catch (e) { showToast('error', e.message); } }); }
function promptEditProject(id, cur) { showPrompt('Rename Map', 'Enter a new name:', cur, async n => { if (!n.trim()) return; try { await api('PUT', `/api/projects/${id}`, { name: n.trim() }); const p = projects.find(x => x.id === id); if (p) p.name = n.trim(); renderProjectTabs(); if (id === activeProjectId) renderContent(); showToast('success', 'Map renamed'); } catch (e) { showToast('error', e.message); } }); }
function confirmDeleteProject(id) { showConfirm('Delete Map?', 'This will permanently delete this map and ALL its work days.', async () => { try { await api('DELETE', `/api/projects/${id}`); projects = projects.filter(p => p.id !== id); if (activeProjectId === id) { activeProjectId = projects.length > 0 ? projects[0].id : null; if (activeProjectId) selectProject(activeProjectId); else { dateGroups = []; renderProjectTabs(); renderContent(); } } else renderProjectTabs(); showToast('success', 'Map deleted'); } catch (e) { showToast('error', e.message); } }); }

// ─── Point Name Autocomplete ───
async function loadPointNames() { try { pointNameCache = await api('GET', '/api/point-names'); } catch (e) {} }
function showAutocomplete(el, pid) { const q = el.value.toLowerCase(); const w = el.closest('.point-name-wrapper'); let dd = w.querySelector('.autocomplete-dropdown'); if (!dd) { dd = document.createElement('div'); dd.className = 'autocomplete-dropdown'; w.appendChild(dd); } const m = pointNameCache.filter(n => n.toLowerCase().includes(q) && n !== el.value); if (!m.length) { dd.classList.remove('visible'); return; } dd.innerHTML = m.slice(0, 12).map(n => `<div class="autocomplete-item" onmousedown="selectAC(${pid},'${escA(n)}')">${esc(n)}</div>`).join(''); dd.classList.add('visible'); }
function selectAC(pid, name) { closeAllAutocomplete(); updatePoint(pid, name); }
function closeAllAutocomplete() { document.querySelectorAll('.autocomplete-dropdown').forEach(d => d.classList.remove('visible')); }

// ─── Render (Collapsed Summary Cards) ───
function renderContent() {
  const c = document.getElementById('date-groups-container'), es = document.getElementById('empty-state'), np = document.getElementById('no-project-state'), ab = document.getElementById('add-date-group-btn'), h = document.getElementById('project-heading');
  if (!activeProjectId) { c.innerHTML = ''; es.style.display = 'none'; np.style.display = ''; ab.style.display = 'none'; h.textContent = 'Work Entries'; return; }
  np.style.display = 'none'; ab.style.display = '';
  const proj = projects.find(p => p.id === activeProjectId); h.textContent = proj ? proj.name : 'Work Entries';
  if (!dateGroups.length) { c.innerHTML = ''; es.style.display = ''; return; }
  es.style.display = 'none';
  c.innerHTML = dateGroups.map(dg => {
    const t = calcTotal(dg), pts = dg.points.length, units = dg.points.reduce((s, p) => s + p.units.length, 0);
    const d = formatDate(dg.work_date);
    const thuClass = isThursday(dg.work_date) ? ' thursday' : '';
    return `<div class="date-group${thuClass}" data-dg-id="${dg.id}">
      <div class="date-group-summary" onclick="openEditModal(${dg.id})">
        <span class="date-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
        <div class="date-group-summary-info"><div class="date-group-summary-date">${d}</div><div class="date-group-summary-meta">${pts} point${pts !== 1 ? 's' : ''} · ${units} unit${units !== 1 ? 's' : ''}</div></div>
        <span class="date-group-summary-total">$${t.toFixed(2)}</span>
        <div class="date-group-summary-actions">
          <button class="btn-icon" onclick="event.stopPropagation();openEditModal(${dg.id})" title="Edit day"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-icon delete" onclick="event.stopPropagation();confirmDeleteDateGroup(${dg.id})" title="Delete"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      </div></div>`;
  }).join('');
}

// ─── Edit Modal ───
function openEditModal(dgId) {
  editingDgId = dgId; const dg = dateGroups.find(d => d.id === dgId); if (!dg) return;
  const proj = projects.find(p => p.id === activeProjectId);
  document.getElementById('edit-modal-map').textContent = proj ? proj.name : '';
  document.getElementById('edit-modal-date').textContent = formatDate(dg.work_date);
  renderEditBody(dg);
  document.getElementById('edit-modal').style.display = ''; document.body.style.overflow = 'hidden';
}
function closeEditModal() {
  editingDgId = null; document.getElementById('edit-modal').style.display = 'none'; document.body.style.overflow = '';
  renderContent();
}
function renderEditBody(dg) {
  if (!dg) { dg = dateGroups.find(d => d.id === editingDgId); } if (!dg) return;
  const total = calcTotal(dg);
  const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const pointsHTML = dg.points.map((pt, idx) => {
    const uHTML = pt.units.map(u => {
      const tOpts = UNIT_TYPES.map(t => `<option value="${t}" ${t === u.unit_type ? 'selected' : ''}>${UNIT_LABELS[t] || t}</option>`).join('');
      let qOpts = ''; for (let i = 1; i <= 199; i++) qOpts += `<option value="${i}" ${i === u.quantity ? 'selected' : ''}>${i}</option>`;
      return `<div class="unit-row" data-unit-id="${u.id}"><select onchange="updateUnit(${u.id}, this.value, null)" title="Type">${tOpts}</select><select onchange="updateUnit(${u.id}, null, this.value)" title="Qty">${qOpts}</select><button class="btn-icon delete" onclick="deleteUnit(${u.id})" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`;
    }).join('');
    const canAdd = pt.units.length < MAX_UNITS;
    const fIn = pt.feet_in ? pt.feet_in : '', fOut = pt.feet_out ? pt.feet_out : '';
    const ptTotal = calcPointTotal(pt);
    return `<div class="point-card" data-point-id="${pt.id}"><div class="point-header"><span class="point-number">#${idx+1}</span><span class="point-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span><div class="point-name-wrapper"><input type="text" class="point-name-input" value="${esc(pt.name)}" onchange="updatePoint(${pt.id}, this.value)" onfocus="showAutocomplete(this, ${pt.id})" oninput="showAutocomplete(this, ${pt.id})" onblur="setTimeout(closeAllAutocomplete, 150)" placeholder="Point name" autocomplete="off"></div><button class="copy-name-btn" onclick="copyPointName(this, ${pt.id})" title="Copy name">${copyIcon}</button><div class="point-actions"><button class="btn-icon delete" onclick="confirmDeletePoint(${pt.id}, ${dg.id})" title="Delete point"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></div><div class="feet-row"><span class="feet-label">Feet:</span><input type="number" class="feet-input" value="${fIn}" min="0" max="99999" maxlength="5" placeholder="In" onchange="updatePointFeet(${pt.id}, this.value, null)" title="Feet In"><span class="feet-sep">/</span><input type="number" class="feet-input" value="${fOut}" min="0" max="99999" maxlength="5" placeholder="Out" onchange="updatePointFeet(${pt.id}, null, this.value)" title="Feet Out"></div><div class="units-container">${uHTML}<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><button class="add-unit-btn ${canAdd ? '' : 'disabled'}" onclick="addUnit(${pt.id}, ${dg.id})" ${canAdd ? '' : 'disabled'}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ${canAdd ? 'Add Unit' : 'Max 5'}</button><button class="copy-point-btn" onclick="copyPointDetails(${pt.id})" title="Copy point details">${copyIcon} Copy Point</button></div></div><div class="note-row"><textarea class="note-input" maxlength="300" placeholder="Add a note..." onchange="updatePointNote(${pt.id}, this.value)">${esc(pt.note || '')}</textarea></div><div class="point-total"><span class="point-total-label">Point Total:</span> $${ptTotal.toFixed(2)}</div></div>`;
  }).join('');

  document.getElementById('edit-modal-body').innerHTML = `
    <div class="edit-date-row"><span class="date-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span><input type="date" class="date-input" value="${dg.work_date}" onchange="updateDateGroup(${dg.id}, this.value)"></div>
    ${pointsHTML}
    <button class="add-point-btn" onclick="addPoint(${dg.id})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Point</button>
    <div class="edit-modal-footer"><div class="daily-total"><span class="daily-total-label">Daily Total:</span><span class="daily-total-value">$${total.toFixed(2)}</span></div><button class="copy-excel-btn" onclick="copyForExcel(${dg.id})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy for Excel</button></div>`;
  document.getElementById('edit-modal-date').textContent = formatDate(dg.work_date);
}

function calcTotal(dg) { let t = 0; for (const p of dg.points) for (const u of p.units) t += (UNIT_PRICES[u.unit_type] || 0) * u.quantity; return t; }
function calcPointTotal(pt) { let t = 0; for (const u of pt.units) t += (UNIT_PRICES[u.unit_type] || 0) * u.quantity; return t; }

// ─── Date Group CRUD ───
async function addDateGroup() {
  if (!activeProjectId) { showToast('error', 'Select or create a map first'); return; }
  try { const today = new Date().toISOString().split('T')[0]; const dg = await api('POST', '/api/date-groups', { work_date: today, project_id: activeProjectId }); dateGroups.unshift(dg); sortDG(); renderContent(); showToast('success', 'Work day added'); openEditModal(dg.id); } catch (e) { showToast('error', e.message); }
}
async function updateDateGroup(id, wd) { try { await api('PUT', `/api/date-groups/${id}`, { work_date: wd }); const dg = dateGroups.find(d => d.id === id); if (dg) dg.work_date = wd; sortDG(); if (editingDgId === id) renderEditBody(null); } catch (e) { showToast('error', e.message); } }
async function deleteDateGroup(id) { const _dg = dateGroups.find(d => d.id === id); try { await api('DELETE', `/api/date-groups/${id}`); dateGroups = dateGroups.filter(d => d.id !== id); if (_dg) { const _p = projects.find(p => p.id === activeProjectId); if (_p) { _p.point_count = Math.max(0, (_p.point_count || 0) - _dg.points.length); renderProjectTabs(); } } if (editingDgId === id) closeEditModal(); renderContent(); showToast('success', 'Work day deleted'); } catch (e) { showToast('error', e.message); } }
function sortDG() { dateGroups.sort((a, b) => a.work_date > b.work_date ? -1 : a.work_date < b.work_date ? 1 : b.id - a.id); }

// ─── Point CRUD ───
async function addPoint(dgId) {
  try { const pt = await api('POST', `/api/date-groups/${dgId}/points`, { name: 'New Point' }); const dg = dateGroups.find(d => d.id === dgId); if (dg) dg.points.push(pt); { const _p = projects.find(p => p.id === activeProjectId); if (_p) { _p.point_count = (_p.point_count || 0) + 1; renderProjectTabs(); } } if (editingDgId === dgId) { renderEditBody(null); setTimeout(() => { const c = document.querySelector(`[data-point-id="${pt.id}"]`); if (c) { const i = c.querySelector('.point-name-input'); if (i) { i.focus(); i.select(); } } }, 50); } } catch (e) { showToast('error', e.message); }
}
async function updatePoint(id, name) { try { await api('PUT', `/api/points/${id}`, { name }); for (const dg of dateGroups) { const pt = dg.points.find(p => p.id === id); if (pt) { pt.name = name; break; } } if (name && name !== 'New Point' && !pointNameCache.includes(name)) pointNameCache.push(name); if (editingDgId) renderEditBody(null); } catch (e) { showToast('error', e.message); } }
async function deletePoint(id, dgId) { try { await api('DELETE', `/api/points/${id}`); const dg = dateGroups.find(d => d.id === dgId); if (dg) dg.points = dg.points.filter(p => p.id !== id); { const _p = projects.find(p => p.id === activeProjectId); if (_p) { _p.point_count = Math.max(0, (_p.point_count || 0) - 1); renderProjectTabs(); } } if (editingDgId === dgId) renderEditBody(null); showToast('success', 'Point deleted'); } catch (e) { showToast('error', e.message); } }

// ─── Unit CRUD ───
async function addUnit(pid, dgId) { try { const u = await api('POST', `/api/points/${pid}/units`, { unit_type: 'UNIT805', quantity: 1 }); for (const dg of dateGroups) { const pt = dg.points.find(p => p.id === pid); if (pt) { pt.units.push(u); break; } } if (editingDgId) renderEditBody(null); } catch (e) { showToast('error', e.message); } }
async function updateUnit(id, uType, qty) { try { let cur = null; for (const dg of dateGroups) { for (const pt of dg.points) { const u = pt.units.find(u => u.id === id); if (u) { cur = u; break; } } if (cur) break; } if (!cur) return; const nT = uType || cur.unit_type, nQ = qty ? parseInt(qty) : cur.quantity; await api('PUT', `/api/units/${id}`, { unit_type: nT, quantity: nQ }); cur.unit_type = nT; cur.quantity = nQ; if (editingDgId) renderEditBody(null); } catch (e) { showToast('error', e.message); } }
async function deleteUnit(id) { try { await api('DELETE', `/api/units/${id}`); for (const dg of dateGroups) for (const pt of dg.points) pt.units = pt.units.filter(u => u.id !== id); if (editingDgId) renderEditBody(null); } catch (e) { showToast('error', e.message); } }

// ─── Point Feet ───
async function updatePointFeet(pid, fIn, fOut) {
  let pt = null; for (const dg of dateGroups) { pt = dg.points.find(p => p.id === pid); if (pt) break; } if (!pt) return;
  const newIn = fIn !== null ? Math.max(0, Math.min(99999, parseInt(fIn) || 0)) : pt.feet_in || 0;
  const newOut = fOut !== null ? Math.max(0, Math.min(99999, parseInt(fOut) || 0)) : pt.feet_out || 0;
  try { await api('PUT', `/api/points/${pid}/feet`, { feet_in: newIn, feet_out: newOut }); pt.feet_in = newIn; pt.feet_out = newOut; } catch (e) { showToast('error', e.message); }
}

// ─── Point Note ───
async function updatePointNote(pid, note) {
  let pt = null; for (const dg of dateGroups) { pt = dg.points.find(p => p.id === pid); if (pt) break; } if (!pt) return;
  const trimmed = (note || '').slice(0, 300);
  try { await api('PUT', `/api/points/${pid}/note`, { note: trimmed }); pt.note = trimmed; } catch (e) { showToast('error', e.message); }
}

// ─── Copy Point Name ───
async function copyPointName(btn, pid) {
  let pt = null; for (const dg of dateGroups) { pt = dg.points.find(p => p.id === pid); if (pt) break; } if (!pt) return;
  await clipCopy(pt.name);
  const tip = document.createElement('span'); tip.className = 'copy-tooltip'; tip.textContent = 'Copied!';
  btn.appendChild(tip); setTimeout(() => tip.remove(), 1200);
}

// ─── Copy Point Details (plain text) ───
async function copyPointDetails(pid) {
  let pt = null; for (const dg of dateGroups) { pt = dg.points.find(p => p.id === pid); if (pt) break; } if (!pt) return;
  let txt = pt.name + '\n';
  for (const u of pt.units) txt += `${u.unit_type} - ${u.quantity}\n`;
  if ((pt.feet_in && pt.feet_in > 0) || (pt.feet_out && pt.feet_out > 0)) txt += `${pt.feet_in || 0}/${pt.feet_out || 0}\n`;
  if (pt.note && pt.note.trim()) txt += pt.note.trim() + '\n';
  await clipCopy(txt.trim()); showToast('success', 'Point details copied!');
}

// ─── Clipboard Helper ───
async function clipCopy(text) {
  try { await navigator.clipboard.writeText(text); } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
}

// ─── Copy for Excel (feet EXCLUDED) ───
async function copyForExcel(dgId) { const dg = dateGroups.find(d => d.id === dgId); if (!dg) return; let tsv = ''; for (const pt of dg.points) { if (!pt.units.length) { tsv += `${pt.name}\t\t\n`; continue; } for (let i = 0; i < pt.units.length; i++) { const u = pt.units[i]; tsv += i === 0 ? `${pt.name}\t${u.unit_type}\t${u.quantity}\n` : `\t${u.unit_type}\t${u.quantity}\n`; } } await clipCopy(tsv); showToast('success', 'Copied to clipboard!'); }

// ─── Dialogs ───
function confirmDeleteDateGroup(id) { showConfirm('Delete Work Day?', 'This will permanently delete all points and units for this day.', () => deleteDateGroup(id)); }
function confirmDeletePoint(id, dgId) { showConfirm('Delete Point?', 'This will permanently delete this point and all its units.', () => deletePoint(id, dgId)); }
function showConfirm(title, msg, onOk) { const ov = document.createElement('div'); ov.className = 'confirm-overlay'; ov.innerHTML = `<div class="confirm-dialog"><h3>${title}</h3><p>${msg}</p><div class="confirm-actions"><button class="btn btn-ghost btn-sm" id="confirm-cancel">Cancel</button><button class="btn btn-danger btn-sm" id="confirm-ok">Delete</button></div></div>`; document.body.appendChild(ov); ov.querySelector('#confirm-cancel').onclick = () => ov.remove(); ov.querySelector('#confirm-ok').onclick = () => { ov.remove(); onOk(); }; ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); }); }
function showPrompt(title, msg, def, onOk) { const ov = document.createElement('div'); ov.className = 'confirm-overlay'; ov.innerHTML = `<div class="confirm-dialog"><h3>${title}</h3><p>${msg}</p><input class="prompt-input" type="text" value="${escA(def)}" /><div class="confirm-actions"><button class="btn btn-ghost btn-sm" id="prompt-cancel">Cancel</button><button class="btn btn-primary btn-sm" id="prompt-ok">OK</button></div></div>`; document.body.appendChild(ov); const inp = ov.querySelector('.prompt-input'); setTimeout(() => { inp.focus(); inp.select(); }, 50); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { ov.remove(); onOk(inp.value); } }); ov.querySelector('#prompt-cancel').onclick = () => ov.remove(); ov.querySelector('#prompt-ok').onclick = () => { ov.remove(); onOk(inp.value); }; ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); }); }
function showToast(type, msg) { const c = document.getElementById('toast-container'), t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span><span>${esc(msg)}</span>`; c.appendChild(t); setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 300); }, 3000); }

// ─── Utilities ───
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escA(s) { return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function formatDate(ds) {
  const [y, m, d] = ds.split('-');
  const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return `${days[dt.getDay()]}, ${m}/${d}/${y}`;
}
function isThursday(ds) {
  const [y, m, d] = ds.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).getDay() === 4;
}
