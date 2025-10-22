// script.js - Dynamic Quote Generator with localStorage, sessionStorage, import/export

// --- Helpers: Storage keys ---
const LS_KEY = 'quotes_app_quotes';
const SESSION_KEY_LAST = 'quotes_app_last_viewed';

// --- Default quotes (used if no localStorage) ---
const defaultQuotes = [
  { text: "The best way to predict the future is to create it.", category: "Motivation" },
  { text: "In the middle of every difficulty lies opportunity.", category: "Inspiration" },
  { text: "Happiness depends upon ourselves.", category: "Happiness" },
  { text: "Code is like humor. When you have to explain it, it’s bad.", category: "Programming" },
];

// --- App state ---
let quotes = [];

// --- DOM references that must exist in HTML ---
const quoteDisplay = document.getElementById("quoteDisplay");
const newQuoteBtn = document.getElementById("newQuote");

// create UI helpers (category dropdown, add form, import/export UI)
const uiContainer = document.createElement('div');
uiContainer.id = 'quotes-ui-container';
document.body.insertBefore(uiContainer, quoteDisplay); // place before quoteDisplay

// Category filter (select)
const categoryFilter = document.createElement('select');
categoryFilter.id = 'categoryFilter';
uiContainer.appendChild(categoryFilter);

// Add-quote form container (created by createAddQuoteForm)
const addFormContainer = document.createElement('div');
addFormContainer.id = 'addFormContainer';
uiContainer.appendChild(addFormContainer);

// Export / Import controls container
const ioContainer = document.createElement('div');
ioContainer.id = 'ioContainer';
ioContainer.style.marginTop = '10px';
uiContainer.appendChild(ioContainer);

// Last viewed indicator
const lastViewedEl = document.createElement('div');
lastViewedEl.id = 'lastViewed';
lastViewedEl.style.fontStyle = 'italic';
lastViewedEl.style.marginTop = '8px';
uiContainer.appendChild(lastViewedEl);

// --- Storage functions ---
function saveQuotes() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(quotes));
  } catch (err) {
    console.error('Error saving quotes to localStorage', err);
  }
}

function loadQuotesFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      quotes = [...defaultQuotes];
      saveQuotes();
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // basic validation of structure
      quotes = parsed.filter(q => q && typeof q.text === 'string' && typeof q.category === 'string');
      if (quotes.length === 0) {
        // fallback to default if parsed but empty/invalid
        quotes = [...defaultQuotes];
      }
    } else {
      quotes = [...defaultQuotes];
    }
  } catch (err) {
    console.error('Error loading quotes from localStorage', err);
    quotes = [...defaultQuotes];
  }
}

// --- Session functions ---
function saveLastViewedToSession(quoteObj) {
  try {
    sessionStorage.setItem(SESSION_KEY_LAST, JSON.stringify(quoteObj));
  } catch (err) {
    console.error('Error saving last viewed to sessionStorage', err);
  }
}

function loadLastViewedFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_LAST);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.text === 'string') return parsed;
    return null;
  } catch (err) {
    console.error('Error reading sessionStorage', err);
    return null;
  }
}

// --- UI update functions ---
function updateCategoryFilter() {
  const categories = ['All', ...new Set(quotes.map(q => q.category))];
  categoryFilter.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categoryFilter.appendChild(opt);
  });
}

function showQuoteObject(quoteObj) {
  if (!quoteObj) {
    quoteDisplay.textContent = 'No quote to display.';
    lastViewedEl.textContent = '';
    return;
  }
  quoteDisplay.innerHTML = `<blockquote style="margin:0 0 8px 0;">"${escapeHtml(quoteObj.text)}"</blockquote><small>— ${escapeHtml(quoteObj.category)}</small>`;
  lastViewedEl.textContent = `Last viewed: "${quoteObj.text.length > 60 ? quoteObj.text.slice(0, 57) + '...' : quoteObj.text}"`;
  saveLastViewedToSession(quoteObj);
}

// simple escape to avoid HTML injection when showing user-provided quotes
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Show a random quote (respecting category)
function showRandomQuote() {
  const selectedCategory = categoryFilter.value || 'All';
  const filtered = selectedCategory === 'All' ? quotes : quotes.filter(q => q.category === selectedCategory);
  if (filtered.length === 0) {
    quoteDisplay.textContent = 'No quotes available for this category.';
    return;
  }
  const idx = Math.floor(Math.random() * filtered.length);
  const chosen = filtered[idx];
  showQuoteObject(chosen);
}

