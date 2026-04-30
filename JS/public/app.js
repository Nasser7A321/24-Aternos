const $ = (sel) => document.querySelector(sel);

const els = {
  form: $('#configForm'),
  saveHint: $('#saveHint'),
  statusPill: $('#statusPill'),
  statusText: $('#statusText'),
  btnStart: $('#btnStart'),
  btnStop: $('#btnStop'),
  btnPing: $('#btnPing'),
  pingResult: $('#pingResult'),
  btnAfkOn: $('#btnAfkOn'),
  btnAfkOff: $('#btnAfkOff'),
  chatForm: $('#chatForm'),
  chatInput: $('#chatInput'),
  logs: $('#logs'),
  autoscroll: $('#autoscroll'),
  btnClear: $('#btnClear'),
  statHealth: $('#statHealth'),
  statFood: $('#statFood'),
  statPos: $('#statPos'),
  statPlayers: $('#statPlayers'),
};

function setStatus(status) {
  els.statusText.textContent = status;
  els.statusPill.className = 'status-pill ' + status;
}

function fmtTs(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

function appendLog(entry) {
  const line = document.createElement('div');
  line.className = 'line';
  line.innerHTML =
    `<span class="ts">${fmtTs(entry.ts)}</span>` +
    `<span class="lvl ${entry.level}">${entry.level.toUpperCase()}</span>` +
    `<span class="msg"></span>`;
  line.querySelector('.msg').textContent = entry.message;
  els.logs.appendChild(line);
  while (els.logs.childNodes.length > 600) {
    els.logs.removeChild(els.logs.firstChild);
  }
  if (els.autoscroll.checked) {
    els.logs.scrollTop = els.logs.scrollHeight;
  }
}

function applyConfigToForm(cfg) {
  els.form.host.value = cfg.host || '';
  els.form.port.value = cfg.port || 25565;
  els.form.username.value = cfg.username || '';
  els.form.auth.value = cfg.auth || 'offline';
  els.form.version.value = cfg.version === false || cfg.version == null ? '' : String(cfg.version);
  els.form.register.value = cfg.register || '';
  els.form.login.value = cfg.login || '';
  const a = cfg.antiAfk || {};
  els.form.afkForward.checked = !!a.forward;
  els.form.afkJump.checked = !!a.jump;
  els.form.afkSprint.checked = !!a.sprint;
  els.form.autoReconnect.checked = cfg.autoReconnect !== false;
  els.form.reconnectDelayMs.value = cfg.reconnectDelayMs || 5000;
}

function readConfigFromForm() {
  const f = els.form;
  const versionRaw = f.version.value.trim();
  return {
    host: f.host.value.trim(),
    port: parseInt(f.port.value, 10) || 25565,
    username: f.username.value.trim(),
    auth: f.auth.value,
    version: versionRaw === '' || versionRaw.toLowerCase() === 'auto' ? false : versionRaw,
    register: f.register.value.trim(),
    login: f.login.value.trim(),
    antiAfk: {
      forward: f.afkForward.checked,
      jump: f.afkJump.checked,
      sprint: f.afkSprint.checked,
    },
    autoReconnect: f.autoReconnect.checked,
    reconnectDelayMs: parseInt(f.reconnectDelayMs.value, 10) || 5000,
  };
}

function applySnapshot(snap) {
  setStatus(snap.status || 'offline');
  els.statHealth.textContent = snap.health != null ? snap.health.toFixed(1) : '—';
  els.statFood.textContent = snap.food != null ? snap.food : '—';
  if (snap.position) {
    const p = snap.position;
    els.statPos.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
  } else {
    els.statPos.textContent = '—';
  }
  els.statPlayers.textContent = snap.players ? snap.players.length : '—';
  if (Array.isArray(snap.logs)) {
    els.logs.innerHTML = '';
    snap.logs.forEach(appendLog);
  }
}

async function loadConfig() {
  const res = await fetch('/api/config');
  const cfg = await res.json();
  applyConfigToForm(cfg);
}

async function saveConfig(e) {
  e.preventDefault();
  const cfg = readConfigFromForm();
  els.saveHint.textContent = 'جاري الحفظ...';
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  const data = await res.json();
  els.saveHint.textContent = data.ok ? 'تم الحفظ ✓' : 'فشل الحفظ';
  setTimeout(() => (els.saveHint.textContent = ''), 2500);
}

async function api(path, body) {
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

function poll() {
  setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const snap = await res.json();
      els.statHealth.textContent = snap.health != null ? snap.health.toFixed(1) : '—';
      els.statFood.textContent = snap.food != null ? snap.food : '—';
      if (snap.position) {
        const p = snap.position;
        els.statPos.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
      } else {
        els.statPos.textContent = '—';
      }
      els.statPlayers.textContent = snap.players ? snap.players.length : '—';
    } catch (e) { /* ignore */ }
  }, 3000);
}

