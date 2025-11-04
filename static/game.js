// Core Setup //
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const powerups = [];
let shieldActive = false;
let invincible = false;
let invincibleTimer = null;

// Player //
const player = {
  x: canvas.width / 2 - 25,
  y: canvas.height / 2 - 25,
  width: 25,
  height: 25,
  speed: 7,
  dx: 0,
  dy: 0
};

canvas.tabIndex = 0;
canvas.focus();
canvas.addEventListener('click', () => canvas.focus());

// Enemies //
const enemies = [];
const enemiesFast = [];
const enemiesSlow = [];

// Game state //
let gameStart = null;
let gameOver = false;
let paused = false;
let rafId = null;
let spawnIntervalId = null;
let pauseStart = 0;
let totalPausedTime = 0;
let survivalTime = 0;
let lastGreenSpawn = 0;

// Enemy Creation & Spawning //
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
    case 0: x = Math.random() * canvas.width; y = 0; break;
    case 1: x = canvas.width - size; y = Math.random() * canvas.height; break;
    case 2: x = Math.random() * canvas.width; y = canvas.height - size; break;
    default: x = 0; y = Math.random() * canvas.height; break;
  }

  return { x, y, width: size, height: size, speed, color };
}

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

function spawnEnemyAtEdge() {
  const elapsed = (performance.now() - gameStart - totalPausedTime) / 1000;

  let multiplier = 1;
  if (elapsed >= 300) multiplier = 10;
  else if (elapsed >= 60) multiplier = 3;
  else if (elapsed >= 30) multiplier = 2;

  for (let i = 0; i < multiplier; i++) enemies.push(createEnemy('normal'));

  if (elapsed >= 50 && elapsed < 50.1) showAnnouncement('Fast enemies incoming!');
  if (elapsed >= 100 && elapsed < 100.1) showAnnouncement('Heavy enemies incoming!');

  if (elapsed >= 50) enemiesFast.push(createEnemy('fast'));

  if (elapsed >= 100) {
    const intervals = Math.floor((elapsed - 100) / 100) + 1;
    while (enemiesSlow.length < intervals) {
      enemiesSlow.push(createEnemy('slow'));
      lastGreenSpawn = elapsed;
    }
  }
}

// Movement & Collision //
function updatePlayer() {
  player.x += player.dx;
  player.y += player.dy;
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
  player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));
}

function moveEnemies(list, allEnemies) {
  for (const e of list) {
    const dx = (player.x + player.width / 2) - (e.x + e.width / 2);
    const dy = (player.y + player.height / 2) - (e.y + e.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    e.x += (dx / dist) * e.speed;
    e.y += (dy / dist) * e.speed;
    e.x = Math.max(0, Math.min(canvas.width - e.width, e.x));
    e.y = Math.max(0, Math.min(canvas.height - e.height, e.y));
  }

  const all = allEnemies.flat();
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
      const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist < (a.width + b.width) / 2) {
        const overlap = ((a.width + b.width) / 2 - dist) / 2;
        const nx = dx / dist || 0;
        const ny = dy / dist || 0;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
      }
    }
  }
}

function rectsOverlap(a, b) {
  return !(a.x + a.width < b.x ||
           a.x > b.x + b.width ||
           a.y + a.height < b.y ||
           a.y > b.y + b.height);
}

function checkCollisions() {
  return [...enemies, ...enemiesFast, ...enemiesSlow].some(e => rectsOverlap(player, e));
}

// Powerups (Adaptive) //
function createPowerup(type) {
  const x = Math.random() * (canvas.width - 30);
  const y = Math.random() * (canvas.height - 30);
  return {
    x, y,
    type,
    radius: 15,
    pulse: 0,
    opacity: 1,
    spawnTime: performance.now()
  };
}

function getPowerupSpawnChance() {
  const elapsed = (performance.now() - gameStart - totalPausedTime) / 1000;
  let baseChance = 0.3;
  if (elapsed > 180) baseChance = 0.7;
  else if (elapsed > 60) baseChance = 0.5;
  return baseChance;
}

function pickPowerupType() {
  const elapsed = (performance.now() - gameStart - totalPausedTime) / 1000;
  let shieldBias = 0.5;
  if (elapsed > 60 && elapsed <= 120) shieldBias = 0.65;
  if (elapsed > 120) shieldBias = 0.4;
  return Math.random() < shieldBias ? 'shield' : 'bomb';
}

function spawnPowerup() {
  if (gameOver || paused) return;
  const chance = Math.random();
  const spawnChance = getPowerupSpawnChance();
  if (chance > spawnChance) return;

  const type = pickPowerupType();
  powerups.push(createPowerup(type));
  console.log("Powerup spawned:", type);
}

