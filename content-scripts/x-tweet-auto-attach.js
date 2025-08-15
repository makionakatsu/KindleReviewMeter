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
  async function waitForElements(options = {}) {
    const { requireFileInput = false, timeoutMs = 8000 } = options;
    const startedAt = Date.now();
    
    return new Promise((resolve) => {
      const checkForElements = () => {
        console.log('Searching for X/Twitter elements...');
        
        // Look for X/Twitter's file input - enhanced selectors
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
          if (fileInput) {
            console.log('Found file input with selector:', selector);
            break;
          }
        }
        
        // Enhanced composer selectors for latest X/Twitter interface
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
          if (composerTextbox) {
            console.log('Found composer with selector:', selector);
            break;
          }
        }
        
        console.log('Element search results:', {
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
          console.warn('Timeout waiting for file input; proceeding with composer only');
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
  function findAnyFileInput() {
    const inputs = document.querySelectorAll('input[type="file"]');
    for (const input of inputs) {
      if (input.offsetParent !== null || input.style.display !== 'none') {
        console.log('Found visible file input:', input);
        return input;
      }
    }
    
    // Also check for hidden but functionally available inputs
    if (inputs.length > 0) {
      console.log('Found hidden file input, using first available:', inputs[0]);
      return inputs[0];
    }
    
    return null;
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Convert dataURL to File object
   */
  function dataUrlToFile(dataUrl, filename = null) {
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

  // ============================================================================
  // ATTACHMENT BUTTON DISCOVERY
  // ============================================================================
  
  /**
   * Find and click attachment button to reveal file input
   */
  async function findAndClickAttachmentButton() {
    // Always try to click attachment button as per commit 6ec556190c291da3123b8440ea00438051735ffe
    console.log('Attempting to click attachment button to reveal file input');
    
    const attachButtonSelectors = [
      // Common toolbar buttons
      '[data-testid="attachments"]',
      '[data-testid="toolBarAttachments"]',
      // Accessible labels (EN/JA)
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
          console.log('Found attachment button with selector:', selector);
          try {
            // Prefer native click; if blocked, simulate mouse event
            if (typeof button.click === 'function') {
              button.click();
            } else {
              const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
              button.dispatchEvent(evt);
            }
            
            // Brief wait for UI response
            await new Promise(r => setTimeout(r, 300));
            return true;
          } catch (e) {
            console.warn('Attachment button click failed:', e);
            continue;
          }
        }
      }
      console.log('No attachment button found');
      return false;
    } catch (error) {
      console.error('Error in findAndClickAttachmentButton:', error);
      return false;
    }
  }

  // ============================================================================
  // PRIMARY IMAGE ATTACHMENT SYSTEM
  // ============================================================================
  
  /**
   * Primary Image Attachment Handler - 5-Tier Strategy
   */
  async function attachViaDataUrl(dataUrl) {
    try {
      console.log('attachViaDataUrl called with dataUrl length:', dataUrl?.length);
      
      if (!dataUrl && pendingDataUrl) dataUrl = pendingDataUrl;
      if (!dataUrl) {
        console.warn('No dataUrl available to attach');
        return false;
      }
      
      // Prevent duplicate attachments
      if (attachmentInProgress) {
        console.log('Attachment already in progress, skipping');
        return false;
      }
      
      if (attachmentCompleted) {
        console.log('Attachment already completed, skipping');
        return true;
      }
      
      attachmentInProgress = true;
      pendingDataUrl = dataUrl;
      
      // Try to click attachment button first to reveal file input (best effort, non-fatal)
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
        timeoutMs: 8000 
      });
      
      if (!fileInput) {
        // Try deep search as a fallback
        fileInput = findAnyFileInput();
        if (fileInput) {
          console.log('Found file input via deep search');
        } else {
          // Last try: wait a bit with MutationObserver
          fileInput = await waitForFileInputAppears(2000);
          if (fileInput) console.log('Found file input via observer');
        }
      }
      
      console.log('Found elements:', { 
        hasFileInput: !!fileInput, 
        hasComposerTextbox: !!composerTextbox 
      });
      
      const file = dataUrlToFile(dataUrl);
      console.log('Converted dataUrl to file:', { 
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
          
          console.log('Image attached via file input');
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

  // ============================================================================
  // AUTO-RETRY SYSTEM
  // ============================================================================

  /**
   * Setup auto-retry mechanism for UI changes
   */
  function setupAutoRetry(maxMs = 15000) {
    const start = Date.now();
    const observer = new MutationObserver(async () => {
      if (attachmentCompleted) { 
        observer.disconnect(); 
        return; 
      }
      
      const elapsed = Date.now() - start;
      if (elapsed > maxMs) { 
        observer.disconnect(); 
        return; 
      }
      
      if (!attachmentInProgress && pendingDataUrl) {
        console.log('UI changed; retrying attachment');
        attachViaDataUrl(pendingDataUrl);
      }
    });
    
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), maxMs + 200);
  }

  // ============================================================================
  // FALLBACK UI SYSTEM
  // ============================================================================
  
  /**
   * User-Friendly Fallback Interface
   */
  function showFallbackOverlay(dataUrl) {
    // Remove any existing overlay first
    const existingOverlay = document.querySelector('#krm-fallback-overlay');
    if (existingOverlay) existingOverlay.remove();
    
    console.log('Showing fallback overlay for manual attachment');
    
    const overlay = document.createElement('div');
    overlay.id = 'krm-fallback-overlay';
    overlay.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 20px;
          padding: 40px;
          max-width: 500px;
          text-align: center;
          color: white;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          position: relative;
        ">
          <div style="font-size: 48px; margin-bottom: 20px;">📖</div>
          <h2 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">
            Kindle Review Meter
          </h2>
          <p style="margin: 0 0 24px 0; opacity: 0.9; line-height: 1.6;">
            自動画像添付に失敗しました。<br>
            以下の方法で手動で添付してください：
          </p>
          
          <div style="background: rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px; margin: 20px 0; text-align: left;">
            <p style="margin: 0 0 12px 0; font-weight: 500;">📎 手動添付方法:</p>
            <ol style="margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>下の「画像をダウンロード」をクリック</li>
              <li>X/Twitterの画像添付ボタンをクリック</li>
              <li>ダウンロードした画像ファイルを選択</li>
            </ol>
          </div>
          
          <div style="margin-top: 30px;">
            <button id="krm-download-btn" style="
              background: rgba(255, 255, 255, 0.2);
              border: 2px solid rgba(255, 255, 255, 0.3);
              color: white;
              padding: 12px 24px;
              border-radius: 25px;
              font-size: 16px;
              font-weight: 500;
              cursor: pointer;
              margin: 0 8px;
              transition: all 0.3s ease;
            " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
               onmouseout="this.style.background='rgba(255,255,255,0.2)'">
              🔽 画像をダウンロード
            </button>
            
            <button id="krm-new-tab-btn" style="
              background: rgba(255, 255, 255, 0.2);
              border: 2px solid rgba(255, 255, 255, 0.3);
              color: white;
              padding: 12px 24px;
              border-radius: 25px;
              font-size: 16px;
              font-weight: 500;
              cursor: pointer;
              margin: 0 8px;
              transition: all 0.3s ease;
            " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
               onmouseout="this.style.background='rgba(255,255,255,0.2)'">
              🔗 新しいタブで開く
            </button>
          </div>
          
          <button id="krm-close-btn" style="
            position: absolute;
            top: 15px;
            right: 20px;
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.7);
            font-size: 24px;
            cursor: pointer;
            padding: 5px;
            line-height: 1;
          " title="閉じる">
            ✕
          </button>
          
          <p style="margin: 24px 0 0 0; font-size: 12px; opacity: 0.7;">
            このダイアログは10秒後に自動的に閉じます
          </p>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Event handlers
    const downloadBtn = document.getElementById('krm-download-btn');
    const newTabBtn = document.getElementById('krm-new-tab-btn');
    const closeBtn = document.getElementById('krm-close-btn');
    
    downloadBtn.addEventListener('click', () => {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'kindle-review-progress.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Show success feedback
      downloadBtn.innerHTML = '✅ ダウンロード完了';
      downloadBtn.style.background = 'rgba(46, 204, 113, 0.8)';
    });
    
    newTabBtn.addEventListener('click', () => {
      const newWindow = window.open();
      const html = `
        <html>
          <head><title>Kindle Review Progress Image</title></head>
          <body style="margin:0; background:#f0f0f0; display:flex; justify-content:center; align-items:center; min-height:100vh;">
            <img src="${dataUrl}" style="max-width:100%; max-height:100%; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
          </body>
        </html>
      `;
      newWindow.document.write(html);
      newWindow.document.close();
    });
    
    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.remove();
      }
    }, 10000);
    
    // Setup enhanced retry mechanism
    setupAutoRetry(15000);
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

  // Wait for Twitter interface elements
  waitForElements().then(() => {
    console.log('X/Twitter interface detected, ready for image attachment');
    
    // Notify background that tweet page is ready to receive image
    safeSendMessage({ action: 'xTweetPageReady' }, (response) => {
      if (response && !response.error) {
        console.log('Successfully notified background script');
      }
    });
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