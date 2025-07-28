// background.js
// Add this to the top of your background script
chrome.runtime.onInstalled.addListener(() => {
  // Notify content scripts about reload
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      try {
        // Only send to tabs where content scripts can execute
        if (tab.url && tab.url.startsWith("http")) {
          chrome.tabs
            .sendMessage(tab.id, { type: "EXTENSION_RELOADED" })
            .catch((err) => console.debug("Tab not ready:", tab.id, err));
        }
      } catch (e) {
        console.debug("Tab message error:", e);
      }
    }
  });
});

console.log("Background script started");

async function getHistory() {
  try {
    const result = await chrome.storage.local.get("history");
    return Array.isArray(result.history) ? result.history : [];
  } catch (error) {
    console.error("Error getting history:", error);
    return [];
  }
}

async function saveHistory(historyArray) {
  try {
    await chrome.storage.local.set({ history: historyArray });
    return true;
  } catch (error) {
    console.error("Error saving history:", error);
    return false;
  }
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  // Handle new clipboard entries
  if (message.type === "NEW_CLIPBOARD_ENTRY") {
    (async () => {
      try {
        const text = message.text?.trim();
        if (!text || text.length === 0) {
          sendResponse({ success: false, error: "Empty text" });
          return;
        }

        const historyArray = await getHistory();
        const timestamp = Date.now();
        const id = timestamp.toString();

        // Skip duplicates (check last 5 entries to avoid recent duplicates)
        const recentEntries = historyArray.slice(-5);
        const isDuplicate = recentEntries.some((entry) => entry.text === text);

        if (isDuplicate) {
          sendResponse({ success: false, error: "Duplicate entry" });
          return;
        }
        // Add this to the top of background.js
        chrome.runtime.onInstalled.addListener(() => {
          // Notify all tabs about reload
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
              try {
                chrome.tabs.sendMessage(tab.id, { type: "EXTENSION_RELOADED" });
              } catch (e) {
                console.debug("Tab not ready for reload message");
              }
            });
          });
        });
        chrome.runtime.onSuspend.addListener(() => {
          console.log("Extension context unloading");
        });

        // Add new entry
        const newEntry = {
          id,
          text,
          pinned: false,
          timestamp,
        };

        historyArray.push(newEntry);

        // Maintain max 200 items (remove oldest unpinned items first)
        if (historyArray.length > 200) {
          // Separate pinned and unpinned
          const pinned = historyArray.filter((e) => e.pinned);
          const unpinned = historyArray.filter((e) => !e.pinned);

          // Keep most recent unpinned items
          const maxUnpinned = 200 - pinned.length;
          const trimmedUnpinned = unpinned.slice(-maxUnpinned);

          // Combine and sort
          const newHistory = [...pinned, ...trimmedUnpinned].sort(
            (a, b) => a.timestamp - b.timestamp
          );
          await saveHistory(newHistory);
        } else {
          await saveHistory(historyArray);
        }

        sendResponse({ success: true });
      } catch (error) {
        console.error("Error handling clipboard entry:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Indicates async response
  }

  // Handle history requests
  if (message.type === "GET_HISTORY") {
    (async () => {
      try {
        const history = await getHistory();
        sendResponse({ success: true, history });
      } catch (error) {
        console.error("Error getting history:", error);
        sendResponse({ success: false, history: [], error: error.message });
      }
    })();
    return true;
  }

  // Handle pin toggling
  if (message.type === "TOGGLE_PIN") {
    (async () => {
      try {
        const historyArray = await getHistory();
        const entry = historyArray.find((e) => e.id === message.id);

        if (entry) {
          entry.pinned = !entry.pinned;
          await saveHistory(historyArray);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Entry not found" });
        }
      } catch (error) {
        console.error("Error toggling pin:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Handle deletions
  if (message.type === "DELETE_ENTRY") {
    (async () => {
      try {
        let historyArray = await getHistory();
        const originalLength = historyArray.length;
        historyArray = historyArray.filter((e) => e.id !== message.id);

        if (historyArray.length < originalLength) {
          await saveHistory(historyArray);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Entry not found" });
        }
      } catch (error) {
        console.error("Error deleting entry:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Handle clear all
  if (message.type === "CLEAR_HISTORY") {
    (async () => {
      try {
        await saveHistory([]);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error clearing history:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log("Clipboard History extension installed");
});
