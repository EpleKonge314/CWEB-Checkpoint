// =============================== 
// 🧩 Core Setup
// ===============================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const PLAYER_NAME = localStorage.getItem("USERNAME") || "Anonymous";
const username = PLAYER_NAME; // alias kept for compatibility

// Game entities
const powerups = [];
const enemies = [];
const enemiesFast = [];
const enemiesSlow = [];
const coins = [];

let shieldActive = false;
let invincible = false;
let invincibleTimer = null;
let gameStart = null;
let gameOver = false;
let paused = false;
let rafId = null;
let spawnIntervalId = null;
let pauseStart = 0;
let totalPausedTime = 0;
let survivalTime = 0;
let lastGreenSpawn = 0;
let coinCount = 0;

// Player setup
const player = {
  x: canvas.width / 2 - 25,
  y: canvas.height / 2 - 25,
  width: 25,
  height: 25,
  speed: 7,
  dx: 0,
  dy: 0
};

// ===============================
// 🎨 Skins and Assets
// ===============================
let playerSkinImg = null;
let enemySkinImg = null;

async function loadEquippedSkins() {
  try {
    const res = await fetch(`/api/shop/user?username=${encodeURIComponent(PLAYER_NAME)}`);
    const data = await res.json();
    const resItems = await fetch("/api/shop/items");
    const items = await resItems.json();

    if (data.player_skin && data.player_skin !== "default") {
      const skinItem = items.find(i => i.key === data.player_skin);
      if (skinItem?.img) {
        playerSkinImg = new Image();
        playerSkinImg.src = skinItem.img;
      }
    }
    if (data.enemy_skin && data.enemy_skin !== "default") {
      const skinItem = items.find(i => i.key === data.enemy_skin);
      if (skinItem?.img) {
        enemySkinImg = new Image();
        enemySkinImg.src = skinItem.img;
      }
    }
  } catch (err) {
    console.error("Error loading skins:", err);
  }
}

// ===============================
// 🧱 Canvas Config
// ===============================
canvas.tabIndex = 0;
canvas.focus();
canvas.addEventListener('click', () => canvas.focus());

// NOTE: `chosenName` may be defined externally (keep for compatibility)
if (typeof chosenName !== "undefined") {
  localStorage.setItem("USERNAME", chosenName);
}

// ===============================
// 👾 Enemy Creation & Spawning
// ===============================
function createEnemy(type = 'normal') {
  let size, speed, color;
  switch (type) {
    case 'fast': speed = 5; color = 'pink'; size = 10; break;
    case 'slow': speed = 2; color = 'green'; size = 75; break;
    default: speed = 3; color = 'red'; size = 15;
  }

  const edge = Math.floor(Math.random() * 4);
  let x, y;
  switch (edge) {
    case 0: x = Math.random() * canvas.width; y = -size; break;
    case 1: x = canvas.width + size; y = Math.random() * canvas.height; break;
    case 2: x = Math.random() * canvas.width; y = canvas.height + size; break;
    default: x = -size; y = Math.random() * canvas.height; break;
  }

  return { x, y, width: size, height: size, speed, color };
}

// ===============================
// 💰 Coins
// ===============================
async function playerGotCoin(username, amount = 1) {
  try {
    const res = await fetch("/api/coins/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, coins: amount })
    });
    const data = await res.json();
    if (data.success) {
      console.log(`💰 Added ${amount} coin(s). New total: ${data.coins}`);
      localStorage.setItem("COINS", data.coins);
    } else {
      console.warn("❌ Coin add failed:", data);
    }
  } catch (err) {
    console.error("🚨 API Error adding coin:", err);
  }
}

// Called when focus returns (refreshes shop coin display externally)
window.addEventListener("focus", () => {
  const username = localStorage.getItem("USERNAME") || "Anonymous";
  if (typeof updateCoinDisplay === "function") updateCoinDisplay(username);
});

function createCoin() {
  const x = Math.random() * (canvas.width - 10) + 5;
  const y = Math.random() * (canvas.height - 10) + 5;
  return { x, y, radius: 6, collected: false };
}