function scheduleNextPowerup() {
  if (gameOver) return;
  const elapsed = (performance.now() - gameStart - totalPausedTime) / 1000;
  let baseDelay = 25000;
  if (elapsed > 180) baseDelay = 15000;
  else if (elapsed > 60) baseDelay = 20000;

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
      if (p.opacity <= 0) {
        powerups.splice(i, 1);
        continue;
      }
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

function drawPowerups() {
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
}

// Invincibility //
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

// Drawing & HUD //
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'blue';
  ctx.fillRect(player.x, player.y, player.width, player.height);

  for (const list of [enemies, enemiesFast, enemiesSlow]) {
    for (const e of list) {
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x, e.y, e.width, e.height);
    }
  }

  drawPowerups();

  if (shieldActive) {
    ctx.beginPath();
    ctx.arc(player.x + player.width / 2, player.y + player.height / 2, player.width, 0, Math.PI * 2);
    ctx.strokeStyle = 'lightblue';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  if (paused && !gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Paused', canvas.width / 2, canvas.height / 2);
  }
}

function updateHud() {
  const timerEl = document.getElementById('timer');
  if (!timerEl) return;
  const t = gameOver ? survivalTime : (performance.now() - gameStart - totalPausedTime) / 1000;
  timerEl.textContent = t.toFixed(2) + 's';
}

// Game Over Overlay //
function showGameOverOverlay() {
  const container = document.getElementById('gameContainer');
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

  document.getElementById('playAgainOverlay').addEventListener('click', () => {
    shade.remove();
    box.remove();
    resetGame();
  });
}

// Main Loop //
function gameLoop() {
  if (!gameStart) gameStart = performance.now();
  if (!gameOver && !paused) {
    updatePlayer();
    updatePowerups();
    checkPowerupCollisions();

    const allEnemies = [enemies, enemiesFast, enemiesSlow];
    moveEnemies(enemies, allEnemies);
    moveEnemies(enemiesFast, allEnemies);
    moveEnemies(enemiesSlow, allEnemies);

    if (checkCollisions()) {
      if (invincible) {
        // Ignore collisions during invincibility
      } else if (shieldActive) {
        shieldActive = false;
        invincible = true;
        showAnnouncement('Shield Absorbed the Hit!');
        startInvincibility(1000); // 1s of invincibility
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
  } else if (paused) {
    draw();
  }
}

// Controls //
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'Escape'].includes(e.key))
    e.preventDefault();
});

canvas.addEventListener('keydown', (e) => {
  if (gameOver) return;
  switch (e.key) {
    case 'ArrowRight':
    case 'd': player.dx = player.speed; break;
    case 'ArrowLeft':
    case 'a': player.dx = -player.speed; break;
    case 'ArrowUp':
    case 'w': player.dy = -player.speed; break;
    case 'ArrowDown':
    case 's': player.dy = player.speed; break;
    case 'Escape': e.preventDefault(); togglePause(); break;
  }
});

canvas.addEventListener('keyup', (e) => {
  if (['ArrowRight', 'ArrowLeft', 'd', 'a'].includes(e.key)) player.dx = 0;
  if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key)) player.dy = 0;
});

//  Pause & Reset //
function togglePause() {
  if (gameOver) return;
  paused = !paused;
  console.log("Pause toggled:", paused);

  if (paused) {
    pauseStart = performance.now();
    clearInterval(spawnIntervalId);
    cancelAnimationFrame(rafId);
    draw();
  } else {
    totalPausedTime += performance.now() - pauseStart;
    spawnIntervalId = setInterval(spawnEnemyAtEdge, 10000);
    rafId = requestAnimationFrame(gameLoop);
  }
  updateHud();
}

function resetGame() {
  document.getElementById('gameOverBox')?.remove();
  enemies.length = enemiesFast.length = enemiesSlow.length = powerups.length = 0;

  player.x = canvas.width / 2 - player.width / 2;
  player.y = canvas.height / 2 - player.height / 2;
  player.dx = 0;
  player.dy = 0;

  gameStart = performance.now();
  gameOver = false;
  paused = false;
  totalPausedTime = 0;
  lastGreenSpawn = 0;
  pauseStart = 0;
  invincible = false;

  spawnEnemyAtEdge();
  spawnIntervalId = setInterval(spawnEnemyAtEdge, 10000);
  rafId = requestAnimationFrame(gameLoop);
  canvas.focus();
}

// Score Sending //
async function sendScore(time) {
  try {
    const usernameEl = document.getElementById('usernameInput');
    const username = usernameEl ? usernameEl.value.trim() || 'Anonymous' : 'Anonymous';
    const res = await fetch('/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, survival_time: time })
    });
    if (!res.ok) console.error('Failed to send score');
  } catch (err) {
    console.error('Error sending score:', err);
  }
}

window.resetGame = resetGame;

// Start Game //
spawnEnemyAtEdge();
spawnIntervalId = setInterval(spawnEnemyAtEdge, 10000);
rafId = requestAnimationFrame(gameLoop);
setInterval(updateHud, 100);
scheduleNextPowerup();
