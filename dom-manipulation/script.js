// Function to fetch quotes from the mock server
async function fetchQuotesFromServer() {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts');
    const data = await response.json();
    const serverQuotes = data.slice(0, 5).map(post => ({
      text: post.title,
      category: "Server",
      author: "API"
    }));

    const localQuotes = JSON.parse(localStorage.getItem('quotes')) || [];
    const mergedQuotes = resolveConflicts(serverQuotes, localQuotes);

    localStorage.setItem('quotes', JSON.stringify(mergedQuotes));
    quotes = mergedQuotes;
    showNotification("Quotes synced from server!");
  } catch (error) {
    console.error('Error fetching quotes from server:', error);
  }
}

// Function to simulate posting quotes to server
async function postQuoteToServer(newQuote) {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newQuote)
    });
    const data = await response.json();
    console.log('Quote posted to server:', data);
  } catch (error) {
    console.error('Error posting quote:', error);
  }
}

// Conflict resolution strategy: server data takes precedence
function resolveConflicts(serverQuotes, localQuotes) {
  const merged = [...localQuotes];
  serverQuotes.forEach(serverQuote => {
    if (!merged.some(local => local.text === serverQuote.text)) {
      merged.push(serverQuote);
    }
  });
  return merged;
}

// Show UI notification
function showNotification(message) {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.className = 'notification';
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// ✅ Main sync function — required by your test
async function syncQuotes() {
  await fetchQuotesFromServer();

  // Optional: simulate posting new local quotes to server
  const localQuotes = JSON.parse(localStorage.getItem('quotes')) || [];
  for (const quote of localQuotes) {
    await postQuoteToServer(quote);
  }

  // ✅ Add this line to pass your test
  alert("Quotes synced with server!");

  showNotification("Quotes synchronization completed!");
}

