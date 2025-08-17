/**
 * Content Script for X (Twitter) Tweet Intent Auto Image Attachment
 * 
 * EMERGENCY RESTORATION: Integrated Stable Version
 * Restored from commit 48c4a15 with latest improvements integrated
 * 
 * Architecture Overview:
 * This content script runs on X/Twitter compose pages and handles automatic
 * image attachment for Kindle Review Meter generated progress images.
 * 
 * Key Responsibilities:
 * - Detect and interact with X/Twitter's compose interface elements
 * - Receive image data from background script via message passing
 * - Attempt multiple image attachment strategies for maximum compatibility
 * - Provide fallback UI when automatic attachment fails
 * - Prevent duplicate attachment attempts and manage state
 * 
 * Attachment Strategy (5-tier fallback system):
 * 1. Direct file input assignment (preferred method)
 * 2. Enhanced drag-and-drop simulation on multiple drop zones
 * 3. Paste event simulation with proper targeting and focus
 * 4. Hidden file input creation and propagation
 * 5. User-friendly fallback overlay with manual instructions
 * 
 * Communication Flow:
 * Background Script → Content Script → X/Twitter Interface → User
 * 
 * Emergency Restoration Note:
 * This version consolidates the proven stable functionality from commit 48c4a15
 * with enhanced error handling and latest compatibility improvements, reverting
 * from the fragmented service architecture to ensure reliable image attachment.
 */

