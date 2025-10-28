const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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


// Enemy groups //
const enemies = [];
const enemiesFast = [];
const enemiesSlow = [];

let gameStart = null;
let gameOver = false;
let paused = false;
let rafId = null;
let spawnIntervalId = null;
let pauseStart = 0;
let totalPausedTime = 0;
let survivalTime = 0;

// Enemy creation //
function createEnemy(type = 'normal') {
  let size;
  let speed;
  let color;

  switch (type) {
    case 'fast':
      speed = 5;
      color = 'pink';
      size = 10;
      break;
    case 'slow':
      speed = 2;
      color = 'green';
      size = 50;
      break;
    default:
      speed = 3;
      color = 'red';
      size = 15;
  }
let lastGreenSpawn = 0
  // Spawn at random edge //
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  switch (edge) {
    case 0: x = Math.random() * canvas.width; y = 0; break; // top //
    case 1: x = canvas.width - size; y = Math.random() * canvas.height; break; // right //
    case 2: x = Math.random() * canvas.width; y = canvas.height - size; break; // bottom //
    default: x = 0; y = Math.random() * canvas.height; break; // left //
  }

  return { x, y, width: size, height: size, speed, color };
}
if (!gameStart) gameStart = performance.now();

function spawnEnemyAtEdge() {
  const elapsed = (performance.now() - gameStart - totalPausedTime) / 1000;

  // Always spawn normal enemies //
  enemies.push(createEnemy('normal'));
  if (elapsed >= 50 && elapsed < 50 + 0.1) showAnnouncement('Fast enemies incoming!');
  if (elapsed >= 100 && elapsed < 100 + 0.1) showAnnouncement('Heavy enemies joined!');

  // After 50s, also spawn fast ones //
  if (elapsed >= 50) {
    enemiesFast.push(createEnemy('fast'));
  }

  // After 100s, start spawning slow ones every 100s //
  if (elapsed >= 100) {
    // How many 100s intervals have passed since 100s mark //
    const intervals = Math.floor((elapsed - 100) / 100) + 1;

    // Ensure the number of slow enemies matches intervals //
    while (enemiesSlow.length < intervals) {
      enemiesSlow.push(createEnemy('slow'));
      lastGreenSpawn = elapsed;
    }
  }
}
spawnIntervalId = setInterval(spawnEnemyAtEdge, 5000);

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



// Movement Controls //
window.addEventListener('keydown', (e) => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','Escape'].includes(e.key)) {
    e.preventDefault();
  }
});

document.addEventListener('keydown', (e) => {
  if (gameOver) return;

  if (e.key === 'ArrowRight' || e.key === 'd') player.dx = player.speed;
  if (e.key === 'ArrowLeft' || e.key === 'a') player.dx = -player.speed;
  if (e.key === 'ArrowUp' || e.key === 'w') player.dy = -player.speed;
  if (e.key === 'ArrowDown' || e.key === 's') player.dy = player.speed;

  // Pause toggle on ESC //
  if (e.key === 'Escape') {
    togglePause();
  }
});

document.addEventListener('keyup', (e) => {
  if (['ArrowRight', 'ArrowLeft', 'd', 'a'].includes(e.key)) player.dx = 0;
  if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key)) player.dy = 0;
});

// Updates //
function updatePlayer() {
  player.x += player.dx;
  player.y += player.dy;

  // keep inside canvas //
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
  player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));
}

function moveEnemies(list, allEnemies) {
  // Move enemies toward player //
  for (const e of list) {
    const dx = (player.x + player.width / 2) - (e.x + e.width / 2);
    const dy = (player.y + player.height / 2) - (e.y + e.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    e.x += (dx / dist) * e.speed;
    e.y += (dy / dist) * e.speed;

    // keep inside canvas//
    e.x = Math.max(0, Math.min(canvas.width - e.width, e.x));
    e.y = Math.max(0, Math.min(canvas.height - e.height, e.y));
  }

  // Prevent overlapping (enemy bumping)//
  const all = allEnemies.flat();
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];

      const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
      const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
      const dist = Math.hypot(dx, dy);

      // Only push apart if overlapping//
      if (dist < (a.width + b.width) / 2) {
        const overlap = ((a.width + b.width) / 2 - dist) / 2;
        const nx = dx / dist || 0;
        const ny = dy / dist || 0;

        // Move each enemy slightly apart//
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

// Drawing -not good enough an explaination, too tired, fix later- //
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Player //
  ctx.fillStyle = 'blue';
  ctx.fillRect(player.x, player.y, player.width, player.height);

  // Enemies //
  for (const list of [enemies, enemiesFast, enemiesSlow]) {
    for (const e of list) {
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x, e.y, e.width, e.height);
    }
  }

  // If paused, draw overlay text //
  if (paused && !gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Paused', canvas.width / 2, canvas.height / 2);
  }
}

