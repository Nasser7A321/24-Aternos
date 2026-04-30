const express = require('express');
const fs = require('fs');
const path = require('path');
const net = require('net');
const BotManager = require('./botManager');

let mcProtocol = null;
try { mcProtocol = require('minecraft-protocol'); } catch (e) { /* optional */ }

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

app.post('/api/move', (req, res) => {
  const action = req.body && req.body.action;
  const duration = (req.body && req.body.duration) || 1000;
  const ok = manager.move(action, duration);
  res.json({ ok });
});

app.post('/api/move-stop', (req, res) => {
  const ok = manager.stopAllMovement();
  res.json({ ok });
});

app.post('/api/look', (req, res) => {
  const direction = req.body && req.body.direction;
  const degrees = (req.body && req.body.degrees) || 45;
  const ok = manager.look(direction, degrees);
  res.json({ ok });
});

app.post('/api/attack', (req, res) => {
  const ok = manager.attack();
  res.json({ ok });
});

app.post('/api/drop', (req, res) => {
  const ok = manager.dropItem();
  res.json({ ok });
});

app.post('/api/ping', (req, res) => {
  const cfg = loadConfig();
  const host = (req.body && req.body.host) || cfg.host;
  const port = parseInt((req.body && req.body.port) || cfg.port, 10) || 25565;

  // Step 1: TCP reachability
  const sock = new net.Socket();
  let done = false;
  const finish = (result) => {
    if (done) return;
    done = true;
    try { sock.destroy(); } catch (e) {}
    res.json(result);
  };

  sock.setTimeout(5000);
  sock.once('connect', () => {
    sock.destroy();
    // Step 2: try MOTD ping if minecraft-protocol is available
    if (!mcProtocol || !mcProtocol.ping) {
      return res.json({ ok: true, reachable: true, motd: null });
    }
    mcProtocol.ping({ host, port, closeTimeout: 5000 }, (err, result) => {
      if (err) {
        return res.json({
          ok: true,
          reachable: true,
          motd: null,
          warning: `TCP works but MOTD ping failed: ${err.code || err.message}`,
        });
      }
      const desc = result && result.description;
      const motd = typeof desc === 'string' ? desc : (desc && (desc.text || JSON.stringify(desc)));
      res.json({
        ok: true,
        reachable: true,
        motd,
        version: result && result.version && result.version.name,
        protocol: result && result.version && result.version.protocol,
        players: result && result.players,
        latency: result && result.latency,
      });
    });
  });
  sock.once('timeout', () => finish({ ok: false, reachable: false, error: 'TIMEOUT', hint: 'Server is not responding. It is likely sleeping or the host/port is wrong.' }));
  sock.once('error', (err) => finish({ ok: false, reachable: false, error: err.code || err.message, hint: err.code === 'ENOTFOUND' ? 'Host not found — check spelling.' : err.code === 'ECONNREFUSED' ? 'Nothing is listening on that port.' : 'Connection failed.' }));
  sock.connect(port, host);
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