// --- Add quote UI & functionality ---
function createAddQuoteForm() {
  addFormContainer.innerHTML = `
    <div style="margin-top:10px;">
      <input id="newQuoteText" type="text" placeholder="Enter a new quote" style="width:45%;padding:6px;" />
      <input id="newQuoteCategory" type="text" placeholder="Enter quote category" style="width:20%;padding:6px;margin-left:6px;" />
      <button id="addQuoteBtn" style="margin-left:6px;padding:6px 8px;">Add Quote</button>
    </div>
  `;

  document.getElementById('addQuoteBtn').addEventListener('click', function () {
    addQuote();
  });
}

function addQuote() {
  const textInput = document.getElementById('newQuoteText');
  const categoryInput = document.getElementById('newQuoteCategory');
  if (!textInput || !categoryInput) return;

  const newText = textInput.value.trim();
  const newCategory = categoryInput.value.trim();

  if (newText === '' || newCategory === '') {
    alert('Please enter both a quote and a category!');
    return;
  }

  const newObj = { text: newText, category: newCategory };
  quotes.push(newObj);
  saveQuotes();
  updateCategoryFilter();

  // Clear and show the newly added quote
  textInput.value = '';
  categoryInput.value = '';
  showQuoteObject(newObj);
}

// --- Export quotes to JSON file ---
function createExportButton() {
  const exportBtn = document.createElement('button');
  exportBtn.id = 'exportQuotesBtn';
  exportBtn.textContent = 'Export Quotes (.json)';
  exportBtn.style.marginLeft = '8px';
  ioContainer.appendChild(exportBtn);

  exportBtn.addEventListener('click', function () {
    try {
      const dataStr = JSON.stringify(quotes, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'quotes_export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();

      // release the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Export error', err);
      alert('Failed to export quotes.');
    }
  });
}

// --- Import quotes from JSON file (file input) ---
function createImportInput() {
  // create file input (accept only .json)
  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'importFile';
  input.accept = '.json,application/json';
  input.style.marginLeft = '8px';
  ioContainer.appendChild(input);

  input.addEventListener('change', importFromJsonFile);
}

// validate imported array of objects
function validateImportedArray(arr) {
  if (!Array.isArray(arr)) return false;
  for (const item of arr) {
    if (!item || typeof item.text !== 'string' || typeof item.category !== 'string') return false;
  }
  return true;
}

function importFromJsonFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!validateImportedArray(parsed)) {
        alert('Invalid file format. Expect an array of objects with "text" and "category" string properties.');
        return;
      }

      // Merge imported quotes (simple append). Avoid exact duplicates (text+category).
      const existingSet = new Set(quotes.map(q => q.text + '||' + q.category));
      let added = 0;
      parsed.forEach(item => {
        const key = item.text + '||' + item.category;
        if (!existingSet.has(key)) {
          quotes.push({ text: item.text, category: item.category });
          existingSet.add(key);
          added++;
        }
      });

      if (added > 0) {
        saveQuotes();
        updateCategoryFilter();
        alert(`Imported ${added} new quote(s).`);
      } else {
        alert('No new quotes were added (duplicates skipped).');
      }
    } catch (err) {
      console.error('Import error', err);
      alert('Failed to import quotes. Make sure the file is valid JSON.');
    } finally {
      // reset the input so same file can be uploaded again if needed
      event.target.value = '';
    }
  };

  reader.readAsText(file);
}

// --- Initialization ---
function initApp() {
  loadQuotesFromStorage();
  createAddQuoteForm();
  updateCategoryFilter();
  createExportButton();
  createImportInput();

  // Add a small "Show last viewed" button (for demo of sessionStorage)
  const showLastBtn = document.createElement('button');
  showLastBtn.textContent = 'Show Last Viewed Quote';
  showLastBtn.style.marginLeft = '8px';
  ioContainer.appendChild(showLastBtn);
  showLastBtn.addEventListener('click', function () {
    const last = loadLastViewedFromSession();
    if (last) showQuoteObject(last);
    else alert('No last viewed quote in this session.');
  });

  // Wire up main "Show New Quote" button and category change
  if (newQuoteBtn) newQuoteBtn.addEventListener('click', showRandomQuote);
  categoryFilter.addEventListener('change', showRandomQuote);

  // On startup, if there is a session-stored last viewed quote, show it; otherwise show random
  const last = loadLastViewedFromSession();
  if (last) {
    showQuoteObject(last);
  } else {
    showRandomQuote();
  }
}

// Run the app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initApp);
