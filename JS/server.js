const express = require('express');
const fs = require('fs');
const path = require('path');
const BotManager = require('./botManager');

const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = '0.0.0.0';
const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {
      host: 'localhost',
      port: 25565,
      username: '24ATERNOSBOT',
      version: false,
      auth: 'offline',
      register: '',
      login: '',
      antiAfk: { forward: true, jump: true, sprint: true },
      autoReconnect: true,
      reconnectDelayMs: 5000,
    };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

const app = express();
const manager = new BotManager();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

app.post('/api/config', (req, res) => {
  const current = loadConfig();
  const next = { ...current, ...req.body };
  if (typeof next.port === 'string') next.port = parseInt(next.port, 10) || 25565;
  saveConfig(next);
  res.json({ ok: true, config: next });
});

app.get('/api/status', (req, res) => {
  res.json(manager.snapshot());
});

app.post('/api/start', (req, res) => {
  const cfg = loadConfig();
  const ok = manager.start(cfg);
  res.json({ ok, status: manager.status });
});

app.post('/api/stop', (req, res) => {
  manager.stop();
  res.json({ ok: true, status: manager.status });
});

app.post('/api/chat', (req, res) => {
  const message = (req.body && req.body.message) || '';
  if (!message) return res.status(400).json({ ok: false, error: 'Missing message' });
  const ok = manager.sendChat(message);
  res.json({ ok });
});

app.post('/api/anti-afk', (req, res) => {
  const enabled = !!(req.body && req.body.enabled);
  const ok = manager.setAntiAfk(enabled);
  res.json({ ok, enabled });
});

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('snapshot', manager.snapshot());

  const onLog = (entry) => send('log', entry);
  const onStatus = (status) => send('status', { status });
  manager.on('log', onLog);
  manager.on('status', onStatus);

  const ping = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(ping);
    manager.off('log', onLog);
    manager.off('status', onStatus);
  });
});

app.listen(PORT, HOST, () => {
  console.log(`24-Aternos web UI running at http://${HOST}:${PORT}`);
});
