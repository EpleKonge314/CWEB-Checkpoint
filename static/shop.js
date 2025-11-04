document.addEventListener("DOMContentLoaded", () => {
  console.log("🛍️ shop.js initialized");

  const coinCountEl = document.getElementById("coinCount");
  const shopGrid = document.querySelector(".shop-grid");
  const profileDisplay = document.getElementById("profileDisplay");

  // --- Username setup ---
  let username = localStorage.getItem("username") || "Anonymous";
  profileDisplay.textContent = username;
  profileDisplay.addEventListener("click", () => {
    const newName = prompt("Enter a new username:", username);
    if (newName && newName.trim()) {
      username = newName.trim();
      localStorage.setItem("username", username);
      profileDisplay.textContent = username;
      loadCoins();
    }
  });

  // --- Owned items (includes base skins) ---
  const ownedItems = new Set(["base_player", "base_enemy"]); // default owned

  // --- Initialize ---
  loadCoins();
  loadItems();

  // --- Fetch player's coin balance ---
  async function loadCoins() {
    try {
      const res = await fetch(`/api/coins?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error("Failed to fetch coins");
      const data = await res.json();
      coinCountEl.textContent = data.coins ?? 0;
    } catch (err) {
      console.error("Error fetching coins:", err);
      coinCountEl.textContent = "0";
    }
  }

  // --- Fetch available shop items ---
  async function loadItems() {
    try {
      const res = await fetch("/api/shop/items");
      if (!res.ok) throw new Error("Failed to fetch shop items");
      const data = await res.json();

      shopGrid.innerHTML = "";

      // Handle both base skins + shop skins
      const allItems = [
        { key: "base_player", display_name: "Base Player Skin", price: 0, img: "/static/images/skins/base_player.png" },
        { key: "base_enemy", display_name: "Base Enemy Skin", price: 0, img: "/static/images/skins/base_enemy.png" },
        ...(data.items || [])
      ];

      allItems.forEach(item => {
        const isOwned = ownedItems.has(item.key);
        const card = document.createElement("div");
        card.classList.add("shop-item");
        if (isOwned) card.classList.add("owned");

        card.innerHTML = `
          <img src="${item.img}" alt="${item.display_name}">
          <div class="item-info">
            <strong>${item.display_name}</strong>
            <p>Price: ${item.price} coins</p>
          </div>
          <button class="buy-btn" data-key="${item.key}" ${isOwned ? "disabled" : ""}>
            ${isOwned ? "Owned" : "Buy"}
          </button>
        `;

        shopGrid.appendChild(card);
      });

      addBuyListeners();
    } catch (err) {
      console.error("Error loading shop items:", err);
      shopGrid.innerHTML = "<p>⚠️ Failed to load shop items.</p>";
    }
  }

  // --- Add Buy button logic ---
  function addBuyListeners() {
    document.querySelectorAll(".buy-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const itemKey = btn.dataset.key;
        if (ownedItems.has(itemKey)) return;

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
            showMessage(`✅ Purchased ${itemKey}!`, "success");
            ownedItems.add(itemKey);
            markAsOwned(itemKey);
            loadCoins();
          } else {
            showMessage(`❌ ${data.error || "Purchase failed."}`, "error");
          }
        } catch (err) {
          console.error("Error buying item:", err);
          showMessage("⚠️ Server error while buying item.", "error");
        } finally {
          btn.disabled = ownedItems.has(itemKey);
          btn.textContent = ownedItems.has(itemKey) ? "Owned" : "Buy";
        }
      });
    });
  }

  // --- Mark item visually as owned ---
  function markAsOwned(itemKey) {
    const card = document.querySelector(`.shop-item[data-key="${itemKey}"]`);
    if (card) {
      card.classList.add("owned");
      const btn = card.querySelector(".buy-btn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Owned";
      }
    }
  }

  // --- Temporary toast notifications ---
  function showMessage(msg, type = "info") {
    const box = document.createElement("div");
    box.className = `toast-message ${type}`;
    box.textContent = msg;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3000);
  }
});
async function updateCoinDisplay(username) {
  try {
    const res = await fetch(`/api/coins?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    document.getElementById("coinCount").textContent = data.coins ?? 0;
  } catch (err) {
    console.error("Failed to fetch coins:", err);
  }
}
async function playerGotCoin(username, amount = 1) {
  try {
    const res = await fetch("/api/coins/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, coins: amount })
    });
    const data = await res.json();
    if (data.success) {
      updateCoinDisplay(username); // refresh coin display
    }
  } catch (err) {
    console.error("Failed to add coins:", err);
  }
}
playerGotCoin(localStorage.getItem("USERNAME") || "Anonymous", 1);
