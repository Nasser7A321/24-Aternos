const mineflayer = require('mineflayer');
const EventEmitter = require('events');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { loader: autoEatLoader } = require('mineflayer-auto-eat');
let mineflayerViewer = null;
try {
  mineflayerViewer = require('prismarine-viewer').mineflayer;
} catch (e) {
  console.warn('[viewer] prismarine-viewer not available:', e.message);
}

const VIEWER_PORT = 3007;

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

    try {
      bot.loadPlugin(pathfinder);
      bot.loadPlugin(autoEatLoader);
    } catch (e) {
      this.log('warn', `Plugin load issue: ${e.message}`);
    }

    bot.on('login', () => {
      this.log('info', 'Logged in successfully.');
      this.setStatus('online');
      if (cfg.register) bot.chat(cfg.register);
      if (cfg.login) bot.chat(cfg.login);
    });

    bot.on('spawn', () => {
      this.log('info', 'Bot spawned in world.');
      this._startViewer();
      this._configureAutoEat();
      if (cfg.autoStartAntiAfk) {
        const a = cfg.antiAfk || {};
        if (a.forward) bot.setControlState('forward', true);
        if (a.jump) bot.setControlState('jump', true);
        if (a.sprint) bot.setControlState('sprint', true);
        this.log('info', 'AntiAFK auto-started on spawn.');
      } else {
        this.log('info', 'Bot is idle. Use the control buttons or press AntiAFK ON.');
      }
    });

    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      this.log('chat', `<${username}> ${message}`);
      this._handleChatCommand(username, message);
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
      this._stopViewer();
      this._flying = false;
      this.bot = null;
      this.setStatus('offline');
      if (this.shouldRun && cfg.autoReconnect !== false) {
        this._scheduleReconnect();
      }
    });
  }

  _handleChatCommand(username, message) {
    const bot = this.bot;
    if (!bot) return;
    const cfg = this.config || {};
    const text = (message || '').trim();
    const lower = text.toLowerCase();

    if (text === ';start') {
      bot.chat('24 ATERNOS > Bot started!');
      const a = cfg.antiAfk || {};
      if (a.forward) bot.setControlState('forward', true);
      if (a.jump) bot.setControlState('jump', true);
      if (a.sprint) bot.setControlState('sprint', true);
      return;
    }
    if (text === ';stop') {
      bot.chat('24 ATERNOS > Bot stopped!');
      bot.clearControlStates();
      return;
    }
    if (text === ';pos') {
      const p = bot.entity.position;
      bot.chat(`Bot > I am at ${p.toString()}`);
      return;
    }

    const tokens = lower.split(/\s+/);
    const cmd = tokens[0];
    const arg = tokens[1];

    const comeWords = ['come', 'تعال', 'تعالي', '!come', '.come', ';come'];
    const followWords = ['follow', 'اتبع', 'اتبعني', '!follow', '.follow', ';follow'];
    const stopWords = ['stay', 'stop-follow', 'توقف', 'قف', '!stop', '.stop', ';stop-follow'];
    const gotoWords = ['goto', 'اذهب', '!goto', '.goto', ';goto'];

    if (comeWords.includes(cmd)) {
      const target = arg || username;
      this.comeToPlayer(target);
      return;
    }
    if (followWords.includes(cmd)) {
      const target = arg || username;
      this.followPlayer(target);
      return;
    }
    if (stopWords.includes(cmd)) {
      this.stopGoto();
      return;
    }
    if (gotoWords.includes(cmd) && tokens.length >= 4) {
      this.goto(tokens[1], tokens[2], tokens[3]);
      return;
    }
  }

  _ensureMovements() {
    if (!this.bot || !this.bot.pathfinder) return false;
    try {
      const mcData = require('minecraft-data')(this.bot.version);
      const movements = new Movements(this.bot, mcData);
      this.bot.pathfinder.setMovements(movements);
      return true;
    } catch (e) {
      this.log('error', `Movements setup failed: ${e.message}`);
      return false;
    }
  }

  comeToPlayer(username) {
    if (!this.bot || this.status !== 'online') {
      this.log('warn', 'Cannot come: bot is not online.');
      return false;
    }
    if (!this.bot.pathfinder) {
      this.log('warn', 'Pathfinder not loaded.');
      return false;
    }
    if (!username) {
      this.log('warn', 'No player specified.');
      return false;
    }
    const player = this.bot.players[username];
    if (!player || !player.entity) {
      this.log('warn', `Player "${username}" is not visible (must be in render distance).`);
      try { this.bot.chat(`I can't see ${username}.`); } catch (_) {}
      return false;
    }
    if (!this._ensureMovements()) return false;
    const p = player.entity.position;
    this.bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 2));
    this.log('info', `Coming to ${username} at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}.`);
    try { this.bot.chat(`Coming to ${username}!`); } catch (_) {}
    return true;
  }

  followPlayer(username) {
    if (!this.bot || this.status !== 'online') {
      this.log('warn', 'Cannot follow: bot is not online.');
      return false;
    }
    if (!this.bot.pathfinder) {
      this.log('warn', 'Pathfinder not loaded.');
      return false;
    }
    if (!username) {
      this.log('warn', 'No player specified.');
      return false;
    }
    const player = this.bot.players[username];
    if (!player || !player.entity) {
      this.log('warn', `Player "${username}" is not visible (must be in render distance).`);
      try { this.bot.chat(`I can't see ${username} to follow.`); } catch (_) {}
      return false;
    }
    if (!this._ensureMovements()) return false;
    this.bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true);
    this._followingPlayer = username;
    this.log('info', `Following ${username}.`);
    try { this.bot.chat(`Following ${username}.`); } catch (_) {}
    return true;
  }

  toggleFly() {
    if (!this.bot || this.status !== 'online') {
      this.log('warn', 'Cannot fly: bot is not online.');
      return false;
    }
    if (!this.bot.creative) {
      this.log('warn', 'Creative API not available on this version.');
      return false;
    }
    try {
      if (this._flying) {
        this.bot.creative.stopFlying();
        this._flying = false;
        this.log('info', 'Stopped flying.');
      } else {
        this.bot.creative.startFlying();
        this._flying = true;
        this.log('info', 'Started flying (requires creative/permission).');
      }
      return true;
    } catch (e) {
      this.log('error', `Fly toggle failed: ${e.message}`);
      return false;
    }
  }

  _startViewer() {
    if (!this.bot) return;
    if (this._viewerStarted) return;
    if (!mineflayerViewer) {
      this.log('warn', '3D viewer is not installed (canvas dependency missing).');
      return;
    }
    try {
      mineflayerViewer(this.bot, {
        port: VIEWER_PORT,
        firstPerson: true,
      });
      this._viewerStarted = true;
      this.log('info', `3D viewer started on internal port ${VIEWER_PORT}.`);
    } catch (e) {
      this.log('warn', `Could not start viewer: ${e.message}`);
    }
  }

  _stopViewer() {
    this._viewerStarted = false;
  }

  _configureAutoEat() {
    if (!this.bot || !this.bot.autoEat) return;
    try {
      this.bot.autoEat.setOpts({
        priority: 'foodPoints',
        startAt: 14,
        bannedFood: ['rotten_flesh', 'pufferfish', 'chorus_fruit', 'poisonous_potato', 'spider_eye'],
      });
      const enabled = (this.config && this.config.autoEat) !== false;
      if (this.bot.autoEat.enable && enabled) this.bot.autoEat.enable();
      this.bot.on('autoeat_started', (item) => this.log('info', `Eating ${item ? item.name : 'food'}...`));
      this.bot.on('autoeat_finished', () => this.log('info', 'Done eating.'));
    } catch (e) {
      this.log('warn', `Auto-eat setup issue: ${e.message}`);
    }
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

  move(action, durationMs) {
    if (!this.bot) {
      this.log('warn', 'Cannot move: bot is not connected.');
      return false;
    }
    const valid = ['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint'];
    if (!valid.includes(action)) {
      this.log('warn', `Unknown move action: ${action}`);
      return false;
    }
    const ms = Math.max(50, Math.min(60000, parseInt(durationMs, 10) || 1000));
    this.log('info', `Move: ${action} for ${ms}ms`);

    // Toggles (no timer)
    if (action === 'sneak' || action === 'sprint') {
      const current = this.bot.getControlState ? this.bot.getControlState(action) : false;
      this.bot.setControlState(action, !current);
      this.log('info', `${action} -> ${!current ? 'ON' : 'OFF'}`);
      return true;
    }

    // Timed movements: clear conflicting movement first so the requested action is the only one active
    const conflicting = ['forward', 'back', 'left', 'right'];
    if (conflicting.includes(action)) {
      conflicting.forEach((c) => {
        if (c !== action) this.bot.setControlState(c, false);
      });
    }

    this.bot.setControlState(action, true);
    this._moveTimers = this._moveTimers || {};
    if (this._moveTimers[action]) clearTimeout(this._moveTimers[action]);
    this._moveTimers[action] = setTimeout(() => {
      if (this.bot) this.bot.setControlState(action, false);
      this._moveTimers[action] = null;
    }, ms);
    return true;
  }

  stopAllMovement() {
    if (!this.bot || this.status !== 'online') return false;
    if (this._moveTimers) {
      for (const k of Object.keys(this._moveTimers)) {
        if (this._moveTimers[k]) clearTimeout(this._moveTimers[k]);
        this._moveTimers[k] = null;
      }
    }
    this.bot.clearControlStates();
    this.log('info', 'All movement stopped.');
    return true;
  }

  look(direction, degrees) {
    if (!this.bot || this.status !== 'online' || !this.bot.entity) return false;
    const deg = Math.max(-180, Math.min(180, parseFloat(degrees) || 0));
    const rad = (deg * Math.PI) / 180;
    const cur = this.bot.entity.yaw;
    const curPitch = this.bot.entity.pitch;
    let yaw = cur, pitch = curPitch;
    if (direction === 'left')      yaw = cur + rad;
    else if (direction === 'right') yaw = cur - rad;
    else if (direction === 'up')    pitch = Math.max(-Math.PI/2, curPitch - rad);
    else if (direction === 'down')  pitch = Math.min(Math.PI/2, curPitch + rad);
    else if (direction === 'reset') { yaw = 0; pitch = 0; }
    this.bot.look(yaw, pitch, true);
    this.log('info', `Look: ${direction} ${deg}°`);
    return true;
  }

  attack() {
    if (!this.bot || this.status !== 'online') return false;
    this.bot.swingArm();
    const target = this.bot.nearestEntity((e) => e.type === 'mob' || e.type === 'player' && e.username !== this.bot.username);
    if (target) {
      this.bot.attack(target);
      this.log('info', `Attacked ${target.username || target.name || 'entity'}`);
    } else {
      this.log('info', 'Swing (no target nearby)');
    }
    return true;
  }

  dropItem() {
    if (!this.bot || this.status !== 'online') return false;
    const item = this.bot.heldItem;
    if (!item) {
      this.log('warn', 'No item in hand to drop.');
      return false;
    }
    this.bot.tossStack(item).catch((e) => this.log('error', `Drop failed: ${e.message}`));
    this.log('info', `Dropped: ${item.name}`);
    return true;
  }

  goto(x, y, z) {
    if (!this.bot || this.status !== 'online') {
      this.log('warn', 'Cannot go to: bot is not online.');
      return false;
    }
    if (!this.bot.pathfinder) {
      this.log('warn', 'Pathfinder not loaded.');
      return false;
    }
    const fx = parseFloat(x), fy = parseFloat(y), fz = parseFloat(z);
    if (isNaN(fx) || isNaN(fy) || isNaN(fz)) {
      this.log('warn', 'Invalid coordinates.');
      return false;
    }
    try {
      const mcData = require('minecraft-data')(this.bot.version);
      const movements = new Movements(this.bot, mcData);
      this.bot.pathfinder.setMovements(movements);
      this.bot.pathfinder.setGoal(new goals.GoalNear(fx, fy, fz, 1));
      this.log('info', `Going to ${fx.toFixed(1)}, ${fy.toFixed(1)}, ${fz.toFixed(1)}...`);
      return true;
    } catch (e) {
      this.log('error', `Pathfinder error: ${e.message}`);
      return false;
    }
  }

  stopGoto() {
    if (!this.bot || !this.bot.pathfinder) return false;
    try {
      this.bot.pathfinder.setGoal(null);
      this._followingPlayer = null;
      this.log('info', 'Pathfinding stopped.');
      try { this.bot.chat('Stopped.'); } catch (_) {}
      return true;
    } catch (e) {
      return false;
    }
  }

  eat() {
    if (!this.bot || this.status !== 'online' || !this.bot.autoEat) {
      this.log('warn', 'Cannot eat: bot offline or auto-eat not loaded.');
      return false;
    }
    try {
      if (this.bot.autoEat.eat) {
        this.bot.autoEat.eat().then(() => this.log('info', 'Manual eat done.')).catch((e) => this.log('warn', `Eat failed: ${e.message}`));
      } else if (this.bot.autoEat.enable) {
        this.bot.autoEat.enable();
        this.log('info', 'Auto-eat enabled.');
      }
      return true;
    } catch (e) {
      this.log('error', `Eat error: ${e.message}`);
      return false;
    }
  }

  getInventory() {
    if (!this.bot || !this.bot.inventory) return null;
    const items = this.bot.inventory.items().map((it) => ({
      slot: it.slot,
      name: it.name,
      displayName: it.displayName,
      count: it.count,
    }));
    const heldSlot = this.bot.quickBarSlot;
    const held = this.bot.heldItem ? {
      name: this.bot.heldItem.name,
      displayName: this.bot.heldItem.displayName,
      count: this.bot.heldItem.count,
    } : null;
    return { items, heldSlot, held };
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
      experience: this.bot && this.bot.experience ? { level: this.bot.experience.level, points: this.bot.experience.points } : null,
      gameMode: this.bot ? this.bot.game && this.bot.game.gameMode : null,
      inventory: this.getInventory(),
      viewerReady: !!this._viewerStarted,
      flying: !!this._flying,
      following: this._followingPlayer || null,
    };
  }
}

module.exports = BotManager;
