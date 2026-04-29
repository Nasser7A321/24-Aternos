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

This project is **not a web app** — there is no HTTP frontend or backend to preview. It's a long-running background process that connects to a remote Minecraft server.

- **Workflow**: `Start application` → `node JS/bot.js` (console output type)
- **Node modules**: `mineflayer` is installed under `JS/node_modules/`
- **Python**: The Tkinter GUI version is not run on Replit because the container is headless. Use the JS version here, or run the Python version locally.

## Configuring the Bot

Before the bot can do anything useful you must point it at a real Minecraft server (e.g. your Aternos server). Edit `JS/bot.js` and update:

```js
host: "your-server.aternos.me",
port: 25565,
username: "YourBotName",
```

Without a reachable server the workflow logs will repeat `ECONNREFUSED 127.0.0.1:25565` — that's expected until the host/port is set correctly.

In-game commands (handled by the bot):

- `;start` — enable AntiAFK (forward + jump + sprint)
- `;stop` — clear movement
- `;pos` — print position (Python version only)

## Recent Changes

- 2026-04-29: Imported from GitHub. Installed `mineflayer` for the JS variant and configured a console workflow to run `node JS/bot.js`.
