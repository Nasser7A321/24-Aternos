const mineflayer = require('mineflayer');
const EventEmitter = require('events');

class BotManager extends EventEmitter {
  constructor() {
    super();
    this.bot = null;
    this.status = 'offline';
    this.config = null;
    this.shouldRun = false;
    this.reconnectTimer = null;
    this.logs = [];
    this.maxLogs = 500;
  }

  log(level, message) {
    const entry = {
      ts: Date.now(),
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs);
    }
    this.emit('log', entry);
  }

  setStatus(status) {
    if (this.status !== status) {
      this.status = status;
      this.emit('status', status);
    }
  }

  start(config) {
    if (this.bot || this.shouldRun) {
      this.log('warn', 'Bot is already running. Stop it first.');
      return false;
    }
    this.config = config;
    this.shouldRun = true;
    this._spawn();
    return true;
  }

  _spawn() {
    if (!this.shouldRun || !this.config) return;
    const cfg = this.config;
    this.setStatus('connecting');
    this.log('info', `Connecting to ${cfg.host}:${cfg.port} as ${cfg.username}...`);

    let bot;
    try {
      const opts = {
        host: cfg.host,
        port: parseInt(cfg.port, 10) || 25565,
        username: cfg.username,
        version: cfg.version || false,
      };
      if (cfg.auth && cfg.auth !== 'offline') {
        opts.auth = cfg.auth;
      }
      bot = mineflayer.createBot(opts);
    } catch (err) {
      this.log('error', `Failed to create bot: ${err.message}`);
      this.setStatus('error');
      this._scheduleReconnect();
      return;
    }

    this.bot = bot;

    bot.on('login', () => {
      this.log('info', 'Logged in successfully.');
      this.setStatus('online');
      if (cfg.register) bot.chat(cfg.register);
      if (cfg.login) bot.chat(cfg.login);
    });

    bot.on('spawn', () => {
      this.log('info', 'Bot spawned in world.');
      const a = cfg.antiAfk || {};
      if (a.forward) bot.setControlState('forward', true);
      if (a.jump) bot.setControlState('jump', true);
      if (a.sprint) bot.setControlState('sprint', true);
    });

    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      this.log('chat', `<${username}> ${message}`);
      if (message === ';start') {
        bot.chat('24 ATERNOS > Bot started!');
        const a = cfg.antiAfk || {};
        if (a.forward) bot.setControlState('forward', true);
        if (a.jump) bot.setControlState('jump', true);
        if (a.sprint) bot.setControlState('sprint', true);
      } else if (message === ';stop') {
        bot.chat('24 ATERNOS > Bot stopped!');
        bot.clearControlStates();
      } else if (message === ';pos') {
        const p = bot.entity.position;
        bot.chat(`Bot > I am at ${p.toString()}`);
      }
    });

    bot.on('death', () => {
      this.log('warn', 'Bot died. Respawning.');
    });

    bot.on('kicked', (reason) => {
      this.log('error', `Kicked: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
    });

    bot.on('error', (err) => {
      const msg = err.message || String(err);
      this.log('error', msg);
      if (err.code === 'ECONNRESET') {
        this.log('warn', 'Hint: ECONNRESET = the server closed the connection. Common causes:');
        this.log('warn', '  • Aternos server is offline/sleeping — start it from aternos.org first.');
        this.log('warn', '  • Wrong Minecraft version — try setting Version explicitly (e.g. 1.20.4).');
        this.log('warn', '  • Premium server but Auth is set to offline (or vice versa).');
        this.log('warn', '  • Aternos may be blocking mineflayer-style bots.');
      } else if (err.code === 'ECONNREFUSED') {
        this.log('warn', 'Hint: ECONNREFUSED = nothing is listening at that host:port. Check host/port.');
      } else if (err.code === 'ENOTFOUND') {
        this.log('warn', 'Hint: ENOTFOUND = host name cannot be resolved. Check the spelling of host.');
      } else if (err.code === 'ETIMEDOUT') {
        this.log('warn', 'Hint: ETIMEDOUT = server did not respond. It may be sleeping or blocked.');
      }
    });

    bot.on('end', (reason) => {
      this.log('warn', `Disconnected (${reason || 'unknown'}).`);
      this.bot = null;
      this.setStatus('offline');
      if (this.shouldRun && cfg.autoReconnect !== false) {
        this._scheduleReconnect();
      }
    });
  }

  _scheduleReconnect() {
    if (!this.shouldRun) return;
    const delay = (this.config && this.config.reconnectDelayMs) || 5000;
    this.log('info', `Reconnecting in ${Math.round(delay / 1000)}s...`);
    this.setStatus('reconnecting');
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this._spawn(), delay);
  }

  stop() {
    this.shouldRun = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.bot) {
      try { this.bot.quit('User stopped the bot'); } catch (e) { /* noop */ }
      try { this.bot.end(); } catch (e) { /* noop */ }
      this.bot = null;
    }
    this.setStatus('offline');
    this.log('info', 'Bot stopped by user.');
  }

  sendChat(message) {
    if (!this.bot || this.status !== 'online') {
      this.log('warn', 'Cannot send chat: bot is not online.');
      return false;
    }
    this.bot.chat(message);
    this.log('chat', `<me> ${message}`);
    return true;
  }

  setAntiAfk(enabled) {
    if (!this.bot || this.status !== 'online') return false;
    if (enabled) {
      const a = (this.config && this.config.antiAfk) || {};
      if (a.forward) this.bot.setControlState('forward', true);
      if (a.jump) this.bot.setControlState('jump', true);
      if (a.sprint) this.bot.setControlState('sprint', true);
    } else {
      this.bot.clearControlStates();
    }
    return true;
  }

  getPosition() {
    if (!this.bot || !this.bot.entity) return null;
    const p = this.bot.entity.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  snapshot() {
    return {
      status: this.status,
      shouldRun: this.shouldRun,
      logs: this.logs.slice(-200),
      position: this.getPosition(),
      players: this.bot ? Object.keys(this.bot.players || {}) : [],
      health: this.bot ? this.bot.health : null,
      food: this.bot ? this.bot.food : null,
    };
  }
}

module.exports = BotManager;
