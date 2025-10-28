async function fetchMessages() {
  try {
    const res = await fetch('/messages');
    if (!res.ok) return;
    const msgs = await res.json();

    const container = document.getElementById('messages');
    if (!container) return;

    // Clear existing messages //
    container.innerHTML = '';

    // Read admin token (for delete permissions) //
    const adminTokenEl = document.getElementById('adminTokenInput');
    const adminToken = adminTokenEl ? adminTokenEl.value.trim() : '';

    // Render each message //
    for (const m of msgs) {
      const el = document.createElement('div');
      el.className = 'message';

      const user = document.createElement('strong');
      user.textContent = (m.username || 'Anonymous') + ': ';

      const text = document.createElement('span');
      text.textContent = m.content;

      el.appendChild(user);
      el.appendChild(text);

      // Add delete button only if admin token is present, it'll appear if something is entered but not actually work unless correct token is provided //
      if (adminToken) {
        const del = document.createElement('button');
        del.className = 'delete';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
          if (!confirm('Delete this message?')) return;
          await deleteMessage(m.id, adminToken);
          await fetchMessages();
        });
        el.appendChild(del);
      }

      container.appendChild(el);
    }

    // Scroll to bottom of chat //
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error('Error fetching messages:', err);
  }
}

async function sendMessage(content) {
  try {
    const res = await fetch('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content)
    });
    return res.ok;
  } catch (err) {
    console.error('Error sending message:', err);
    return false;
  }
}

async function deleteMessage(id, adminToken) {
  try {
    const headers = {};
    if (adminToken) headers['X-Admin-Token'] = adminToken;
    const res = await fetch(`/messages/${id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('Delete failed', body);
    }
    return res.ok;
  } catch (err) {
    console.error('Error deleting message:', err);
    return false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('messageInput');
  const btn = document.getElementById('sendBtn');
  const usernameEl = document.getElementById('usernameInput');

  async function submit() {
    const v = input.value.trim();
    if (!v) return;
    const username = usernameEl ? usernameEl.value.trim() || 'Anonymous' : 'Anonymous';
    await sendMessage({ content: v, username });
    input.value = '';
    await fetchMessages();
  }

  if (btn) btn.addEventListener('click', submit);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  // Initial load and polling //
  fetchMessages();
  let pollIntervalId = setInterval(fetchMessages, 3000);

  // Chat pause toggle (via dropdown menu) //
  let chatPaused = false;
  function toggleChatPause() {
    chatPaused = !chatPaused;
    if (chatPaused) {
      clearInterval(pollIntervalId);
    } else {
      pollIntervalId = setInterval(fetchMessages, 3000);
      fetchMessages();
    }
  }

  const headerBtn = document.querySelector('.dropdown-btn');
  if (headerBtn) headerBtn.addEventListener('click', toggleChatPause);
});

