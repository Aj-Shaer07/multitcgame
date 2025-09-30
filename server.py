# server.py
import asyncio
import json
import os
import pickle
import random
import socket
from collections import deque
from aiohttp import web

# CONFIG
GRID_W, GRID_H = 30, 20
ROUND_DURATION = 120
SAVE_FILE = "game_state.pkl"
LEADERBOARD_FILE = "leaderboard.pkl"

COLORS = [
    "#e6194b", "#3cb44b", "#ffe119", "#4363d8",
    "#f58231", "#911eb4", "#46f0f0", "#f032e6",
    "#bcf60c", "#fabebe", "#008080", "#e6beff"
]

# STATE
grid = [[None for _ in range(GRID_W)] for _ in range(GRID_H)]
players = {}
clients = {}
leaderboard = {}
current_round = 1
round_time_left = ROUND_DURATION
_next_player_num = 1

# UTIL
def in_bounds(x, y):
    return 0 <= x < GRID_W and 0 <= y < GRID_H

def compute_scores():
    for p in players.values():
        p["score"] = 0
    for y in range(GRID_H):
        for x in range(GRID_W):
            owner = grid[y][x]
            if owner and owner in players:
                players[owner]["score"] += 1

# FLOOD FILL — overwrites everything inside loop (like tileman.io)
def flood_fill_enclosed(trail_coords, pid):
    if not trail_coords:
        return []

    trail_set = set(trail_coords)
    outside = set()
    q = deque()

    for x in range(GRID_W):
        if (x, 0) not in trail_set: q.append((x, 0))
        if (x, GRID_H-1) not in trail_set: q.append((x, GRID_H-1))
    for y in range(GRID_H):
        if (0, y) not in trail_set: q.append((0, y))
        if (GRID_W-1, y) not in trail_set: q.append((GRID_W-1, y))

    while q:
        x, y = q.popleft()
        if not in_bounds(x, y): continue
        if (x, y) in outside or (x, y) in trail_set: continue
        outside.add((x, y))
        for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]:
            nx, ny = x+dx, y+dy
            if in_bounds(nx, ny) and (nx, ny) not in outside:
                q.append((nx, ny))

    changed = []
    for y in range(GRID_H):
        for x in range(GRID_W):
            if (x, y) not in outside:
                if grid[y][x] != pid:
                    changed.append({"x": x, "y": y, "owner": pid})
                grid[y][x] = pid

    compute_scores()
    return changed

# NETWORK HELPERS
async def broadcast(data):
    dead = []
    for pid, ws in list(clients.items()):
        try:
            if not ws.closed:
                await ws.send_json(data)
            else:
                dead.append(pid)
        except:
            dead.append(pid)
    for pid in dead:
        await unregister(pid)

async def broadcast_state():
    await broadcast({
        "type": "state",
        "grid": grid,
        "players": players,
        "leaderboard": leaderboard,
        "round": current_round,
        "time_left": round_time_left
    })

async def broadcast_players():
    await broadcast({"type": "players", "players": players})

async def broadcast_cells(cells):
    if cells:
        await broadcast({"type": "cells", "cells": cells})

async def broadcast_trail(pid, trail):
    await broadcast({"type": "trail", "pid": pid, "trail": trail})

# REGISTER / UNREGISTER
async def register(ws):
    global _next_player_num
    pid = str(random.randint(1000, 9999))
    while pid in players:
        pid = str(random.randint(1000, 9999))

    name = f"Player{_next_player_num}"
    _next_player_num += 1
    used = {p["color"] for p in players.values()}
    available = [c for c in COLORS if c not in used]
    color = random.choice(available) if available else "#%06x" % random.randint(0, 0xFFFFFF)

    for _ in range(200):
        sx, sy = random.randrange(GRID_W), random.randrange(GRID_H)
        if grid[sy][sx] is None:
            break
    else:
        sx, sy = random.randrange(GRID_W), random.randrange(GRID_H)

    players[pid] = {"x": sx, "y": sy, "name": name, "color": color, "score": 0, "trail": []}
    clients[pid] = ws
    grid[sy][sx] = pid
    compute_scores()

    await ws.send_json({
        "type": "welcome",
        "player_id": pid,
        "color": color,
        "name": name,
        "grid_w": GRID_W,
        "grid_h": GRID_H,
        "grid": grid,
        "players": players,
        "leaderboard": leaderboard,
        "round": current_round,
        "time_left": round_time_left
    })
    await broadcast_players()
    await broadcast_cells([{"x": sx, "y": sy, "owner": pid}])
    return pid

