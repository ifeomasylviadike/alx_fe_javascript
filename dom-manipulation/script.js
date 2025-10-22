// Sync-enabled Dynamic Quote Generator
// Uses JSONPlaceholder (https://jsonplaceholder.typicode.com/posts) to simulate server data.
// Mapping: server post.title => quote.text, server post.userId => quote.category ("User <id>")

/* ===========================
   Configuration & Constants
   =========================== */
const LS_KEY = 'quotes_app_quotes';
const LS_SELECTED_CATEGORY = 'quotes_app_selected_category';
const SESSION_LAST = 'quotes_app_last_viewed';
const SERVER_ENDPOINT = 'https://jsonplaceholder.typicode.com/posts'; // mock server
const POLL_INTERVAL_MS = 30000; // 30 seconds

/* ===========================
   Utility helpers
   =========================== */
function nowIso() { return new Date().toISOString(); }
function uidLocal() { return 'local-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
function safeParseJSON(raw, fallback) {
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ===========================
   App State
   =========================== */
let quotes = [];         // array of quote objects { id, text, category, updatedAt, source: 'local'|'server' }
let conflicts = [];      // array of conflict objects for manual resolution
let lastSync = null;     // timestamp string

/* ===========================
   DOM elements (create if missing)
   =========================== */
const quoteDisplay = document.getElementById('quoteDisplay') || (() => {
  const el = document.createElement('div'); el.id = 'quoteDisplay'; document.body.appendChild(el); return el;
})();
const newQuoteBtn = document.getElementById('newQuote') || (() => {
  const btn = document.createElement('button'); btn.id = 'newQuote'; btn.textContent = 'Show New Quote'; document.body.appendChild(btn); return btn;
})();
const categoryFilter = document.getElementById('categoryFilter') || (() => {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<label for="categoryFilter">Filter by Category:</label>
    <select id="categoryFilter"><option value="all">All Categories</option></select>`;
  document.body.insertBefore(wrapper, quoteDisplay);
  return document.getElementById('categoryFilter');
})();

// Notification / Control UI
const notifContainer = document.createElement('div');
notifContainer.id = 'syncNotifications';
notifContainer.style.position = 'fixed';
notifContainer.style.right = '20px';
notifContainer.style.bottom = '20px';
notifContainer.style.maxWidth = '320px';
notifContainer.style.fontFamily = 'sans-serif';
document.body.appendChild(notifContainer);

// Minimal styles for notifications
const style = document.createElement('style');
style.innerHTML = `
#syncNotifications .notif {
  background:#fff; border:1px solid #ddd; padding:10px; margin-top:8px; border-radius:6px;
  box-shadow:0 2px 6px rgba(0,0,0,0.08);
}
#syncNotifications .notif strong { display:block; margin-bottom:6px; }
#syncNotifications .notif button { margin-right:6px; }
.conflict-list { max-height:160px; overflow:auto; margin-top:6px; padding-left:10px; }
`;
document.head.appendChild(style);

/* ===========================
   Local Storage: Load & Save
   =========================== */
function loadLocalQuotes() {
  const raw = localStorage.getItem(LS_KEY);
  const parsed = safeParseJSON(raw, null);
  if (Array.isArray(parsed)) {
    quotes = parsed; // assume earlier format matches our structure
  } else {
    // seed defaults
    quotes = [
      { id: uidLocal(), text: "Believe in yourself!", category: "Motivation", updatedAt: nowIso(), source: 'local' },
      { id: uidLocal(), text: "Stay positive, work hard, make it happen.", category: "Inspiration", updatedAt: nowIso(), source: 'local' },
      { id: uidLocal(), text: "Code is like humor. When you have to explain it, it’s bad.", category: "Programming", updatedAt: nowIso(), source: 'local' },
    ];
    saveLocalQuotes();
  }
}

function saveLocalQuotes() {
  localStorage.setItem(LS_KEY, JSON.stringify(quotes));
}

/* ===========================
   Server Fetch & Post (simulation)
   =========================== */
async function fetchServerQuotes() {
  // Fetch posts and map to quote objects. This simulates server-side quotes.
  const res = await fetch(SERVER_ENDPOINT);
  if (!res.ok) throw new Error('Server fetch failed: ' + res.status);
  const posts = await res.json();
  // Map first 20 posts to quotes to limit size
  const serverQuotes = posts.slice(0, 20).map(p => ({
    id: String(p.id), // server id as string (numeric)
    text: String(p.title).trim(),
    category: `User ${p.userId}`,
    updatedAt: nowIso(), // we don't have server timestamps in JSONPlaceholder so use now
    source: 'server'
  }));
  return serverQuotes;
}

async function postLocalQuoteToServer(localQuote) {
  // Simulate posting to server. JSONPlaceholder returns an object with an id.
  const payload = { title: localQuote.text, body: "", userId: 1 };
  const res = await fetch(SERVER_ENDPOINT, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('Post failed: ' + res.status);
  const created = await res.json();
  // created will have an id (simulated)
  return {
    id: String(created.id),
    text: localQuote.text,
    category: localQuote.category,
    updatedAt: nowIso(),
    source: 'server'
  };
}

/* ===========================
   Merge & Conflict Logic
   =========================== */
function detectConflicts(serverQuotes) {
  // Build maps by id
  const localById = new Map(quotes.map(q => [q.id, q]));
  const serverById = new Map(serverQuotes.map(q => [q.id, q]));

  const detected = [];

  // For ids present in both, detect differences
  serverById.forEach((s, id) => {
    if (localById.has(id)) {
      const l = localById.get(id);
      if (l.text !== s.text || l.category !== s.category) {
        detected.push({ id, local: l, server: s });
      }
    }
  });

  return detected;
}

function mergeServerData(serverQuotes) {
  // We will apply server precedence for conflicts (server wins),
  // but we'll store conflicts for manual review.
  const localById = new Map(quotes.map(q => [q.id, q]));
  const serverById = new Map(serverQuotes.map(q => [q.id, q]));

  // 1) Replace or add server items into local list
  serverQuotes.forEach(sq => {
    if (localById.has(sq.id)) {
      // conflict? if identical, do nothing; if different, overwrite (server precedence)
      const local = localById.get(sq.id);
      if (local.text !== sq.text || local.category !== sq.category) {
        // keep the local copy too in conflicts array for user review
        conflicts.push({ id: sq.id, local: local, server: sq });
      }
      // Now overwrite local with server version
      localById.set(sq.id, { ...sq, source: 'server' });
    } else {
      // server has a new item - add it
      localById.set(sq.id, { ...sq, source: 'server' });
    }
  });

  // 2) Keep local items that server doesn't have (local-only)
  quotes.forEach(l => {
    if (!serverById.has(l.id)) {
      // keep local as-is
      localById.set(l.id, l);
    }
  });

  // 3) Rebuild quotes array and save
  quotes = Array.from(localById.values());
  saveLocalQuotes();
}

/* ===========================
   UI: Notifications & Conflict Resolution UI
   =========================== */
function showNotification(title, message, actions = []) {
  const n = document.createElement('div');
  n.className = 'notif';
  n.innerHTML = `<strong>${escapeHtml(title)}</strong><div>${escapeHtml(message)}</div>`;
  // actions: array of { label, onClick }
  if (actions.length) {
    const btnRow = document.createElement('div');
    btnRow.style.marginTop = '8px';
    actions.forEach(a => {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.addEventListener('click', () => { a.onClick(); n.remove(); });
      btnRow.appendChild(b);
    });
    n.appendChild(btnRow);
  }
  notifContainer.appendChild(n);
  // auto-remove after some time
  setTimeout(() => { if (n.parentNode) n.remove(); }, 15000);
}

function showConflictNotification() {
  if (!conflicts.length) return;
  const title = `Conflicts detected (${conflicts.length})`;
  const message = 'Server changes conflict with local changes. Server changes were applied automatically (server precedence). You can review conflicts or restore local versions.';
  showNotification(title, message, [
    { label: 'Review Conflicts', onClick: openConflictViewer },
    { label: 'Restore Local (manual)', onClick: () => { showConflictViewer(true); } }
  ]);
}

function openConflictViewer(restoreLocalOnSelect = false) {
  // Create a detailed conflict viewer notification with per-conflict choices
  const n = document.createElement('div'); n.className = 'notif';
  n.innerHTML = `<strong>Conflict Resolution</strong><div>Choose per item which version to keep.</div>`;
  const list = document.createElement('div'); list.className = 'conflict-list';
  conflicts.forEach((c, idx) => {
    const itemDiv = document.createElement('div');
    itemDiv.style.borderTop = '1px solid #eee';
    itemDiv.style.paddingTop = '8px';
    itemDiv.innerHTML = `<div><em>Quote ID:</em> ${escapeHtml(c.id)}</div>
      <div><strong>Server:</strong> "${escapeHtml(c.server.text)}" — ${escapeHtml(c.server.category)}</div>
      <div><strong>Local:</strong> "${escapeHtml(c.local.text)}" — ${escapeHtml(c.local.category)}</div>`;
    // buttons
    const keepServerBtn = document.createElement('button');
    keepServerBtn.textContent = 'Keep Server';
    keepServerBtn.style.marginRight = '6px';
    keepServerBtn.addEventListener('click', () => { applyConflictChoice(idx, 'server'); n.remove(); });

    const keepLocalBtn = document.createElement('button');
    keepLocalBtn.textContent = 'Keep Local';
    keepLocalBtn.addEventListener('click', () => { applyConflictChoice(idx, 'local'); n.remove(); });

    itemDiv.appendChild(keepServerBtn);
    itemDiv.appendChild(keepLocalBtn);
    list.appendChild(itemDiv);
  });
  n.appendChild(list);

  // Append to notifications
  notifContainer.appendChild(n);
}

function applyConflictChoice(conflictIndex, choice) {
  const c = conflicts[conflictIndex];
  if (!c) return;
  if (choice === 'server') {
    // ensure server version is in quotes (already applied by merge step), so just remove conflict
    conflicts.splice(conflictIndex, 1);
    saveLocalQuotes();
    showNotification('Conflict Resolved', 'Kept server version for selected quote.');
  } else if (choice === 'local') {
    // replace server-applied quote with local version
    const i = quotes.findIndex(q => q.id === c.id);
    if (i !== -1) {
      quotes[i] = { ...c.local, source: 'local', updatedAt: nowIso() };
      saveLocalQuotes();
    } else {
      // if server removed it, re-add local
      quotes.push({ ...c.local, source: 'local', updatedAt: nowIso() });
      saveLocalQuotes();
    }
    conflicts.splice(conflictIndex, 1);
    showNotification('Conflict Resolved', 'Restored local version for selected quote.');
  }
  // refresh UI
  updateCategoryFilter();
  showRandomQuote();
}

/* ===========================
   Sync cycle
   =========================== */
async function syncWithServer() {
  try {
    const serverQuotesRaw = await fetchServerQuotes();
    // Detect conflicts before merging
    const detected = detectConflicts(serverQuotesRaw);
    if (detected.length) {
      // Append to conflicts store (we will also auto-apply server precedence)
      conflicts = conflicts.concat(detected.map(d => ({ id: d.id, local: d.local, server: d.server })));
    }

    // Merge server data (server precedence)
    mergeServerData(serverQuotesRaw);
    lastSync = nowIso();

    // Notify user
    if (detected.length) {
      showConflictNotification();
    } else {
      showNotification('Sync Complete', `Synchronized with server at ${new Date(lastSync).toLocaleTimeString()}.`);
    }

    // If there are local-only quotes (ids starting with 'local-'), try posting them to server (simulate)
    const localOnly = quotes.filter(q => q.id && q.id.startsWith('local-'));
    for (const lq of localOnly) {
      try {
        const serverVersion = await postLocalQuoteToServer(lq);
        // Replace local id with server id and mark as server source
        const idx = quotes.findIndex(x => x.id === lq.id);
        if (idx !== -1) {
          quotes[idx] = { ...serverVersion, source: 'server' };
        }
        saveLocalQuotes();
      } catch (e) {
        console.warn('Failed to post local quote to server (simulated)', e);
      }
    }

  } catch (err) {
    console.error('Sync failed:', err);
    showNotification('Sync Error', 'Failed to reach server for updates.');
  }
}

/* ===========================
   UI: Category & Quote display helpers (persist last filter)
   =========================== */
function updateCategoryFilter() {
  const select = categoryFilter;
  const prev = select.value || 'all';
  const cats = ['all', ...Array.from(new Set(quotes.map(q => q.category)))];
  select.innerHTML = '';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = (c === 'all') ? 'All Categories' : c;
    select.appendChild(opt);
  });
  // restore saved selection if present
  const saved = localStorage.getItem(LS_SELECTED_CATEGORY) || prev;
  if (Array.from(select.options).some(o => o.value === saved)) select.value = saved;
}

function saveSelectedCategory() {
  localStorage.setItem(LS_SELECTED_CATEGORY, categoryFilter.value);
}

function showRandomQuote() {
  const selected = categoryFilter.value || 'all';
  const pool = selected === 'all' ? quotes : quotes.filter(q => q.category === selected);
  if (!pool.length) {
    quoteDisplay.textContent = 'No quotes in this category.';
    return;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  quoteDisplay.innerHTML = `<blockquote>"${escapeHtml(q.text)}"</blockquote><small>— ${escapeHtml(q.category)}</small>`;
  sessionStorage.setItem(SESSION_LAST, JSON.stringify(q)); // save last viewed in sessionStorage
}

/* ===========================
   Add Quote (local) - keep previous behavior but ensure id + save + update categories
   =========================== */
function addQuote(text, category) {
  const cleanedText = String(text || '').trim();
  const cleanedCategory = String(category || '').trim();
  if (!cleanedText || !cleanedCategory) {
    alert('Please enter both quote text and category.');
    return;
  }
  const newQ = { id: uidLocal(), text: cleanedText, category: cleanedCategory, updatedAt: nowIso(), source: 'local' };
  quotes.push(newQ);
  saveLocalQuotes();
  updateCategoryFilter();
  showRandomQuote();
  showNotification('Quote Added', 'Your quote was added locally and will be synced to the server on next sync.');
}

/* ===========================
   File import/export helpers (same as before)
   =========================== */
function exportToJsonFile() {
  const dataStr = JSON.stringify(quotes, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'quotes_export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importFromJsonFileEvent(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!Array.isArray(parsed)) { alert('Invalid file format. Expected an array of quotes.'); return; }
      // Validate items
      let added = 0;
      parsed.forEach(item => {
        if (item && typeof item.text === 'string' && typeof item.category === 'string') {
          // create a local id to avoid collisions
          const newQ = { id: uidLocal(), text: item.text.trim(), category: item.category.trim(), updatedAt: nowIso(), source: 'local' };
          quotes.push(newQ);
          added++;
        }
      });
      if (added) {
        saveLocalQuotes();
        updateCategoryFilter();
        showNotification('Import Complete', `Imported ${added} quotes.`);
      } else {
        alert('No valid quotes found in file.');
      }
    } catch (err) {
      alert('Failed to import file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

/* ===========================
   Wiring UI events & initialization
   =========================== */
function wireUI() {
  // Category change -> save preference and show random quote for that category
  categoryFilter.addEventListener('change', () => {
    saveSelectedCategory();
    showRandomQuote();
  });

  // newQuote button
  newQuoteBtn.addEventListener('click', showRandomQuote);

  // Create Add Quote inputs if not present
  if (!document.getElementById('newQuoteText') || !document.getElementById('newQuoteCategory')) {
    const container = document.createElement('div');
    container.innerHTML = `
      <input id="newQuoteText" type="text" placeholder="Enter a new quote" />
      <input id="newQuoteCategory" type="text" placeholder="Enter quote category" />
      <button id="addQuoteBtn">Add Quote</button>
    `;
    document.body.insertBefore(container, notifContainer);
    document.getElementById('addQuoteBtn').addEventListener('click', () => {
      const t = document.getElementById('newQuoteText').value;
      const c = document.getElementById('newQuoteCategory').value;
      addQuote(t, c);
      document.getElementById('newQuoteText').value = '';
      document.getElementById('newQuoteCategory').value = '';
    });
  } else {
    // If form exists and uses onclick="addQuote()" (older markup), keep compatibility
    const addBtn = document.getElementById('addQuoteBtn') || null;
    if (addBtn) addBtn.addEventListener('click', () => {
      const t = document.getElementById('newQuoteText').value;
      const c = document.getElementById('newQuoteCategory').value;
      addQuote(t, c);
    });
  }

  // Export / Import UI if not present
  if (!document.getElementById('exportQuotes')) {
    const io = document.createElement('div');
    io.innerHTML = `<button id="exportQuotes">Export Quotes</button>
      <input type="file" id="importFile" accept=".json" />`;
    document.body.insertBefore(io, notifContainer);
    document.getElementById('exportQuotes').addEventListener('click', exportToJsonFile);
    document.getElementById('importFile').addEventListener('change', importFromJsonFileEvent);
  } else {
    // existing elements found
    const exportBtn = document.getElementById('exportQuotes');
    if (exportBtn) exportBtn.addEventListener('click', exportToJsonFile);
    const importInput = document.getElementById('importFile');
    if (importInput) importInput.addEventListener('change', importFromJsonFileEvent);
  }

  // Add a manual "Sync Now" button
  if (!document.getElementById('syncNowBtn')) {
    const syncBtn = document.createElement('button');
    syncBtn.id = 'syncNowBtn';
    syncBtn.textContent = 'Sync Now';
    syncBtn.style.marginLeft = '10px';
    document.body.insertBefore(syncBtn, notifContainer);
    syncBtn.addEventListener('click', async () => {
      showNotification('Sync', 'Manual sync started...');
      await syncWithServer();
      showNotification('Sync', 'Manual sync finished.');
    });
  }
}

/* ===========================
   Start App
   =========================== */
async function init() {
  loadLocalQuotes();
  wireUI();
  updateCategoryFilter();
  // restore last selected category if present
  const savedCat = localStorage.getItem(LS_SELECTED_CATEGORY);
  if (savedCat && Array.from(categoryFilter.options).some(o => o.value === savedCat)) categoryFilter.value = savedCat;
  // show last session quote or random
  const last = safeParseJSON(sessionStorage.getItem(SESSION_LAST), null);
  if (last && last.text) {
    // show last viewed
    quoteDisplay.innerHTML = `<blockquote>"${escapeHtml(last.text)}"</blockquote><small>— ${escapeHtml(last.category)}</small>`;
  } else {
    showRandomQuote();
  }

  // initial sync
  await syncWithServer();

  // periodic polling
  setInterval(async () => {
    await syncWithServer();
  }, POLL_INTERVAL_MS);
}

// Run
document.addEventListener('DOMContentLoaded', init);
u