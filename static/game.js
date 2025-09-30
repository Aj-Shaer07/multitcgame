// static/game.js
// Camera-follow + smooth movement + dark UI client for Territory Control

let ws = null;
let playerId = null;
let grid = [];
let players = {};
let gridW = 30, gridH = 20;
let roundNum = 1;
let timeLeft = 120;
let roundDuration = 120;

const CELL_SIZE = 20;

// DOM elements
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const roundInfo = document.getElementById("roundInfo");
const timerInfo = document.getElementById("timerInfo");
const scoreInfo = document.getElementById("scoreInfo");
const leaderboardList = document.getElementById("leaderboardList");
const timerBar = document.getElementById("timerBar");
const nameInput = document.getElementById("nameInput");
const renameBtn = document.getElementById("renameBtn");

// camera smoothing
let smoothX = 0, smoothY = 0;
let loopStarted = false;

// Utility: safe init grid if missing
function ensureGrid(w, h) {
  if (!Array.isArray(grid) || grid.length !== h) {
    grid = Array.from({ length: h }, () => Array(w).fill(null));
  } else {
    // ensure each row length
    for (let y = 0; y < h; y++) {
      if (!Array.isArray(grid[y]) || grid[y].length !== w) {
        grid[y] = Array(w).fill(null);
      }
    }
  }
}

