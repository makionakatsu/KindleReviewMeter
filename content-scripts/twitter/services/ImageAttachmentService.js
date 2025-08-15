/**
 * Image Attachment Service for Twitter/X Integration
 * 
 * Extracted from x-tweet-auto-attach.js for better separation of concerns
 * 
 * Responsibilities:
 * - Convert data URLs to File objects for DOM manipulation
 * - Execute the 5-tier attachment strategy with comprehensive fallbacks
 * - Handle file input assignment, drag-and-drop, paste simulation
 * - Manage attachment state to prevent duplicates
 * - Provide enhanced error handling and recovery
 * 
 * Strategy Implementation:
 * 1. Direct file input assignment (preferred method)
 * 2. Multi-zone drag-and-drop simulation
 * 3. Enhanced paste event targeting with focus management
 * 4. Hidden file input creation and propagation
 * 5. User-friendly fallback UI (handled by TwitterUIFallbackService)
 */

(function() {
  'use strict';
  
  class ImageAttachmentService {
    constructor() {
      this.attachmentInProgress = false;
      this.attachmentCompleted = false;
      this.pendingDataUrl = null;
    }

    /**
     * Convert data URL to File object
     * @param {string} dataUrl - Base64 data URL
     * @param {string} filename - Optional filename (will be inferred if not provided)
     * @returns {File} File object ready for DOM operations
     */
    dataUrlToFile(dataUrl, filename = null) {
      const arr = dataUrl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      
      // Infer extension from MIME if filename not provided or extension mismatched
      let ext = 'png';
      if (/jpeg|jpg/i.test(mime)) ext = 'jpg';
      else if (/png/i.test(mime)) ext = 'png';
      else if (/webp/i.test(mime)) ext = 'webp';
      
      const base = 'kindle-review-image';
      const inferredName = `${base}.${ext}`;
      const finalName = (filename && filename.includes('.')) ? filename : inferredName;
      
      return new File([u8arr], finalName, { type: mime });
    }

    /**
     * Primary Image Attachment Handler - 5-Tier Strategy
     * @param {string} dataUrl - Base64 image data URL
     * @returns {Promise<boolean>} Success status
     */
    async attachViaDataUrl(dataUrl) {
      try {
        console.log('ImageAttachmentService: attachViaDataUrl called with dataUrl length:', dataUrl?.length);
        
        if (!dataUrl && this.pendingDataUrl) dataUrl = this.pendingDataUrl;
        if (!dataUrl) {
          console.warn('ImageAttachmentService: No dataUrl available to attach');
          return false;
        }
        
        // Prevent duplicate attachments
        if (this.attachmentInProgress) {
          console.log('ImageAttachmentService: Attachment already in progress, skipping');
          return false;
        }
        
        if (this.attachmentCompleted) {
          console.log('ImageAttachmentService: Attachment already completed, skipping');
          return true;
        }
        
        this.attachmentInProgress = true;
        this.pendingDataUrl = dataUrl;
        
        // Get required services
        const selectorService = window.TwitterSelectorService ? new window.TwitterSelectorService() : null;
        if (!selectorService) {
          console.error('ImageAttachmentService: TwitterSelectorService not available');
          return false;
        }

        // Observe DOM briefly to catch dynamically injected file inputs
        const waitForFileInputAppears = (ms = 4000) => new Promise((resolve) => {
          let resolved = false;
          const found = document.querySelector('input[type="file"]');
          if (found) { resolve(found); return; }
          const obs = new MutationObserver(() => {
            const el = document.querySelector('input[type="file"]');
            if (el && !resolved) { resolved = true; obs.disconnect(); resolve(el); }
          });
          obs.observe(document.documentElement, { childList: true, subtree: true });
          setTimeout(() => { if (!resolved) { obs.disconnect(); resolve(null); } }, ms);
        });
        
        // Get elements through selector service
        let { fileInput, composerTextbox } = await selectorService.waitForElements({ 
          requireFileInput: false, 
          timeoutMs: 8000 
        });
        
        if (!fileInput) {
          // Try deep search as a fallback
          fileInput = selectorService.findAnyFileInput();
          if (fileInput) {
            console.log('ImageAttachmentService: Found file input via deep search');
          } else {
            // Last try: wait a bit with MutationObserver for dynamically added inputs
            fileInput = await waitForFileInputAppears(2000);
            if (fileInput) console.log('ImageAttachmentService: Found file input via observer');
          }
        }
        
        console.log('ImageAttachmentService: Found elements:', { 
          hasFileInput: !!fileInput, 
          hasComposerTextbox: !!composerTextbox 
        });
        
        const file = this.dataUrlToFile(dataUrl);
        console.log('ImageAttachmentService: Converted dataUrl to file:', { 
          name: file.name, 
          size: file.size, 
          type: file.type 
        });

        // Method 1: Direct file input assignment (preferred and most reliable)
        if (fileInput) {
          try {
            console.log('ImageAttachmentService: Attempting method 1: direct file input assignment');
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            
            // Trigger multiple events to ensure detection
            const events = ['change', 'input'];
            for (const eventType of events) {
              const event = new Event(eventType, { bubbles: true });
              fileInput.dispatchEvent(event);
            }
            
            // Also try to click tweet area to force UI update
            if (composerTextbox && composerTextbox.focus) composerTextbox.focus();
            composerTextbox?.dispatchEvent(new Event('focus', { bubbles: true }));
            document.body.dispatchEvent(new Event('click', { bubbles: true }));
            
            console.log('ImageAttachmentService: Image attached via file input');
            this.attachmentCompleted = true;
            return true;
          } catch (e) {
            console.warn('ImageAttachmentService: File input attach failed:', e);
          }
        }

        // Method 2: Enhanced drag-and-drop simulation on multiple zones
        const success = await this._tryDragDropMethod(file);
        if (success) return true;

        // Method 3: Enhanced paste simulation with proper targeting
        const pasteSuccess = await this._tryPasteMethod(file, composerTextbox);
        if (pasteSuccess) return true;

        // Method 4: Hidden file input creation and propagation
        const hiddenSuccess = await this._tryHiddenInputMethod(file, fileInput);
        if (hiddenSuccess) return true;

        // Method 5: Show user-friendly fallback overlay (handled by TwitterUIFallbackService)
        console.log('ImageAttachmentService: All automatic attachment methods failed, showing fallback UI');
        const fallbackService = window.TwitterUIFallbackService ? new window.TwitterUIFallbackService() : null;
        if (fallbackService) {
          fallbackService.showFallbackOverlay(dataUrl);
        }
        
        // Return true to indicate the process completed (even if manually)
        this.attachmentCompleted = true;
        return true;
        
      } catch (error) {
        console.error('ImageAttachmentService: attachViaDataUrl error:', error);
        const fallbackService = window.TwitterUIFallbackService ? new window.TwitterUIFallbackService() : null;
        if (fallbackService) {
          fallbackService.showFallbackOverlay(dataUrl);
        }
        return false;
      } finally {
        // Only reset inProgress flag if attachment wasn't completed successfully
        if (!this.attachmentCompleted) {
          this.attachmentInProgress = false;
        }
      }
    }

    /**
     * Method 2: Try drag-and-drop on multiple zones
     * @private
     */
    async _tryDragDropMethod(file) {
      const dropZoneSelectors = [
        '[data-testid="attachments"]',
        '[data-testid="toolBar"]',
        '[data-testid="primaryColumn"]',
        '[data-testid="tweetTextarea_0"]',
        '[role="group"]',
        '[role="main"]',
        'div[contenteditable="true"]'
      ];
      
      const dropOn = async (target, file) => {
        const dt = new DataTransfer();
        dt.items.add(file);
        const dragEnterEvent = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt });
        const dragOverEvent  = new DragEvent('dragover',  { bubbles: true, cancelable: true, dataTransfer: dt });
        const dropEvent      = new DragEvent('drop',      { bubbles: true, cancelable: true, dataTransfer: dt });
        target.dispatchEvent(dragEnterEvent);
        await new Promise(r=>setTimeout(r,80));
        target.dispatchEvent(dragOverEvent);
        await new Promise(r=>setTimeout(r,80));
        target.dispatchEvent(dropEvent);
      };
      
      for (const selector of dropZoneSelectors) {
        const dropZone = document.querySelector(selector);
        if (dropZone) {
          try {
            console.log(`ImageAttachmentService: Attempting method 2: drag and drop on ${selector}`);
            await dropOn(dropZone, file);
            
            console.log(`ImageAttachmentService: Image attached via drag-drop on ${selector}`);
            this.attachmentCompleted = true;
            return true;
          } catch (e) {
            console.warn(`ImageAttachmentService: Drag-drop on ${selector} failed:`, e);
          }
        }
      }
      
      // Last-chance global drop on body/main if specific zones failed
      try {
        console.log('ImageAttachmentService: Attempting method 2 fallback: drag and drop on document.body');
        await dropOn(document.body, file);
        console.log('ImageAttachmentService: Image attached via drag-drop on body');
        this.attachmentCompleted = true;
        return true;
      } catch (e) {
        console.warn('ImageAttachmentService: Body drag-drop fallback failed:', e);
      }
      
      return false;
    }

    /**
     * Method 3: Try paste simulation with proper targeting
     * @private
     */
    async _tryPasteMethod(file, composerTextbox) {
      const pasteTargets = [
        composerTextbox,
        document.querySelector('[data-testid="tweetTextarea_0"]'),
        document.querySelector('[role="textbox"]'),
        document.activeElement,
        document.body
      ].filter(Boolean);
      
      for (const target of pasteTargets) {
        try {
          console.log('ImageAttachmentService: Attempting method 3: paste simulation on', target.tagName);
          
          // Focus the target first
          if (target.focus) target.focus();
          
          // Create a more realistic clipboard event
          const clipboardData = new DataTransfer();
          clipboardData.items.add(file);
          
          const pasteEvent = new ClipboardEvent('paste', { 
            bubbles: true, 
            cancelable: true,
            clipboardData: clipboardData 
          });
          
          target.dispatchEvent(pasteEvent);
          console.log('ImageAttachmentService: Image attached via paste simulation');
          this.attachmentCompleted = true;
          return true;
        } catch (e) {
          console.warn('ImageAttachmentService: Paste simulation failed:', e);
        }
      }
      
      return false;
    }

    /**
     * Method 4: Try hidden file input method
     * @private
     */
    async _tryHiddenInputMethod(file, fileInput) {
      try {
        console.log('ImageAttachmentService: Attempting method 4: Force file dialog trigger');
        
        // Create a hidden file input and trigger it
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'file';
        hiddenInput.accept = 'image/*';
        hiddenInput.style.display = 'none';
        document.body.appendChild(hiddenInput);
        
        // Set the file to our generated file
        const dt = new DataTransfer();
        dt.items.add(file);
        hiddenInput.files = dt.files;
        
        // Trigger change event
        const changeEvent = new Event('change', { bubbles: true });
        hiddenInput.dispatchEvent(changeEvent);
        
        // Try to propagate the file selection to Twitter's file input
        if (fileInput) {
          fileInput.files = hiddenInput.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        document.body.removeChild(hiddenInput);
        
        console.log('ImageAttachmentService: Image attached via hidden file input method');
        this.attachmentCompleted = true;
        return true;
      } catch (e) {
        console.warn('ImageAttachmentService: Hidden file input method failed:', e);
      }
      
      return false;
    }

    /**
     * Reset attachment state
     */
    reset() {
      this.attachmentInProgress = false;
      this.attachmentCompleted = false;
      this.pendingDataUrl = null;
    }

    /**
     * Get current attachment state
     */
    getState() {
      return {
        inProgress: this.attachmentInProgress,
        completed: this.attachmentCompleted,
        hasPendingData: !!this.pendingDataUrl
      };
    }
  }
  
  // Make available globally within IIFE context
  window.ImageAttachmentService = ImageAttachmentService;
  
})();