# 24 Aternos

A Minecraft anti-AFK bot for Aternos-hosted servers, originally by Fortcote. The repo contains two independent implementations of the same idea:

- **JS** (`JS/bot.js`) — Headless Node.js script using [mineflayer](https://github.com/PrismarineJS/mineflayer). Suitable for running on a server/host.
- **Python** (`Python/main.py`) — Tkinter desktop GUI that wraps the same mineflayer logic via the `javascript` bridge package. Requires a graphical display.

## Project Layout

```
JS/
  bot.js          # Standalone Node.js bot
  package.json
Python/
  main.py         # Tkinter GUI bot
  config.ini      # Server host/port and bot credentials
  forest-dark.tcl # Tk theme
IMG/              # README images
requirements.txt  # (Python deps — most are stdlib and not actually installable)
```

## Replit Environment

The project now ships with an Express-based web control panel for the JS bot. The Tkinter Python version still exists for local desktop use but is not run on Replit (headless container).

- **Workflow**: `Start application` → `node JS/server.js` on port 5000 (webview)
- **Web UI**: Edit config, start/stop the bot, send chat, watch live logs.
- **Node modules**: `mineflayer`, `express` installed under `JS/node_modules/`.

### JS file map

```
JS/
  server.js       # Express HTTP + SSE API, serves /public
  botManager.js   # Mineflayer wrapper: connect, reconnect, AntiAFK, chat
  bot.js          # Original standalone CLI script (kept for reference)
  config.json     # Persisted bot config (edited via the web UI)
  public/
    index.html    # Control panel UI (Arabic, RTL)
    style.css
    app.js        # Frontend logic + EventSource log stream
```

### REST / SSE endpoints

| Method | Path             | Purpose                                  |
| ------ | ---------------- | ---------------------------------------- |
| GET    | /api/config      | Read current config                      |
| POST   | /api/config      | Save config (merged into config.json)    |
| GET    | /api/status      | Snapshot: status, health, food, position |
| POST   | /api/start       | Connect with current config              |
| POST   | /api/stop        | Disconnect and disable auto-reconnect    |
| POST   | /api/chat        | Send a chat message / command            |
| POST   | /api/anti-afk    | Toggle AntiAFK controls                  |
| POST   | /api/move        | Manual movement (forward/back/left/right/jump/sneak/sprint) |
| POST   | /api/move-stop   | Clear all movement controls              |
| POST   | /api/look        | Rotate view (up/down/left/right/reset)   |
| POST   | /api/attack      | Attack nearest entity                    |
| POST   | /api/drop        | Drop currently held item                 |
| POST   | /api/goto        | Pathfind to {x,y,z}                      |
| POST   | /api/goto-stop   | Cancel pathfinding                       |
| POST   | /api/eat         | Trigger auto-eat manually                |
| POST   | /api/ping        | Probe MOTD/version of a host:port        |
| GET    | /api/events      | Server-Sent Events: log + status stream  |
| ANY    | /viewer/*        | Reverse proxy → prismarine-viewer (port 3007), WebSocket-enabled |

## Using the Bot

1. Open the web preview.
2. In **إعدادات السيرفر** set Host (e.g. `myserver.aternos.me`), Port, Username, Auth, and (optionally) register/login commands.
3. Click **حفظ الإعدادات**.
4. Click **تشغيل** — watch logs in the bottom panel.
5. Use **AntiAFK ON/OFF** or send chat from the input box.

In-game chat commands handled by the bot: `;start`, `;stop`, `;pos`.

## Recent Changes

- 2026-04-29 (initial): Imported from GitHub, installed `mineflayer`, ran `bot.js` as console workflow.
- 2026-04-29 (web UI): Added Express server, BotManager wrapper, and an Arabic RTL control panel served on port 5000. Workflow switched to `node JS/server.js`.
- 2026-04-30 (movement controls): Added D-pad movement, sneak/sprint toggles, look controls, attack, drop, and ping/MOTD probe. Fixed bot auto-walking on spawn via `autoStartAntiAfk` flag (default false).
- 2026-04-30 (full feature pack): Added prismarine-viewer 3D first-person view (proxied at `/viewer/*` with WebSocket upgrade), inventory/hotbar grid with held-item highlighting, online players list, mineflayer-pathfinder for "go to coordinates", and mineflayer-auto-eat for hunger management. System libs `cairo`, `pango`, `libjpeg`, `giflib`, `librsvg`, `pixman`, `libuuid` added for the native `canvas` dependency.
