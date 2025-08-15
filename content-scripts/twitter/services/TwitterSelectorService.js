/**
 * Twitter DOM Element Selection Service
 * 
 * Extracted from x-tweet-auto-attach.js for better separation of concerns
 * 
 * Responsibilities:
 * - Find and interact with X/Twitter compose interface elements
 * - Locate file input elements with various fallback strategies
 * - Detect attachment buttons and trigger them safely
 * - Provide DOM element scoring and selection logic
 * 
 * This service handles all DOM-related operations for Twitter integration
 * without containing business logic for the attachment process itself.
 */

(function() {
  'use strict';
  
  class TwitterSelectorService {
    constructor() {
      this.nativeClickAttempts = 0;
      this.maxNativeClickAttempts = 0; // Avoid native file dialog
    }

    /**
     * Wait for X/Twitter compose elements to become available
     * @param {Object} options - Configuration options
     * @param {boolean} options.requireFileInput - Whether file input is required
     * @param {number} options.timeoutMs - Timeout in milliseconds
     * @returns {Promise<Object>} Promise resolving to found elements
     */
    waitForElements(options = {}) {
      const { requireFileInput = false, timeoutMs = 8000 } = options;
      const startedAt = Date.now();
      return new Promise((resolve) => {
        const checkForElements = () => {
          console.log('TwitterSelectorService: Searching for X/Twitter elements...');
          
          // Look for X/Twitter's file input or drag-drop area - updated selectors
          const fileInputSelectors = [
            'input[type="file"][accept*="image"]',
            'input[type="file"]',
            'input[data-testid*="fileInput"]',
            'input[data-testid*="attachments"]'
          ];
          
          let fileInput = null;
          for (const selector of fileInputSelectors) {
            fileInput = document.querySelector(selector);
            if (fileInput) {
              console.log('TwitterSelectorService: Found file input with selector:', selector);
              break;
            }
          }
          
          const composerSelectors = [
            '[data-testid="tweetTextarea_0"]',
            '[data-testid="tweetButton"]',
            '[contenteditable="true"]',
            'textarea[placeholder*="happening"]',
            '[data-testid="toolBar"]',
            '[role="textbox"]'
          ];
          
          let composerTextbox = null;
          for (const selector of composerSelectors) {
            composerTextbox = document.querySelector(selector);
            if (composerTextbox) {
              console.log('TwitterSelectorService: Found composer with selector:', selector);
              break;
            }
          }
          
          console.log('TwitterSelectorService: Element search results:', {
            hasFileInput: !!fileInput,
            hasComposerTextbox: !!composerTextbox,
            fileInputType: fileInput?.type,
            fileInputAccept: fileInput?.accept
          });
          
          const haveComposer = !!composerTextbox;
          const haveInput = !!fileInput;
          const elapsed = Date.now() - startedAt;
          if (haveComposer && (haveInput || !requireFileInput)) {
            resolve({ fileInput, composerTextbox });
          } else if (elapsed > timeoutMs && haveComposer) {
            console.warn('TwitterSelectorService: Timeout waiting for file input; proceeding with composer only');
            resolve({ fileInput: null, composerTextbox });
          } else {
            setTimeout(checkForElements, 400);
          }
        };
        checkForElements();
      });
    }

    /**
     * Find and click attachment button to reveal file input
     * @returns {Promise<boolean>} Success status
     */
    async findAndClickAttachmentButton() {
      if (this.nativeClickAttempts >= this.maxNativeClickAttempts) {
        console.log('TwitterSelectorService: Skipping attachment button click to avoid native file dialog');
        return false;
      }
      this.nativeClickAttempts++;
      
      const attachButtonSelectors = [
        // Common toolbar buttons
        '[data-testid="attachments"]',
        '[data-testid="toolBarAttachments"]',
        // Possible buttons with accessible labels (EN/JA)
        'button[aria-label*="Add photos" i]',
        'button[aria-label*="Add media" i]',
        '[aria-label*="Media" i]',
        '[aria-label*="写真" i]',
        '[aria-label*="画像" i]',
        '[aria-label*="メディア" i]',
        // Fallback: toolbar container clickable
        '[data-testid="toolBar"] [role="button"]',
      ];
      
      try {
        for (const selector of attachButtonSelectors) {
          const button = document.querySelector(selector);
          if (button) {
            console.log('TwitterSelectorService: Found attachment button with selector:', selector);
            try {
              // Prefer native click; if blocked, simulate mouse event
              if (typeof button.click === 'function') {
                button.click();
              } else {
                const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                button.dispatchEvent(evt);
              }
            } catch (e) {
              console.warn('TwitterSelectorService: Attachment button click failed:', e);
            }
            await new Promise(resolve => setTimeout(resolve, 250)); // Wait for file input to appear
            return true;
          }
        }
        console.log('TwitterSelectorService: No attachment button found (non-fatal)');
        return false;
      } catch (err) {
        console.warn('TwitterSelectorService: findAndClickAttachmentButton error (non-fatal):', err);
        return false;
      }
    }

    /**
     * Deep search for any file input in the document (even if hidden)
     * @returns {HTMLInputElement|null} Best scoring file input element
     */
    findAnyFileInput() {
      const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
      if (inputs.length === 0) return null;
      
      // Prefer inputs that accept images or are inside compose
      const scored = inputs.map((el) => {
        let score = 0;
        const accept = (el.getAttribute('accept') || '').toLowerCase();
        if (accept.includes('image')) score += 2;
        
        // Heuristic: closer to tweet composer
        let p = el.parentElement; 
        let depth = 0;
        while (p && depth < 5) {
          const ds = p.getAttribute('data-testid') || '';
          if (ds.includes('attachments') || ds.includes('toolBar')) score += 1;
          p = p.parentElement; 
          depth++;
        }
        return { el, score };
      }).sort((a,b) => b.score - a.score);
      
      return (scored[0] && scored[0].el) || inputs[0];
    }

    /**
     * Reset native click attempts counter
     */
    resetClickAttempts() {
      this.nativeClickAttempts = 0;
    }
  }
  
  // Make available globally within IIFE context
  window.TwitterSelectorService = TwitterSelectorService;
  
})();