async def unregister(pid):
    if pid in players:
        try: await broadcast_trail(pid, [])
        except: pass
        del players[pid]
    if pid in clients:
        try:
            if not clients[pid].closed:
                await clients[pid].close()
        except: pass
        del clients[pid]
    await broadcast_players()

# GAME LOOP
async def game_loop(app):
    global round_time_left, current_round
    while True:
        await asyncio.sleep(1)
        round_time_left -= 1
        if round_time_left <= 0:
            for pid, p in players.items():
                leaderboard[p["name"]] = leaderboard.get(p["name"], 0) + p.get("score", 0)
            for y in range(GRID_H):
                for x in range(GRID_W):
                    grid[y][x] = None
            for p in players.values():
                p["trail"] = []
                p["score"] = 0
                p["x"], p["y"] = random.randrange(GRID_W), random.randrange(GRID_H)
                grid[p["y"]][p["x"]] = pid
            current_round += 1
            round_time_left = ROUND_DURATION
        await broadcast_state()

# WS HANDLER
async def handle_ws(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    pid = await register(ws)
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                except: continue
                typ = data.get("type")
                if typ == "move" and pid in players:
                    dx, dy = int(data.get("dx", 0)), int(data.get("dy", 0))
                    if dx not in (-1,0,1) or dy not in (-1,0,1): continue
                    p = players[pid]
                    nx, ny = p["x"] + dx, p["y"] + dy
                    if not in_bounds(nx, ny): continue
                    p["x"], p["y"] = nx, ny
                    if grid[ny][nx] == pid and p["trail"]:
                        changed = flood_fill_enclosed(p["trail"], pid)
                        p["trail"] = []
                        if changed: await broadcast_cells(changed)
                        await broadcast_trail(pid, [])
                        await broadcast_players()
                        continue
                    if (nx, ny) in p["trail"]:
                        idx = p["trail"].index((nx, ny))
                        loop_segment = p["trail"][idx:]
                        changed = flood_fill_enclosed(loop_segment, pid)
                        p["trail"] = p["trail"][:idx]
                        if changed: await broadcast_cells(changed)
                        await broadcast_trail(pid, p["trail"])
                        await broadcast_players()
                        continue
                    if grid[ny][nx] is None:
                        if not p["trail"] or p["trail"][-1] != (nx, ny):
                            p["trail"].append((nx, ny))
                            await broadcast_trail(pid, p["trail"])
                        await broadcast_players()
                    else:
                        if grid[ny][nx] != pid:
                            grid[ny][nx] = pid
                            compute_scores()
                            await broadcast_cells([{"x": nx, "y": ny, "owner": pid}])
                            await broadcast_players()
    finally:
        await unregister(pid)
    return ws

# APP
async def on_startup(app):
    asyncio.create_task(game_loop(app))

app = web.Application()
app.router.add_get("/ws", handle_ws)
app.router.add_static("/static", path="static", name="static")
app.router.add_get("/", lambda request: web.FileResponse("index.html"))
app.on_startup.append(on_startup)

if __name__ == "__main__":
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]; s.close()
    except:
        local_ip = "127.0.0.1"
    print("Server running at:")
    print(f" ▶ Local:   http://localhost:8080")
    print(f" ▶ Network: http://{local_ip}:8080")
    web.run_app(app, host="0.0.0.0", port=8080)