function spawnCoin() {
  if (gameOver || paused) return;
  if (coins.length < 10) coins.push(createCoin());
  setTimeout(spawnCoin, 5000 + Math.random() * 5000);
}

function checkCoinCollisions() {
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    const dist = Math.hypot(
      (player.x + player.width / 2) - c.x,
      (player.y + player.height / 2) - c.y
    );
    if (dist < c.radius + player.width / 2) {
      coins.splice(i, 1);
      coinCount++;
      showAnnouncement(`+1 Coin (Total: ${coinCount})`);
      playerGotCoin(PLAYER_NAME, 1);
    }
  }
}

// ===============================
// ✨ Announcements
// ===============================
function showAnnouncement(text) {
  const msg = document.createElement('div');
  msg.textContent = text;
  Object.assign(msg.style, {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(0,0,0,0.7)',
    color: 'white',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '24px',
    zIndex: 5000
  });
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
}

// ===============================
// ⚙️ Enemy Behavior
// ===============================
function spawnEnemyAtEdge() {
  const elapsed = gameStart ? (performance.now() - gameStart - totalPausedTime) / 1000 : 0;
  let multiplier = 1;
  if (elapsed >= 300) multiplier = 10;
  else if (elapsed >= 60) multiplier = 3;
  else if (elapsed >= 30) multiplier = 2;

  for (let i = 0; i < multiplier; i++) enemies.push(createEnemy('normal'));

  if (elapsed >= 50 && elapsed < 50.2) showAnnouncement('Fast enemies incoming!');
  if (elapsed >= 100 && elapsed < 100.2) showAnnouncement('Heavy enemies incoming!');

  if (elapsed >= 50) enemiesFast.push(createEnemy('fast'));
  if (elapsed >= 100) {
    const intervals = Math.floor((elapsed - 100) / 100) + 1;
    while (enemiesSlow.length < intervals) {
      enemiesSlow.push(createEnemy('slow'));
      lastGreenSpawn = elapsed;
    }
  }
}

// ===============================
// 🧍 Movement & Collision
// ===============================
function updatePlayer() {
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x + player.dx));
  player.y = Math.max(0, Math.min(canvas.height - player.height, player.y + player.dy));
}

function moveEnemies(list) {
  for (const e of list) {
    const dx = (player.x + player.width / 2) - (e.x + e.width / 2);
    const dy = (player.y + player.height / 2) - (e.y + e.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    e.x += (dx / dist) * e.speed;
    e.y += (dy / dist) * e.speed;
  }
}

function rectsOverlap(a, b) {
  return !(a.x + a.width < b.x || a.x > b.x + b.width || a.y + a.height < b.y || a.y > b.y + b.height);
}

function checkCollisions() {
  const all = [...enemies, ...enemiesFast, ...enemiesSlow];
  return all.some(e => rectsOverlap(player, e));
}

// ===============================
// ⚡ Powerups
// ===============================
function createPowerup(type) {
  const x = Math.random() * (canvas.width - 30);
  const y = Math.random() * (canvas.height - 30);
  return { x, y, type, radius: 15, pulse: 0, opacity: 1, spawnTime: performance.now() };
}

function getPowerupSpawnChance() {
  const elapsed = gameStart ? (performance.now() - gameStart - totalPausedTime) / 1000 : 0;
  if (elapsed > 180) return 0.7;
  if (elapsed > 60) return 0.5;
  return 0.3;
}

function pickPowerupType() {
  const elapsed = gameStart ? (performance.now() - gameStart - totalPausedTime) / 1000 : 0;
  let shieldBias = 0.5;
  if (elapsed > 60 && elapsed <= 120) shieldBias = 0.65;
  if (elapsed > 120) shieldBias = 0.4;
  return Math.random() < shieldBias ? 'shield' : 'bomb';
}

function spawnPowerup() {
  if (gameOver || paused || !gameStart) return;
  if (Math.random() > getPowerupSpawnChance()) return;
  powerups.push(createPowerup(pickPowerupType()));
}

function scheduleNextPowerup() {
  if (gameOver || paused) return;
  const elapsed = gameStart ? (performance.now() - gameStart - totalPausedTime) / 1000 : 0;
  let baseDelay = elapsed > 180 ? 15000 : elapsed > 60 ? 20000 : 25000;
  spawnPowerup();
  setTimeout(scheduleNextPowerup, baseDelay + Math.random() * 5000);
}

function updatePowerups() {
  const now = performance.now();
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    const age = (now - p.spawnTime) / 1000;
    if (age > 10) {
      p.opacity -= 0.05;
      if (p.opacity <= 0) powerups.splice(i, 1);
    }
    p.pulse += 0.1;
  }
}