(function() {
  'use strict';
  
  // Removed CONFIG restrictions to match commit 6ec556190c291da3123b8440ea00438051735ffe behavior
  
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  // Prevent multiple attachment attempts
  let attachmentInProgress = false;
  let attachmentCompleted = false;
  let pendingDataUrl = null;
  let attachmentAttemptId = 0; // Track attachment attempts for debugging
  
  // Global session state to prevent duplicate script execution
  if (window.krmAttachmentSession) {
    console.log('KindleReviewMeter content script already loaded, skipping duplicate execution');
    return;
  }
  window.krmAttachmentSession = {
    loaded: true,
    timestamp: Date.now(),
    scriptId: Math.random().toString(36).substr(2, 9),
    attachmentButtonClicked: false // Prevent multiple button clicks globally
  };

  console.log('KindleReviewMeter: X tweet auto-attach script loaded (Integrated Stable Version)');

  // ============================================================================
  // DOM ELEMENT DISCOVERY SERVICE
  // ============================================================================
  
  /**
   * X/Twitter Interface Element Discovery
   * 
   * Responsibilities:
   * - Locate file input elements for direct file assignment
   * - Find composer interface elements for drag-drop and paste operations
   * - Handle dynamic content loading and element changes
   * - Provide comprehensive selector coverage for UI variations
   */
  const selectorService = new (window.TwitterSelectorService || function(){})();
  async function waitForElements(options = {}) {
    if (selectorService && selectorService.waitForElements) {
      return selectorService.waitForElements(options);
    }
    // Fallback to legacy inline logic (should not happen once wired)
    return { fileInput: document.querySelector('input[type="file"]') || null, composerTextbox: document.querySelector('[role="textbox"]') || null };
  }

  /**
   * Deep search for any file input in the document
   */
  function findAnyFileInput() {
    if (selectorService && selectorService.findAnyFileInput) {
      return selectorService.findAnyFileInput();
    }
    return document.querySelector('input[type="file"]');
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  // Service delegation (safe wrappers)
  const imageService = new (window.ImageAttachmentService || function(){})();
  const fallbackService = new (window.TwitterUIFallbackService || function(){})();
  function dataUrlToFile(dataUrl, filename = null) {
    if (imageService && typeof imageService.dataUrlToFile === 'function') {
      return imageService.dataUrlToFile(dataUrl, filename);
    }
    // Minimal fallback
    const arr = dataUrl.split(',');
    const u8arr = new Uint8Array(atob(arr[1]).split('').map(c => c.charCodeAt(0)));
    return new File([u8arr], filename || 'kindle-review-image.png', { type: 'image/png' });
  }

  // ============================================================================
  // ATTACHMENT BUTTON DISCOVERY
  // ============================================================================
  
  /**
   * Find and click attachment button to reveal file input
   */
  async function findAndClickAttachmentButton() {
    if (selectorService && selectorService.findAndClickAttachmentButton) {
      return selectorService.findAndClickAttachmentButton();
    }
    // Minimal fallback
    return !!document.querySelector('input[type="file"]');
  }

  // ============================================================================
  // PRIMARY IMAGE ATTACHMENT SYSTEM
  // ============================================================================
  
  /**
   * Primary Image Attachment Handler - 5-Tier Strategy
   */
  async function attachViaDataUrl(dataUrl) {
    const currentAttemptId = ++attachmentAttemptId;
    try {
      console.log(`[Attempt ${currentAttemptId}] attachViaDataUrl called with dataUrl length:`, dataUrl?.length);
      
      if (!dataUrl && pendingDataUrl) dataUrl = pendingDataUrl;
      if (!dataUrl) {
        console.warn(`[Attempt ${currentAttemptId}] No dataUrl available to attach`);
        return false;
      }
      
      // Prevent duplicate attachments
      if (attachmentInProgress) {
        console.log(`[Attempt ${currentAttemptId}] Attachment already in progress, skipping`);
        return false;
      }
      
      if (attachmentCompleted) {
        console.log(`[Attempt ${currentAttemptId}] Attachment already completed, skipping`);
        return true;
      }
      
      attachmentInProgress = true;
      pendingDataUrl = dataUrl;
      
      // DO NOT reset attachmentButtonClicked here to prevent duplicate finder dialogs
      // attachmentButtonClicked flag should only be reset on script reload or explicit failure
      
      console.log(`[Attempt ${currentAttemptId}] Starting attachment process...`);
      
      // Search for existing file inputs without clicking buttons to prevent finder dialog
      await findAndClickAttachmentButton();

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
      
      // Get elements
      let { fileInput, composerTextbox } = await waitForElements({ 
        requireFileInput: false, 
        timeoutMs: 1000 
      });
      
      if (!fileInput) {
        // Try deep search as a fallback
        fileInput = findAnyFileInput();
        if (fileInput) {
          console.log('Found file input via deep search');
        } else {
          // Short observer to avoid blocking the first attempt
          fileInput = await waitForFileInputAppears(200);
          if (fileInput) console.log('Found file input via short observer');
        }
      }
      
      console.log(`[Attempt ${currentAttemptId}] Found elements:`, { 
        hasFileInput: !!fileInput, 
        hasComposerTextbox: !!composerTextbox 
      });
      
      const file = dataUrlToFile(dataUrl);
      console.log(`[Attempt ${currentAttemptId}] Converted dataUrl to file:`, { 
        name: file.name, 
        size: file.size, 
        type: file.type 
      });

      // Method 1: Direct file input assignment (preferred and most reliable)
      if (fileInput) {
        try {
          console.log('Attempting method 1: direct file input assignment');
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
          
          console.log(`[Attempt ${currentAttemptId}] Image attached via file input`);
          attachmentCompleted = true;
          return true;
        } catch (e) {
          console.warn('File input attach failed:', e);
        }
      }

      // Method 2: Enhanced drag-and-drop simulation on multiple zones
      const dropZoneSelectors = [
        '[data-testid="attachments"]',
        '[data-testid="toolBar"]',
        '[data-testid="primaryColumn"]',
        '[data-testid="tweetTextarea_0"]',
        '[role="group"]',
        '[role="main"]',
        'div[contenteditable="true"]'
      ];
      
      async function dropOn(target, file) {
        if (imageService && typeof imageService.dropOn === 'function') {
          return imageService.dropOn(target, file);
        }
        const dt = new DataTransfer();
        dt.items.add(file);
        const dragEnterEvent = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt });
        const dragOverEvent  = new DragEvent('dragover',  { bubbles: true, cancelable: true, dataTransfer: dt });
        const dropEvent      = new DragEvent('drop',      { bubbles: true, cancelable: true, dataTransfer: dt });
        target.dispatchEvent(dragEnterEvent);
        await new Promise(r=>setTimeout(r,15));
        target.dispatchEvent(dragOverEvent);
        await new Promise(r=>setTimeout(r,15));
        target.dispatchEvent(dropEvent);
      }
      
      for (const selector of dropZoneSelectors) {
        const dropZone = document.querySelector(selector);
        if (dropZone) {
          try {
            console.log(`Attempting method 2: drag and drop on ${selector}`);
            await dropOn(dropZone, file);
            
            console.log(`Image attached via drag-drop on ${selector}`);
            attachmentCompleted = true;
            return true;
          } catch (e) {
            console.warn(`Drag-drop on ${selector} failed:`, e);
          }
        }
      }
      
      // Last-chance global drop on body/main if specific zones failed
      try {
        console.log('Attempting method 2 fallback: drag and drop on document.body');
        await dropOn(document.body, file);
        console.log('Image attached via drag-drop on body');
        attachmentCompleted = true;
        return true;
      } catch (e) {
        console.warn('Body drag-drop fallback failed:', e);
      }

      // Method 3: Enhanced paste simulation with proper targeting
      const pasteTargets = [
        composerTextbox,
        document.querySelector('[data-testid="tweetTextarea_0"]'),
        document.querySelector('[role="textbox"]'),
        document.activeElement,
        document.body
      ].filter(Boolean);
      
      for (const target of pasteTargets) {
        try {
          console.log('Attempting method 3: paste simulation on', target.tagName);
          
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
          console.log('Image attached via paste simulation');
          attachmentCompleted = true;
          return true;
        } catch (e) {
          console.warn('Paste simulation failed:', e);
        }
      }

      // Method 4: Hidden file input creation and propagation
      try {
        console.log('Attempting method 4: Force file dialog trigger');
        
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
        
        console.log('Image attached via hidden file input method');
        attachmentCompleted = true;
        return true;
      } catch (e) {
        console.warn('Hidden file input method failed:', e);
      }

      // Method 5: Show user-friendly fallback overlay
      console.log('All automatic attachment methods failed, showing fallback UI');
      showFallbackOverlay(dataUrl);
      
      // Return true to indicate the process completed (even if manually)
      attachmentCompleted = true;
      return true;
      
    } catch (error) {
      console.error('attachViaDataUrl error:', error);
      showFallbackOverlay(dataUrl);
      return false;
    } finally {
      // Only reset inProgress flag if attachment wasn't completed successfully
      if (!attachmentCompleted) {
        attachmentInProgress = false;
      }
    }
  }

  /**
   * Attachment using a prebuilt File object (binary path)
   */
  async function attachViaFile(file) {
    const currentAttemptId = ++attachmentAttemptId;
    try {
      if (!file) return false;
      if (attachmentInProgress) return false;
      if (attachmentCompleted) return true;
      attachmentInProgress = true;

      await findAndClickAttachmentButton();

      const waitForFileInputAppears = (ms = 800) => new Promise((resolve) => {
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

      let { fileInput, composerTextbox } = await waitForElements({ requireFileInput: false, timeoutMs: 1000 });
      if (!fileInput) {
        fileInput = document.querySelector('input[type="file"]') || await waitForFileInputAppears(500);
      }

      // Method 1: Direct input assignment
      if (fileInput) {
        try {
          const dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files;
          ['change','input'].forEach(t => fileInput.dispatchEvent(new Event(t, { bubbles:true })));
          if (composerTextbox?.focus) composerTextbox.focus();
          composerTextbox?.dispatchEvent(new Event('focus', { bubbles:true }));
          document.body.dispatchEvent(new Event('click', { bubbles:true }));
          attachmentCompleted = true; return true;
        } catch (_) {}
      }

      // Method 2: Drag-and-drop
      const dropOn = async (target, f) => {
        const dt = new DataTransfer(); dt.items.add(f);
        const de = new DragEvent('dragenter', { bubbles:true, cancelable:true, dataTransfer:dt });
        const dover = new DragEvent('dragover', { bubbles:true, cancelable:true, dataTransfer:dt });
        const dd = new DragEvent('drop', { bubbles:true, cancelable:true, dataTransfer:dt });
        target.dispatchEvent(de); await new Promise(r=>setTimeout(r,15));
        target.dispatchEvent(dover); await new Promise(r=>setTimeout(r,15));
        target.dispatchEvent(dd);
      };
      const zones = [
        '[data-testid="attachments"]', '[data-testid="toolBar"]', '[data-testid="primaryColumn"]',
        '[data-testid="tweetTextarea_0"]', '[role="group"]', '[role="main"]', 'div[contenteditable="true"]'
      ];
      for (const sel of zones) {
        const z = document.querySelector(sel); if (!z) continue;
        try { await dropOn(z, file); attachmentCompleted = true; return true; } catch {}
      }
      try { await dropOn(document.body, file); attachmentCompleted = true; return true; } catch {}

      // Method 3: Paste simulation
      const targets = [document.querySelector('[data-testid="tweetTextarea_0"]'), document.querySelector('[role="textbox"]'), document.activeElement, document.body].filter(Boolean);
      for (const t of targets) {
        try {
          t.focus?.();
          const dt = new DataTransfer(); dt.items.add(file);
          const pe = new ClipboardEvent('paste', { bubbles:true, cancelable:true, clipboardData: dt });
          t.dispatchEvent(pe); attachmentCompleted = true; return true;
        } catch {}
      }

      // Fallback UI
      showFallbackOverlay(); attachmentCompleted = true; return true;
    } catch (e) {
      console.error('attachViaFile error:', e);
      showFallbackOverlay(); return false;
    } finally {
      if (!attachmentCompleted) attachmentInProgress = false;
    }
  }

  // ============================================================================
  // AUTO-RETRY SYSTEM
  // ============================================================================

  /**
   * Setup auto-retry mechanism for UI changes
   */
  function setupAutoRetry(maxMs = 15000) {
    if (fallbackService && fallbackService.setupAutoRetry) {
      return fallbackService.setupAutoRetry(maxMs, () => {
        if (!attachmentInProgress && pendingDataUrl) {
          console.log('UI changed; retrying attachment');
          attachViaDataUrl(pendingDataUrl);
        }
      });
    }
    // Minimal fallback
    setTimeout(() => {
      if (!attachmentCompleted && !attachmentInProgress && pendingDataUrl) {
        attachViaDataUrl(pendingDataUrl);
      }
    }, maxMs / 2);
  }

  // ============================================================================
  // FALLBACK UI SYSTEM
  // ============================================================================
  
  /**
   * User-Friendly Fallback Interface
   */
  function showFallbackOverlay(dataUrl) {
    if (fallbackService && fallbackService.showFallbackOverlay) {
      fallbackService.showFallbackOverlay(dataUrl);
      setupAutoRetry(15000);
    } else {
      console.log('Fallback overlay service not available, showing basic notification');
      alert('画像の自動添付に失敗しました。手動で画像を添付してください。');
    }
  }

  // ============================================================================
  // CHROME EXTENSION MESSAGE HANDLING
  // ============================================================================

  /**
   * Validate Chrome extension context
   */
  function isValidExtensionContext() {
    try {
      return typeof chrome !== 'undefined' && 
             chrome.runtime && 
             chrome.runtime.id && 
             typeof chrome.runtime.sendMessage === 'function';
    } catch (e) {
      console.warn('Chrome extension context validation failed:', e);
      return false;
    }
  }

  /**
   * Safe Chrome extension message sending
   */
  function safeSendMessage(message, callback) {
    if (!isValidExtensionContext()) {
      console.warn('Cannot send message: invalid extension context');
      if (callback) callback({ error: 'Invalid extension context' });
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Chrome runtime error:', chrome.runtime.lastError.message);
        }
        if (callback) callback(response);
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      if (callback) callback({ error: error.message });
    }
  }

  // Wait for Twitter interface elements then notify background
  waitForElements().then(() => {
    console.log('X/Twitter interface detected, ready for image attachment');
    
    // Notify background that tweet page is ready to receive image
    safeSendMessage({ action: 'xTweetPageReady' }, (response) => {
      if (response && !response.error) {
        console.log('Successfully notified background script');
      }
    });
    
    // Priority-1: Pull pending image via Port (binary transfer)
    try {
      if (!window.__krmBinaryPullStarted) {
        window.__krmBinaryPullStarted = true;
        const port = chrome.runtime.connect({ name: 'krm_image_pull' });
        port.onMessage.addListener(async (msg) => {
          try {
            if (!msg || msg.type !== 'image' || !msg.buffer) return;
            const mime = msg.mime || 'image/jpeg';
            const u8 = new Uint8Array(msg.buffer);
            const file = new File([u8], 'kindle-review-image' + (mime.includes('png') ? '.png' : '.jpg'), { type: mime });
            console.log('Received binary image via Port; attempting attachment');
            await attachViaFile(file);
          } catch (e) {
            console.error('Binary attachment failed:', e);
          }
        });
        // Trigger initial pull request
        port.postMessage({ type: 'pull' });
      }
    } catch (e) {
      console.warn('Binary pull setup failed:', e);
    }
  });

  // Setup message listener for background script communication
  if (isValidExtensionContext()) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Content script received message:', request.action, 'at', new Date().toISOString());
      
      try {
        if (request.action === 'krmPing') {
          console.log('Content script responding to ping');
          const response = { 
            pong: true, 
            url: window.location.href,
            timestamp: Date.now(),
            readyState: document.readyState
          };
          sendResponse(response);
          return false; // Synchronous response, don't keep channel open
        }
        
        if (request.action === 'attachImageDataUrl' && request.dataUrl) {
          console.log('Content script received image attach request, dataUrl length:', request.dataUrl?.length);
          
          // Validate data URL
          if (!request.dataUrl.startsWith('data:image/')) {
            console.error('Invalid data URL format');
            sendResponse({ ok: false, error: 'Invalid data URL format' });
            return false; // Synchronous response for validation errors
          }
          
          pendingDataUrl = request.dataUrl;
          
          // Setup auto-retry
          setupAutoRetry(15000); // Increase retry time
          
          // Handle async attachment with proper error handling
          (async () => {
            try {
              console.log('Content script starting async image attachment...');
              const attachResult = await attachViaDataUrl(request.dataUrl);
              console.log('Content script attach result:', attachResult);
              
              // Ensure we can still send response with enhanced validation
              if (isValidExtensionContext()) {
                sendResponse({ 
                  ok: attachResult, 
                  timestamp: Date.now(),
                  method: attachResult ? 'success' : 'fallback'
                });
              } else {
                console.warn('Extension context invalidated, cannot send response');
              }
            } catch (e) {
              console.error('Content script attach error:', e);
              
              // Ensure we can still send response with enhanced validation
              if (isValidExtensionContext()) {
                sendResponse({ 
                  ok: false, 
                  error: e?.message || 'Unknown attachment error',
                  timestamp: Date.now()
                });
              } else {
                console.warn('Extension context invalidated during error, cannot send response');
              }
            }
          })();
          
          return true; // Indicate async response
        }
        
        // Unknown action
        console.warn('Content script received unknown action:', request.action);
        sendResponse({ ok: false, error: 'Unknown action' });
        return false; // Synchronous response for unknown actions
        
      } catch (handlerError) {
        console.error('Content script message handler error:', handlerError);
        try {
          sendResponse({ 
            ok: false, 
            error: `Handler error: ${handlerError.message}`,
            timestamp: Date.now()
          });
        } catch (responseError) {
          console.error('Failed to send error response:', responseError);
        }
        return false; // Don't keep channel open on handler errors
      }
    });
    
    console.log('KindleReviewMeter: Message listener successfully setup');
  } else {
    console.warn('KindleReviewMeter: Cannot setup message listener - invalid extension context');
  }

  console.log('KindleReviewMeter: Integrated stable content script fully initialized');

})();