function connectStream() {
  const es = new EventSource('/api/events');
  es.addEventListener('snapshot', (ev) => applySnapshot(JSON.parse(ev.data)));
  es.addEventListener('log', (ev) => appendLog(JSON.parse(ev.data)));
  es.addEventListener('status', (ev) => setStatus(JSON.parse(ev.data).status));
  es.onerror = () => { /* browser will auto-retry */ };
}

async function runPing() {
  const cfg = readConfigFromForm();
  els.pingResult.hidden = false;
  els.pingResult.className = 'ping-result';
  els.pingResult.textContent = 'جاري فحص ' + cfg.host + ':' + cfg.port + '...';
  try {
    const res = await fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: cfg.host, port: cfg.port }),
    });
    const data = await res.json();
    if (!data.reachable) {
      els.pingResult.className = 'ping-result fail';
      els.pingResult.innerHTML =
        '<strong>السيرفر غير قابل للوصول</strong><br>' +
        '<span class="k">السبب:</span>' + (data.error || 'unknown') + '<br>' +
        '<span class="k">تلميح:</span>' + (data.hint || '');
    } else {
      els.pingResult.className = 'ping-result ok';
      let html = '<strong>السيرفر متصل ✓</strong>';
      if (data.motd) html += '<br><span class="k">MOTD:</span>' + data.motd;
      if (data.version) html += '<br><span class="k">Version:</span>' + data.version;
      if (data.players) html += '<br><span class="k">Players:</span>' + (data.players.online || 0) + ' / ' + (data.players.max || 0);
      if (data.latency != null) html += '<br><span class="k">Latency:</span>' + data.latency + ' ms';
      if (data.warning) html += '<br><span class="k">⚠</span>' + data.warning;
      els.pingResult.innerHTML = html;
    }
  } catch (e) {
    els.pingResult.className = 'ping-result fail';
    els.pingResult.textContent = 'فشل الفحص: ' + e.message;
  }
}

els.form.addEventListener('submit', saveConfig);
els.btnStart.addEventListener('click', () => api('/api/start'));
els.btnStop.addEventListener('click', () => api('/api/stop'));
els.btnPing.addEventListener('click', runPing);
els.btnAfkOn.addEventListener('click', () => api('/api/anti-afk', { enabled: true }));
els.btnAfkOff.addEventListener('click', () => api('/api/anti-afk', { enabled: false }));
els.btnClear.addEventListener('click', () => (els.logs.innerHTML = ''));
els.chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = els.chatInput.value.trim();
  if (!message) return;
  await api('/api/chat', { message });
  els.chatInput.value = '';
});

document.querySelectorAll('.btn.move').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const seconds = parseFloat(document.getElementById('moveDuration').value) || 2;
    api('/api/move', { action, duration: Math.round(seconds * 1000) });
  });
});

document.querySelectorAll('.btn.look').forEach((btn) => {
  btn.addEventListener('click', () => {
    const direction = btn.dataset.direction;
    const degrees = parseFloat(btn.dataset.deg || '0');
    api('/api/look', { direction, degrees });
  });
});

const btnMoveStop = document.getElementById('btnMoveStop');
const btnAttack = document.getElementById('btnAttack');
const btnDrop = document.getElementById('btnDrop');
if (btnMoveStop) btnMoveStop.addEventListener('click', () => api('/api/move-stop'));
if (btnAttack) btnAttack.addEventListener('click', () => api('/api/attack'));
if (btnDrop) btnDrop.addEventListener('click', () => api('/api/drop'));

loadConfig();
connectStream();
poll();
