/**
 * TwitterSelectorService - DOM discovery helpers for X compose UI
 * Extracted plan from x-tweet-auto-attach.js (no runtime wiring yet)
 * Notes: This file is scaffolding per REFACTORING_EXECUTION_PLAN. It is NOT imported yet.
 */
(function(){
  'use strict';

  class TwitterSelectorService {
    /**
     * Locate composer and (optionally) file input with timeout and retries.
     * Mirrors original behavior from x-tweet-auto-attach.js
     */
    async waitForElements(options = {}) {
      const { requireFileInput = false, timeoutMs = 8000 } = options;
      const startedAt = Date.now();
      return new Promise((resolve) => {
        const checkForElements = () => {
          // File input candidates
          const fileInputSelectors = [
            'input[type="file"][accept*="image"]',
            'input[type="file"]',
            'input[data-testid*="fileInput"]',
            'input[data-testid*="attachments"]',
            'input[aria-label*="image" i]',
            'input[aria-label*="photo" i]'
          ];
          let fileInput = null;
          for (const selector of fileInputSelectors) {
            fileInput = document.querySelector(selector);
            if (fileInput) break;
          }

          // Composer candidates
          const composerSelectors = [
            '[data-testid="tweetTextarea_0"]',
            '[data-testid="tweetButton"]',
            '[contenteditable="true"]',
            'textarea[placeholder*="happening"]',
            '[data-testid="toolBar"]',
            '[role="textbox"]',
            '[data-testid="tweet-composer"]',
            '[data-testid="primaryColumn"] [contenteditable]'
          ];
          let composerTextbox = null;
          for (const selector of composerSelectors) {
            composerTextbox = document.querySelector(selector);
            if (composerTextbox) break;
          }

          const haveComposer = !!composerTextbox;
          const haveInput = !!fileInput;
          const elapsed = Date.now() - startedAt;
          if (haveComposer && (haveInput || !requireFileInput)) {
            resolve({ fileInput, composerTextbox });
          } else if (elapsed > timeoutMs && haveComposer) {
            resolve({ fileInput: null, composerTextbox });
          } else {
            setTimeout(checkForElements, 400);
          }
        };
        checkForElements();
      });
    }

    /**
     * Deep search for any file input in the document
     */
    findAnyFileInput() {
      const inputs = document.querySelectorAll('input[type="file"]');
      for (const input of inputs) {
        if (input.offsetParent !== null || input.style.display !== 'none') {
          return input;
        }
      }
      if (inputs.length > 0) return inputs[0];
      return null;
    }

    /**
     * Ensure Twitter's file input is available by clicking attachment UI.
     * Mirrors stable content-script behavior (no timing changes).
     * @returns {Promise<boolean>} true if a file input is present
     */
    async findAndClickAttachmentButton() {
      // If already present, succeed fast
      if (document.querySelector('input[type="file"]')) return true;

      const candidates = [
        '[data-testid="attachments"]',
        '[data-testid="toolBar"] [role="button"]',
        'button[aria-label*="画像" i]',
        'button[aria-label*="写真" i]',
        'button[aria-label*="Add" i]',
        'button[aria-label*="Media" i]'
      ];

      for (const selector of candidates) {
        const btn = document.querySelector(selector);
        if (btn) {
          try { btn.click(); } catch {}
        }
        const input = document.querySelector('input[type="file"]');
        if (input) return true;
      }
      return !!document.querySelector('input[type="file"]');
    }
  }

  // Expose to window for future non-module access
  window.TwitterSelectorService = TwitterSelectorService;
})();
