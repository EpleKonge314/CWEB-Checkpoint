// ==========================
// Aplegoetia — Shop Logic
// ==========================
document.addEventListener("DOMContentLoaded", () => {
  console.log("🛍️ shop.js initialized");

  // === Cached Elements ===
  const shopGrid = document.querySelector(".shop-grid");
  const profileDisplay = document.getElementById("profileDisplay");

  // Flexible coin display selectors (support either one or two counters)
  const coinEls = [
    document.getElementById("coinCountHeader"),
    document.getElementById("coinCountMain"),
    document.getElementById("coinCount")
  ].filter(Boolean);

  // === Username Handling ===
  let username = localStorage.getItem("USERNAME") || localStorage.getItem("username") || "Anonymous";
  profileDisplay.textContent = username;

  profileDisplay.addEventListener("click", () => {
    const newName = prompt("Enter a new username:", username);
    if (newName && newName.trim()) {
      username = newName.trim();
      localStorage.setItem("USERNAME", username);
      localStorage.setItem("username", username);
      profileDisplay.textContent = username;
      refreshCoins();
    }
  });

  // === Unified Coin Display Updater ===
  async function refreshCoins() {
    try {
      const res = await fetch(`/api/coins?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error("Failed to fetch coins");
      const data = await res.json();
      const coins = data.coins ?? 0;
      updateCoinDisplays(coins);
    } catch (err) {
      console.error("⚠️ Failed to refresh coins:", err);
      updateCoinDisplays(0);
    }
  }

  // === Direct coin add (when player earns coins elsewhere) ===
  async function playerGotCoin(amount = 1) {
    try {
      const res = await fetch("/api/coins/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, coins: amount })
      });
      const data = await res.json();
      if (data.success) updateCoinDisplays(data.coins);
    } catch (err) {
      console.error("⚠️ Failed to add coins:", err);
    }
  }

  // === Helper: Sync all coin displays ===
  function updateCoinDisplays(amount) {
    coinEls.forEach(el => (el.textContent = amount));
  }

  // === Fetch & Render Shop Items ===
  async function loadItems() {
    try {
      const res = await fetch("/api/shop/items");
      if (!res.ok) throw new Error("Failed to fetch shop items");
      const data = await res.json();

      shopGrid.innerHTML = "";

      const items = Array.isArray(data) ? data : data.items || [];

      items.forEach(item => {
        const card = document.createElement("div");
        card.className = "shop-item";
        card.dataset.key = item.key;

        card.innerHTML = `
          <img src="${item.img}" alt="${item.display_name}">
          <div class="item-info">
            <strong>${item.display_name}</strong>
            <p>Price: ${item.price} coins</p>
          </div>
          <button class="buy-btn" data-key="${item.key}">Buy</button>
        `;

        shopGrid.appendChild(card);
      });

      attachBuyListeners();
    } catch (err) {
      console.error("⚠️ Error loading shop items:", err);
      shopGrid.innerHTML = "<p>⚠️ Failed to load shop items.</p>";
    }
  }

  // === Buy Button Logic ===
  function attachBuyListeners() {
    document.querySelectorAll(".buy-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const itemKey = btn.dataset.key;
        btn.disabled = true;
        btn.textContent = "Processing...";

        try {
          const res = await fetch("/api/shop/buy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, item_key: itemKey })
          });
          const data = await res.json();

          if (res.ok && data.success) {
            showToast(`✅ Purchased ${itemKey}!`, "success");
            btn.textContent = "Owned";
            btn.disabled = true;
            refreshCoins();
          } else {
            showToast(`❌ ${data.error || "Purchase failed"}`, "error");
            btn.textContent = "Buy";
            btn.disabled = false;
          }
        } catch (err) {
          console.error("⚠️ Error during purchase:", err);
          showToast("⚠️ Server error while buying item.", "error");
          btn.textContent = "Buy";
          btn.disabled = false;
        }
      });
    });
  }

  // === Toast Notifications ===
  function showToast(msg, type = "info") {
    const box = document.createElement("div");
    box.className = `toast-message ${type}`;
    box.textContent = msg;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3000);
  }

  // === Auto Refresh + Init ===
  refreshCoins();
  loadItems();
  setInterval(refreshCoins, 5000);

  // Export function (used by other scripts if referenced)
  window.playerGotCoin = playerGotCoin;
});
