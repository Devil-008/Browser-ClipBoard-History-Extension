(() => {
  "use strict";
  console.log("Clipboard History: Content script loaded");

  let isActive = true;
  let lastText = "";
  const extensionId = chrome.runtime.id;

  // Reset state when extension reloads
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "EXTENSION_RELOADED") {
      console.log("Extension reload detected, resetting context");
      isActive = true;
      lastText = "";
    }
  });

  // Robust text selection handler
  function getSelectedText() {
    try {
      // Standard selection
      if (typeof window.getSelection === "function") {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          return selection.toString().trim();
        }
      }

      // For input fields
      const activeElement = document.activeElement;
      if (activeElement) {
        if (
          activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA"
        ) {
          return activeElement.value
            .slice(activeElement.selectionStart, activeElement.selectionEnd)
            .trim();
        }

        // For contenteditable elements
        if (activeElement.isContentEditable) {
          const sel = window.getSelection();
          return sel ? sel.toString().trim() : "";
        }
      }
    } catch (e) {
      console.warn("Selection error:", e);
    }
    return "";
  }

  // Safe message sending with context validation
  function saveClipboard(text) {
    if (!text || text === lastText || !isActive) return;
    lastText = text;

    try {
      // Verify extension context before sending
      if (!chrome.runtime?.id) {
        console.warn("Extension context invalid, skipping send");
        isActive = false;
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: "NEW_CLIPBOARD_ENTRY",
          text: text,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn("Message failed:", chrome.runtime.lastError.message);
            if (chrome.runtime.lastError.message.includes("context")) {
              isActive = false;
            }
          }
        }
      );
    } catch (err) {
      console.warn("Runtime error:", err.message);
      isActive = false;
    }
  }

  // Clipboard capture with multiple fallbacks
  async function captureClipboard(event) {
    if (!isActive) return;

    try {
      let text = "";

      // 1. Try direct clipboard reading
      try {
        text = await navigator.clipboard.readText();
      } catch (error) {
        console.debug("Clipboard API blocked, using fallbacks");
      }

      // 2. Try from clipboardData in copy event
      if (!text && event?.clipboardData) {
        text = event.clipboardData.getData("text/plain");
      }

      // 3. Try from current selection
      if (!text) {
        text = getSelectedText();
      }

      // 4. Final fallback: read from system clipboard after delay
      if (!text) {
        setTimeout(async () => {
          try {
            const fallbackText = await navigator.clipboard.readText();
            if (fallbackText && fallbackText !== lastText) {
              saveClipboard(fallbackText.trim());
            }
          } catch (e) {
            console.debug("Final fallback failed");
          }
        }, 300);
      }

      if (text) {
        saveClipboard(text.trim());
      }
    } catch (error) {
      console.warn("Clipboard capture error:", error);
    }
  }

  // Event listeners with context validation
  function setupListeners() {
    try {
      document.addEventListener("copy", (e) => {
        setTimeout(() => captureClipboard(e), 50);
      });

      document.addEventListener("mousedown", (e) => {
        if (e.button === 2) {
          // Right click
          setTimeout(() => captureClipboard(), 300);
        }
      });

      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
          setTimeout(() => captureClipboard(), 50);
        }
      });
    } catch (error) {
      console.error("Listener setup failed:", error);
    }
  }

  // Initialize with context check
  if (chrome.runtime?.id) {
    setupListeners();
  } else {
    console.warn("Extension context invalid at initialization");
    isActive = false;
  }
})();