// Game Loop //
function updateHud() {
  const timerEl = document.getElementById('timer');
  if (!timerEl) return;
  const t = gameOver ? survivalTime : (performance.now() - gameStart - totalPausedTime) / 1000;
  timerEl.textContent = t.toFixed(2) + 's';
}

function showGameOverOverlay() {
  const box = document.createElement('div');
  box.id = 'gameOverBox';
  box.innerHTML = `
    <div class="title">Game Over</div>
    <div class="survivedText">Survived: ${survivalTime.toFixed(2)}s</div>
    <button id="playAgainOverlay">Play Again</button>`;
  document.getElementById('gameContainer').appendChild(box);

  document.getElementById('playAgainOverlay').addEventListener('click', resetGame);
}

function gameLoop() {
  if (!gameStart) gameStart = performance.now();
  if (!gameOver && !paused) {
    updatePlayer();
    const allEnemies = [enemies, enemiesFast, enemiesSlow];
    moveEnemies(enemies, allEnemies);
    moveEnemies(enemiesFast, allEnemies);
    moveEnemies(enemiesSlow, allEnemies);


if (checkCollisions()) {
  gameOver = true;
  survivalTime = (performance.now() - gameStart - totalPausedTime) / 1000;
  clearInterval(spawnIntervalId);

  // Send score //
  sendScore(survivalTime);

  showGameOverOverlay();
  return;
}


    draw();
    updateHud();
    rafId = requestAnimationFrame(gameLoop);
  } else if (paused) {
    draw(); // still draw overlay when paused //
  }
}

// Controls & Reset  //
function togglePause() {
  if (gameOver) return;
  paused = !paused;

  if (paused) {
    pauseStart = performance.now();
    clearInterval(spawnIntervalId);
    cancelAnimationFrame(rafId);
    draw(); // show paused overlay immediately //
  } else {
    totalPausedTime += performance.now() - pauseStart;
    spawnIntervalId = setInterval(spawnEnemyAtEdge, 10000);
    rafId = requestAnimationFrame(gameLoop);
  }
  updateHud();
}

function resetGame() {
  document.getElementById('gameOverBox')?.remove();
  enemies.length = 0;
  enemiesFast.length = 0;
  enemiesSlow.length = 0;

  player.x = canvas.width / 2 - player.width / 2;
  player.y = canvas.height / 2 - player.height / 2;
  player.dx = 0;
  player.dy = 0;

  gameStart = null;
  gameOver = false;
  paused = false;
  totalPausedTime = 0;


  lastGreenSpawn = 0;    // Reset green spawn timer //
  pauseStart = 0;        // Reset pause timing //
  
  if (!gameStart) gameStart = performance.now();

  spawnEnemyAtEdge();
  spawnIntervalId = setInterval(spawnEnemyAtEdge, 10000);
  rafId = requestAnimationFrame(gameLoop);
}
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
function showGameOverOverlay() {
  const container = document.getElementById('gameContainer');

  // Create the dark shade //
  const shade = document.createElement('div');
  shade.id = 'gameShade';
  container.appendChild(shade);

  // Create the game over box //
  const box = document.createElement('div');
  box.id = 'gameOverBox';
  box.innerHTML = `
    <div class="title">Game Over</div>
    <div class="survivedText">Survived: ${survivalTime.toFixed(2)}s</div>
    <button id="playAgainOverlay">Play Again</button>
  `;
  container.appendChild(box);

  // Add button behavior //
  document.getElementById('playAgainOverlay').addEventListener('click', () => {
    shade.remove();
    box.remove();
    resetGame();
  });
}
