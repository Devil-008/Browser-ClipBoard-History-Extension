// popup.js

// Utility: Format a timestamp into "YYYY-MM-DD HH:MM:ss"
function formatTimestamp(ts) {
  const d = new Date(ts);
  const pad = (n) => (n < 10 ? "0" + n : n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Utility: Format relative time
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatTimestamp(timestamp);
}

// Utility: Truncate text
function truncateText(text, maxLength = 100) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

let allEntries = [];
let isLoading = false;

// Show loading state
function showLoading() {
  const container = document.getElementById("historyList");
  if (container) {
    container.innerHTML =
      '<div class="loading">Loading clipboard history...</div>';
  }
}

// Show no entries message
function showNoEntries() {
  const container = document.getElementById("historyList");
  if (container) {
    container.innerHTML = `
        <div class="no-entries">
          <h3>📋 No clipboard history yet</h3>
          <p>Copy some text on any webpage and it will appear here!</p>
        </div>
      `;
  }
}

// Update entry count
function updateEntryCount() {
  const countElement = document.getElementById("entryCount");
  if (countElement) {
    const total = allEntries.length;
    const pinned = allEntries.filter((e) => e.pinned).length;

    if (pinned > 0) {
      countElement.textContent = `${total} entries (${pinned} pinned)`;
    } else {
      countElement.textContent = `${total} entries`;
    }
  }
}

// Fetch history from background script and render it
function loadAndRenderHistory() {
  if (isLoading) return;

  isLoading = true;
  showLoading();

  chrome.runtime.sendMessage({ type: "GET_HISTORY" }, (response) => {
    isLoading = false;

    if (chrome.runtime.lastError) {
      console.error("Runtime error:", chrome.runtime.lastError);
      showError("Failed to load clipboard history");
      return;
    }

    if (!response || !response.success) {
      console.warn("Invalid or failed history response:", response);
      allEntries = [];
    } else {
      allEntries = Array.isArray(response.history) ? response.history : [];
    }

    renderEntries();
    updateEntryCount();
  });
}

// Show error message
function showError(message) {
  const container = document.getElementById("historyList");
  if (container) {
    container.innerHTML = `
        <div class="no-entries">
          <h3>⚠️ Error</h3>
          <p>${message}</p>
        </div>
      `;
  }
}

// Render filtered and sorted entries into the DOM
function renderEntries() {
  const container = document.getElementById("historyList");
  const searchInput = document.getElementById("searchInput");

  if (!container) {
    console.error("Missing DOM element: #historyList");
    return;
  }

  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  // Filter entries based on search query
  const filtered = allEntries.filter((entry) =>
    entry.text.toLowerCase().includes(query)
  );

  // Sort entries: pinned first (newest on top), then unpinned (newest on top)
  filtered.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.timestamp - a.timestamp;
  });

  // Clear container
  container.innerHTML = "";

  // If no results, show appropriate message
  if (filtered.length === 0) {
    if (allEntries.length === 0) {
      showNoEntries();
    } else {
      container.innerHTML = `
          <div class="no-entries">
            <h3>🔍 No matches found</h3>
            <p>Try different search terms</p>
          </div>
        `;
    }
    return;
  }

  // Render each entry
  filtered.forEach((entry, index) => {
    const entryDiv = document.createElement("div");
    entryDiv.className = "history-entry" + (entry.pinned ? " pinned" : "");
    entryDiv.dataset.id = entry.id;

    // Text section
    const textDiv = document.createElement("div");
    textDiv.className = "entry-text";
    textDiv.textContent = entry.text;
    entryDiv.appendChild(textDiv);

    // Timestamp section
    const metaDiv = document.createElement("div");
    metaDiv.className = "entry-meta";
    metaDiv.textContent = formatRelativeTime(entry.timestamp);
    metaDiv.title = formatTimestamp(entry.timestamp); // Full timestamp on hover
    entryDiv.appendChild(metaDiv);

    // Button group
    const btnContainer = document.createElement("div");
    btnContainer.className = "entry-buttons";

    // Pin/Unpin button
    const pinBtn = document.createElement("button");
    pinBtn.className = "pin-btn" + (entry.pinned ? " pinned" : "");
    pinBtn.title = entry.pinned ? "Unpin entry" : "Pin entry";
    pinBtn.innerHTML = entry.pinned ? "📌" : "📍";
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePin(entry.id);
    });
    btnContainer.appendChild(pinBtn);

    // Delete button
    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.title = "Delete entry";
    delBtn.textContent = "🗑️";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteEntry(entry.id);
    });
    btnContainer.appendChild(delBtn);

    entryDiv.appendChild(btnContainer);

    // Click to copy to clipboard
    entryDiv.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(entry.text);

        // Visual feedback
        entryDiv.classList.add("copied");
        setTimeout(() => {
          entryDiv.classList.remove("copied");
        }, 500);

        // Optional: Show toast notification
        showToast("Copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy text:", err);
        showToast("Failed to copy text", "error");
      }
    });

    container.appendChild(entryDiv);
  });
}

