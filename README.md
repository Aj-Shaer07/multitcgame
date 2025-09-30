
---

# 🌍 Infinite Territory Control

A multiplayer **infinite tile-capturing game** inspired by tileman.io.
Built with ⚡ **Python (aiohttp + websockets)** and 🎨 **JavaScript Canvas**.
Players compete in real-time to **capture the most territory** before the round timer ends.

---

## ✨ Features

* 🌌 Infinite world that expands as players explore
* 🎥 Smooth camera follow for each player
* ⏱️ Round timer with automatic reset
* 🏆 Live leaderboard with scores
* 🌑 Dark themed UI with unique player colors
* ⚡ Lightweight async server using `aiohttp` + `websockets`

---

## 📂 Project Structure


server.py               # 🖥️ Game server (aiohttp + WebSocket)
templates/index.html    # 🌐 Main HTML entrypoint
static/game.js          # 🎮 Client logic (Canvas, WS, camera follow)
static/style.css        # 🎨 Dark themed styling
README.md               # 📖 This file


---

## 🚀 Setup and Run

Clone and start the server:

git clone https://github.com/yourusername/infinite-territory.git
cd infinite-territory

python3 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install aiohttp

python server.py

---

Open your browser and go to:
👉 [http://localhost:8080/](http://localhost:8080/)

---

## 🎮 Controls

⬆️  Arrow Up / W    → Move Up  
⬇️  Arrow Down / S  → Move Down  
⬅️  Arrow Left / A  → Move Left  
➡️  Arrow Right / D → Move Right  

Capture tiles by **looping around areas**
Your score = 🟦 number of tiles you own.

---

## ⚙️ Configuration

Edit values in "server.py":

ROUND_DURATION = 120   # ⏱️ round length in seconds
VISIBLE_RADIUS = 40    # 👁️ visible area around player

---

## 🛠️ Tech Stack

* 🐍 Python 3
* 🌐 aiohttp + websockets
* 🖼️ HTML5 + Canvas API
* 🎨 CSS (dark theme) + JavaScript

---

Would you like me to also design a **GitHub preview screenshot/banner section** (with placeholders like `![Game Preview](screenshot.png)`) so the repo looks visually appealing when someone visits?