function checkPowerupCollisions() {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    const dist = Math.hypot(
      (player.x + player.width / 2) - p.x,
      (player.y + player.height / 2) - p.y
    );
    if (dist < p.radius + player.width / 2) {
      if (p.type === 'shield') {
        shieldActive = true;
        showAnnouncement('Shield Activated!');
      } else if (p.type === 'bomb') {
        enemies.length = enemiesFast.length = enemiesSlow.length = 0;
        showAnnouncement('BOOM! Enemies Cleared!');
      }
      powerups.splice(i, 1);
    }
  }
}

// ===============================
// 🧠 Invincibility
// ===============================
function startInvincibility(duration) {
  clearTimeout(invincibleTimer);
  invincible = true;
  let flicker = true;
  const flickerInterval = setInterval(() => {
    flicker = !flicker;
    ctx.globalAlpha = flicker ? 0.5 : 1;
  }, 100);
  invincibleTimer = setTimeout(() => {
    invincible = false;
    clearInterval(flickerInterval);
    ctx.globalAlpha = 1;
  }, duration);
}

// ===============================
// 🖼️ Drawing & HUD
// ===============================
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Player
  if (playerSkinImg?.complete)
    ctx.drawImage(playerSkinImg, player.x, player.y, player.width, player.height);
  else {
    ctx.fillStyle = 'blue';
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }

  // Enemies
  for (const list of [enemies, enemiesFast, enemiesSlow]) {
    for (const e of list) {
      if (enemySkinImg?.complete)
        ctx.drawImage(enemySkinImg, e.x, e.y, e.width, e.height);
      else {
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y, e.width, e.height);
      }
    }
  }

  // Coins
  for (const c of coins) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'yellow';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'gold';
    ctx.stroke();
  }

  // Powerups
  for (const p of powerups) {
    const scale = 1 + Math.sin(p.pulse) * 0.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * scale, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle =
      p.type === 'shield'
        ? `rgba(173, 216, 230, ${p.opacity})`
        : `rgba(255, 165, 0, ${p.opacity})`;
    ctx.stroke();
  }

  // Shield
  if (shieldActive) {
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, player.y + player.height / 2, player.width, 0, Math.PI * 2);
    ctx.strokeStyle = 'lightblue';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function updateHud() {
  const timerEl = document.getElementById('timer');
  const coinEl = document.getElementById('coinCounter');
  if (timerEl) {
    const t = gameOver ? survivalTime : (gameStart ? (performance.now() - gameStart - totalPausedTime) / 1000 : 0);
    timerEl.textContent = `${t.toFixed(2)}s`;
  }
  if (coinEl) coinEl.textContent = `Coins: ${coinCount}`;
}

// ===============================
// ☠️ Game Over & Reset
// ===============================
function showGameOverOverlay() {
  const container = document.getElementById('gameContainer') || document.body;
  const shade = document.createElement('div');
  shade.id = 'gameShade';
  container.appendChild(shade);

  const box = document.createElement('div');
  box.id = 'gameOverBox';
  box.innerHTML = `
    <div class="title">Game Over</div>
    <div class="survivedText">Survived: ${survivalTime.toFixed(2)}s</div>
    <button id="playAgainOverlay">Play Again</button>`;
  container.appendChild(box);

  document.getElementById('playAgainOverlay').addEventListener('click', async () => {
    shade.remove();
    box.remove();
    await resetGame();
  });
}