// WebSocket connect
function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${location.host}/ws`;
  console.log("Connecting to", url);
  ws = new WebSocket(url);

  ws.addEventListener("open", () => {
    console.log("WebSocket open");
  });

  ws.addEventListener("message", (ev) => {
    try {
      const data = JSON.parse(ev.data);
      handleMessage(data);
    } catch (err) {
      console.error("Invalid WS message", err, ev.data);
    }
  });

  ws.addEventListener("close", () => {
    console.warn("WebSocket closed — reconnecting in 1.5s...");
    showAlert("Disconnected — reconnecting...");
    setTimeout(connect, 1500);
  });

  ws.addEventListener("error", (e) => {
    console.error("WebSocket error", e);
  });
}

// Handle incoming server messages
function handleMessage(data) {
  switch (data.type) {
    case "welcome":
      onWelcome(data);
      break;
    case "state":
      onState(data);
      break;
    case "cells":
      onCells(data);
      break;
    case "players":
      onPlayers(data);
      break;
    case "trail":
      onTrail(data);
      break;
    case "alert":
      showAlert(data.msg);
      break;
    default:
      // ignore
      break;
  }
}

function onWelcome(data) {
  playerId = data.player_id;
  gridW = data.grid_w ?? gridW;
  gridH = data.grid_h ?? gridH;
  grid = data.grid ?? grid;
  players = data.players ?? players;
  roundNum = data.round ?? roundNum;
  timeLeft = data.time_left ?? timeLeft;
  roundDuration = data.time_left ?? roundDuration;

  ensureGrid(gridW, gridH);
  initPlayersPx();
  resizeCanvas();
  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(gameLoop);
  }
  updateUI();
  console.log("Welcome:", playerId, gridW, gridH);
}

function onState(data) {
  grid = data.grid ?? grid;
  players = data.players ?? players;
  roundNum = data.round ?? roundNum;
  timeLeft = data.time_left ?? timeLeft;
  ensureGrid(gridW, gridH);
  initPlayersPx();
  updateUI();
}

function onCells(data) {
  if (!data.cells) return;
  data.cells.forEach(c => {
    if (c.y >= 0 && c.y < gridH && c.x >= 0 && c.x < gridW) {
      grid[c.y][c.x] = c.owner;
    }
  });
}

function onPlayers(data) {
  players = data.players ?? players;
  initPlayersPx();
  updateUI();
}

function onTrail(data) {
  if (!data) return;
  const pid = data.pid;
  if (!players[pid]) {
    // create placeholder if we haven't seen player yet
    players[pid] = { x: 0, y: 0, name: pid, color: "#888", score: 0, trail: [] };
  }
  players[pid].trail = data.trail ?? [];
}

// Ensure each player object has px/py for smooth rendering
function initPlayersPx() {
  for (const pid of Object.keys(players)) {
    const p = players[pid];
    if (p == null) continue;
    if (typeof p.x !== "number") p.x = 0;
    if (typeof p.y !== "number") p.y = 0;
    if (typeof p.px !== "number") p.px = p.x * CELL_SIZE + CELL_SIZE / 2;
    if (typeof p.py !== "number") p.py = p.y * CELL_SIZE + CELL_SIZE / 2;
    if (!Array.isArray(p.trail)) p.trail = [];
    if (!p.color) p.color = "#888";
  }
  // initialize camera smoothing to our player if available
  if (playerId && players[playerId]) {
    smoothX = players[playerId].x;
    smoothY = players[playerId].y;
  }
}

// Resize canvas to window size (leave some top bar space)
function resizeCanvas() {
  // leave about 140px for UI on top and sidebar if any
  canvas.width = window.innerWidth;
  canvas.height = Math.max(200, window.innerHeight - 140);
}
window.addEventListener("resize", resizeCanvas);

// Rendering and game loop
function gameLoop() {
  render();
  requestAnimationFrame(gameLoop);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!playerId || !players[playerId]) {
    // draw empty board center
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#999";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Waiting for server / player data...", canvas.width / 2, canvas.height / 2);
    return;
  }

  // Smooth camera follow
  smoothX += (players[playerId].x - smoothX) * 0.12;
  smoothY += (players[playerId].y - smoothY) * 0.12;
  const cameraX = smoothX * CELL_SIZE - canvas.width / 2;
  const cameraY = smoothY * CELL_SIZE - canvas.height / 2;

  // visible range in grid coords
  let startX = Math.floor(cameraX / CELL_SIZE) - 1;
  let startY = Math.floor(cameraY / CELL_SIZE) - 1;
  let endX = Math.ceil((cameraX + canvas.width) / CELL_SIZE) + 1;
  let endY = Math.ceil((cameraY + canvas.height) / CELL_SIZE) + 1;
  startX = Math.max(0, startX);
  startY = Math.max(0, startY);
  endX = Math.min(gridW, endX);
  endY = Math.min(gridH, endY);

  // draw tiles
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const owner = grid[y] && grid[y][x];
      const screenX = x * CELL_SIZE - cameraX;
      const screenY = y * CELL_SIZE - cameraY;

      if (owner && players[owner]) {
        ctx.fillStyle = players[owner].color;
        ctx.fillRect(screenX, screenY, CELL_SIZE, CELL_SIZE);
      } else {
        ctx.fillStyle = "#131313";
        ctx.fillRect(screenX, screenY, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX + 0.5, screenY + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
      }
    }
  }

  // draw trails (draw behind players)
  for (const pid in players) {
    const p = players[pid];
    if (!p.trail) continue;
    ctx.fillStyle = p.color;
    p.trail.forEach(coord => {
      const [tx, ty] = coord;
      // only draw if visible
      if (tx >= startX && tx < endX && ty >= startY && ty < endY) {
        const sx = tx * CELL_SIZE - cameraX + 4;
        const sy = ty * CELL_SIZE - cameraY + 4;
        const s = Math.max(4, CELL_SIZE - 12);
        ctx.fillRect(sx, sy, s, s);
      }
    });
  }

  // draw players (on top)
  for (const pid in players) {
    const p = players[pid];
    // ensure px/py exist in pixels
    if (typeof p.px !== "number") p.px = p.x * CELL_SIZE + CELL_SIZE / 2;
    if (typeof p.py !== "number") p.py = p.y * CELL_SIZE + CELL_SIZE / 2;

    // lerp px/py toward target pixel position
    const targetPx = p.x * CELL_SIZE + CELL_SIZE / 2;
    const targetPy = p.y * CELL_SIZE + CELL_SIZE / 2;
    p.px += (targetPx - p.px) * 0.22;
    p.py += (targetPy - p.py) * 0.22;

    // compute screen pos
    const screenX = p.px - cameraX;
    const screenY = p.py - cameraY;

    // circle
    ctx.beginPath();
    ctx.arc(screenX, screenY, Math.max(6, CELL_SIZE * 0.4), 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffffcc";
    ctx.stroke();

    // name
    ctx.fillStyle = "#fff";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(p.name || "Player", screenX, screenY - (CELL_SIZE * 0.6));
  }

  // small HUD crosshair on center (optional)
  // ctx.strokeStyle = "rgba(255,255,255,0.06)";
  // ctx.strokeRect(canvas.width/2 - 10, canvas.height/2 - 10, 20, 20);
}

// UI update (DOM)
function updateUI() {
  roundInfo.textContent = `Round: ${roundNum}`;
  timerInfo.textContent = `⏱ ${timeLeft}s`;

  if (playerId && players[playerId]) {
    scoreInfo.textContent = `Tiles: ${players[playerId].score ?? 0}`;
  }

  // timer bar
  if (roundDuration > 0) {
    const pct = Math.max(0, Math.min(1, timeLeft / roundDuration));
    timerBar.style.width = (pct * 100) + "%";
  }

  // leaderboard
  leaderboardList.innerHTML = "";
  const ranking = Object.entries(players)
    .map(([pid, p]) => ({ pid, ...p }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  for (const entry of ranking) {
    const li = document.createElement("li");
    li.className = entry.pid === playerId ? "me" : "";
    li.innerHTML = `<span class="badge" style="background:${entry.color}"></span>
                    <span class="lb-name">${escapeHtml(entry.name || entry.pid)}</span>
                    <span class="lb-score">${entry.score || 0}</span>`;
    leaderboardList.appendChild(li);
  }
}

// Simple safe escape
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Alerts (floating)
function showAlert(msg) {
  const el = document.createElement("div");
  el.className = "floating-alert";
  el.innerText = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("show"), 20);
  setTimeout(() => el.classList.remove("show"), 2900);
  setTimeout(() => el.remove(), 3200);
}

// Input handling
const keysAllowed = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d"]);
document.addEventListener("keydown", (e) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const k = e.key;
  let dx = 0, dy = 0;
  if (k === "ArrowUp" || k === "w") dy = -1;
  else if (k === "ArrowDown" || k === "s") dy = 1;
  else if (k === "ArrowLeft" || k === "a") dx = -1;
  else if (k === "ArrowRight" || k === "d") dx = 1;
  if (dx || dy) {
    try { ws.send(JSON.stringify({ type: "move", dx, dy })); }
    catch (err) { console.error("WS send error", err); }
    e.preventDefault();
  }
});

// Rename button
renameBtn?.addEventListener("click", () => {
  const name = (nameInput?.value || "").trim();
  if (!name || !ws || ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify({ type: "rename", name })); }
  catch (err) { console.error("WS send rename failed", err); }
});

// Start
ensureGrid(gridW, gridH);
resizeCanvas();
connect();
requestAnimationFrame(gameLoop);
