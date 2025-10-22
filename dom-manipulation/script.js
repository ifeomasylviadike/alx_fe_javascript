let quotes = JSON.parse(localStorage.getItem("quotes")) || [];
const quoteDisplay = document.getElementById("quoteDisplay");
const categoryFilter = document.getElementById("categoryFilter");

// --- Helper functions for storage ---
function saveQuotes() {
  localStorage.setItem("quotes", JSON.stringify(quotes));
}

function loadQuotes() {
  const savedQuotes = JSON.parse(localStorage.getItem("quotes"));
  if (savedQuotes) quotes = savedQuotes;
}

// --- Display random quote ---
function showRandomQuote() {
  const filteredQuotes =
    categoryFilter.value === "all"
      ? quotes
      : quotes.filter((q) => q.category === categoryFilter.value);

  if (filteredQuotes.length === 0) {
    quoteDisplay.textContent = "No quotes in this category yet.";
    return;
  }

  const randomQuote =
    filteredQuotes[Math.floor(Math.random() * filteredQuotes.length)];
  quoteDisplay.textContent = `"${randomQuote.text}" — ${randomQuote.category}`;
  sessionStorage.setItem("lastViewedQuote", JSON.stringify(randomQuote));
}

// --- Add new quote ---
function addQuote() {
  const text = document.getElementById("newQuoteText").value.trim();
  const category = document.getElementById("newQuoteCategory").value.trim();

  if (!text || !category) {
    alert("Please fill in both fields.");
    return;
  }

  const newQuote = { text, category };
  quotes.push(newQuote);
  saveQuotes();
  populateCategories();

  // Post to mock API
  postQuoteToServer(newQuote);

  alert("Quote added!");
}

// --- Populate category dropdown ---
function populateCategories() {
  const categories = [
    "all",
    ...new Set(quotes.map((quote) => quote.category)),
  ];
  categoryFilter.innerHTML = categories
    .map((cat) => `<option value="${cat}">${cat}</option>`)
    .join("");

  const lastSelected = localStorage.getItem("lastSelectedCategory");
  if (lastSelected && categories.includes(lastSelected)) {
    categoryFilter.value = lastSelected;
  }
}

// --- Filter quotes based on category ---
function filterQuotes() {
  localStorage.setItem("lastSelectedCategory", categoryFilter.value);
  showRandomQuote();
}

// --- Fetch quotes from server (GET) ---
async function fetchQuotesFromServer() {
  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/posts");
    const serverData = await response.json();

    // Simulate quotes from API
    const serverQuotes = serverData.slice(0, 5).map((item) => ({
      text: item.title,
      category: "Server",
    }));

    let updated = false;

    // Conflict resolution: server data overrides duplicates
    serverQuotes.forEach((sq) => {
      const exists = quotes.some((q) => q.text === sq.text);
      if (!exists) {
        quotes.push(sq);
        updated = true;
      }
    });

    if (updated) {
      saveQuotes();
      populateCategories();
      notifyUser("New quotes synced from server!");
    }
  } catch (error) {
    console.error("Error fetching quotes:", error);
  }
}

// --- ✅ POST new quotes to server ---
async function postQuoteToServer(quote) {
  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(quote),
    });

    if (response.ok) {
      console.log("Quote posted successfully!");
    } else {
      console.error("Failed to post quote.");
    }
  } catch (error) {
    console.error("Error posting quote:", error);
  }
}

// --- Notification system ---
function notifyUser(message) {
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.style.position = "fixed";
  notification.style.bottom = "10px";
  notification.style.right = "10px";
  notification.style.background = "#28a745";
  notification.style.color = "#fff";
  notification.style.padding = "10px";
  notification.style.borderRadius = "5px";
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 4000);
}

// --- Periodic server sync (every 30 seconds) ---
setInterval(fetchQuotesFromServer, 30000);

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  loadQuotes();
  populateCategories();
  showRandomQuote();
  fetchQuotesFromServer(); // initial sync
});