// ===============================
// 🔁 Game Loop
// ===============================
function gameLoop() {
  if (!gameStart) gameStart = performance.now();

  if (!gameOver && !paused) {
    updatePlayer();
    updatePowerups();
    checkPowerupCollisions();
    checkCoinCollisions();

    moveEnemies(enemies);
    moveEnemies(enemiesFast);
    moveEnemies(enemiesSlow);

    if (checkCollisions()) {
      if (invincible) {
        // Ignore
      } else if (shieldActive) {
        shieldActive = false;
        invincible = true;
        showAnnouncement('Shield Absorbed the Hit!');
        startInvincibility(1000);
      } else {
        gameOver = true;
        survivalTime = (performance.now() - gameStart - totalPausedTime) / 1000;
        clearInterval(spawnIntervalId);
        sendScore(survivalTime);
        showGameOverOverlay();
        return;
      }
    }

    draw();
    updateHud();
    rafId = requestAnimationFrame(gameLoop);
  }
}

// ===============================
// 🎮 Controls
// ===============================
window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','Escape'].includes(e.key))
    e.preventDefault();
});

canvas.addEventListener('keydown', e => {
  if (gameOver) return;
  switch (e.key) {
    case 'ArrowRight': case 'd': player.dx = player.speed; break;
    case 'ArrowLeft': case 'a': player.dx = -player.speed; break;
    case 'ArrowUp': case 'w': player.dy = -player.speed; break;
    case 'ArrowDown': case 's': player.dy = player.speed; break;
    case 'Escape': togglePause(); break;
  }
});

canvas.addEventListener('keyup', e => {
  if (['ArrowRight','ArrowLeft','d','a'].includes(e.key)) player.dx = 0;
  if (['ArrowUp','ArrowDown','w','s'].includes(e.key)) player.dy = 0;
});

// ===============================
// ⏸️ Pause & Reset
// ===============================
function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (paused) {
    pauseStart = performance.now();
    clearInterval(spawnIntervalId);
    cancelAnimationFrame(rafId);
  } else {
    totalPausedTime += performance.now() - pauseStart;
    spawnIntervalId = setInterval(spawnEnemyAtEdge, 10000);
    rafId = requestAnimationFrame(gameLoop);
  }
  updateHud();
}

async function resetGame() {
  enemies.length = enemiesFast.length = enemiesSlow.length = powerups.length = coins.length = 0;
  coinCount = 0;
  Object.assign(player, {
    x: canvas.width / 2 - player.width / 2,
    y: canvas.height / 2 - player.height / 2,
    dx: 0,
    dy: 0
  });
  gameStart = performance.now();
  gameOver = false;
  paused = false;
  totalPausedTime = 0;
  invincible = false;
  lastGreenSpawn = 0;
  pauseStart = 0;
  await loadEquippedSkins();
  spawnEnemyAtEdge();
  spawnIntervalId = setInterval(spawnEnemyAtEdge, 10000);
  rafId = requestAnimationFrame(gameLoop);
  canvas.focus();
    // Add button behavior //
  document.getElementById('playAgainOverlay').addEventListener('click', () => {
    shade.remove();
    box.remove();
    resetGame();
  });
}


// ===============================
// 📡 Score Sending
// ===============================
async function sendScore(time) {
  try {
    const res = await fetch('/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: PLAYER_NAME, survival_time: time })
    });
    if (!res.ok) console.error('Failed to send score');
  } catch (err) {
    console.error('Error sending score:', err);
  }
}

// ===============================
// 🚀 Start Game
// ===============================
async function startGame() {
  await loadEquippedSkins();
  spawnEnemyAtEdge();
  spawnIntervalId = setInterval(spawnEnemyAtEdge, 10000);
  rafId = requestAnimationFrame(gameLoop);
  setInterval(updateHud, 100);
  scheduleNextPowerup();
  spawnCoin();
}

startGame();