// Show toast notification
function showToast(message, type = "success") {
  // Create toast element
  const toast = document.createElement("div");
  toast.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: ${type === "error" ? "#dc3545" : "#28a745"};
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2000);
}

// Toggle pinned status of an entry
function togglePin(id) {
  chrome.runtime.sendMessage({ type: "TOGGLE_PIN", id }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Runtime error:", chrome.runtime.lastError);
      showToast("Failed to toggle pin status", "error");
      return;
    }

    if (response && response.success) {
      loadAndRenderHistory();
    } else {
      console.error("Failed to toggle pin:", response);
      showToast("Failed to toggle pin status", "error");
    }
  });
}

// Delete an entry
function deleteEntry(id) {
  if (!confirm("Are you sure you want to delete this entry?")) {
    return;
  }

  chrome.runtime.sendMessage({ type: "DELETE_ENTRY", id }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Runtime error:", chrome.runtime.lastError);
      showToast("Failed to delete entry", "error");
      return;
    }

    if (response && response.success) {
      loadAndRenderHistory();
      showToast("Entry deleted");
    } else {
      console.error("Failed to delete entry:", response);
      showToast("Failed to delete entry", "error");
    }
  });
}

// Clear all history
function clearAllHistory() {
  if (
    !confirm(
      "Are you sure you want to clear all clipboard history? This cannot be undone."
    )
  ) {
    return;
  }

  chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Runtime error:", chrome.runtime.lastError);
      showToast("Failed to clear history", "error");
      return;
    }

    if (response && response.success) {
      allEntries = [];
      renderEntries();
      updateEntryCount();
      showToast("History cleared");
    } else {
      console.error("Failed to clear history:", response);
      showToast("Failed to clear history", "error");
    }
  });
}

// Debounce function for search
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// On DOM ready: setup search and load history
document.addEventListener("DOMContentLoaded", () => {
  console.log("Popup DOM loaded");

  const searchInput = document.getElementById("searchInput");
  const clearAllBtn = document.getElementById("clearAllBtn");

  if (!searchInput) {
    console.error("Search input not found.");
    return;
  }

  // Setup search with debouncing
  const debouncedRender = debounce(renderEntries, 300);
  searchInput.addEventListener("input", debouncedRender);

  // Setup clear all button
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", clearAllHistory);
  }

  // Load history on startup
  loadAndRenderHistory();

  // Auto-focus search input
  setTimeout(() => {
    searchInput.focus();
  }, 100);
});

// Handle keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Escape to clear search
  if (e.key === "Escape") {
    const searchInput = document.getElementById("searchInput");
    if (searchInput && searchInput.value) {
      searchInput.value = "";
      renderEntries();
    }
  }

  // Ctrl/Cmd + K to focus search
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
});
