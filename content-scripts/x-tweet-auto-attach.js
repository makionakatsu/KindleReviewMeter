/**
 * Content Script for X (Twitter) Tweet Intent Auto Image Attachment
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
 * 1. Direct file input assignment after clicking attachment button
 * 2. Enhanced drag-and-drop simulation on multiple drop zones
 * 3. Paste event simulation with proper targeting and focus
 * 4. Hidden file input creation and propagation
 * 5. User-friendly fallback overlay with manual instructions
 * 
 * Communication Flow:
 * Background Script → Content Script → X/Twitter Interface → User
 */

(function() {
  'use strict';
  
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  // Prevent multiple attachment attempts
  let attachmentInProgress = false;
  let attachmentCompleted = false;
  let pendingDataUrl = null;

  console.log('KindleReviewMeter: X tweet auto-attach script loaded');

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

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
  function waitForElements(options = {}) {
    const { requireFileInput = false, timeoutMs = 8000 } = options;
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const checkForElements = () => {
        console.log('Searching for X/Twitter elements...');
        
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
            console.log('Found file input with selector:', selector);
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

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  // Convert dataURL to File
  function dataUrlToFile(dataUrl, filename = 'kindle-review-image.png') {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  }

  // ============================================================================
  // MODERN DATA URL-BASED ATTACHMENT SYSTEM
  // ============================================================================
  
  /**
   * Attachment Button Discovery and Activation
   * 
   * Locates and clicks X/Twitter's media attachment button to reveal
   * the file input element for direct file assignment.
   */
  async function findAndClickAttachmentButton() {
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
          console.log('Found attachment button with selector:', selector);
          try {
            // Prefer native click; if blocked, simulate mouse event
            if (typeof button.click === 'function') {
              button.click();
            } else {
              const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
              button.dispatchEvent(evt);
            }
          } catch (e) {
            console.warn('Attachment button click failed:', e);
          }
          await new Promise(resolve => setTimeout(resolve, 250)); // Wait for file input to appear
          return true;
        }
      }
      console.log('No attachment button found (non-fatal)');
      return false;
    } catch (err) {
      console.warn('findAndClickAttachmentButton error (non-fatal):', err);
      return false;
    }
  }

  /**
   * Deep search for any file input in the document (even if hidden)
   */
  function findAnyFileInput() {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    if (inputs.length === 0) return null;
    // Prefer inputs that accept images or are inside compose
    const scored = inputs.map((el) => {
      let score = 0;
      const accept = (el.getAttribute('accept') || '').toLowerCase();
      if (accept.includes('image')) score += 2;
      // Heuristic: closer to tweet composer
      let p = el.parentElement; let depth = 0;
      while (p && depth < 5) {
        const ds = p.getAttribute('data-testid') || '';
        if (ds.includes('attachments') || ds.includes('toolBar')) score += 1;
        p = p.parentElement; depth++;
      }
      return { el, score };
    }).sort((a,b)=>b.score-a.score);
    return (scored[0] && scored[0].el) || inputs[0];
  }

  /**
   * Primary Image Attachment Handler
   * 
   * Responsibilities:
   * - Coordinate the 5-tier attachment strategy
   * - Manage attachment state to prevent duplicates
   * - Convert data URL to File objects for DOM manipulation
   * - Provide comprehensive error handling and fallback
   * 
   * Strategy Implementation:
   * 1. Button activation → Direct file input
   * 2. Multi-zone drag-and-drop simulation
   * 3. Enhanced paste event targeting
   * 4. Hidden file input propagation
   * 5. User-friendly fallback overlay
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
      
      // Do not block on missing file input; proceed with drag&drop/paste if needed
      let { fileInput, composerTextbox } = await waitForElements({ requireFileInput: false, timeoutMs: 8000 });
      if (!fileInput) {
        // Try deep search as a fallback
        fileInput = findAnyFileInput();
        if (fileInput) {
          console.log('Found file input via deep search');
        } else {
          // Last try: wait a bit with MutationObserver for dynamically added inputs
          fileInput = await waitForFileInputAppears(2000);
          if (fileInput) console.log('Found file input via observer');
        }
      }
      console.log('Found elements:', { hasFileInput: !!fileInput, hasComposerTextbox: !!composerTextbox });
      
      const file = dataUrlToFile(dataUrl);
      console.log('Converted dataUrl to file:', { name: file.name, size: file.size, type: file.type });

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

      // Method 2: Target specific drop zones
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

      // Method 3: Enhanced paste simulation with proper target
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

      // Method 4: Force trigger file dialog and inject file
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

      // Fallback: show overlay with open/download options
      showFallbackOverlay(dataUrl);
      return false;
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

  // Observe for UI readiness and retry attachment briefly
  function setupAutoRetry(maxMs = 8000) {
    const start = Date.now();
    const observer = new MutationObserver(async () => {
      if (attachmentCompleted) { observer.disconnect(); return; }
      const elapsed = Date.now() - start;
      if (elapsed > maxMs) { observer.disconnect(); return; }
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
   * 
   * Responsibilities:
   * - Provide manual attachment options when automatic methods fail
   * - Display clear instructions for drag-and-drop attachment
   * - Offer image download and new tab opening functionality
   * - Maintain consistent branding and user experience
   * 
   * Features:
   * - Beautiful gradient design matching extension theme
   * - Auto-dismissal with manual close option
   * - Duplicate overlay prevention
   * - Accessibility considerations
   */
  function showFallbackOverlay(dataUrl) {
    // Remove any existing overlay first
    const existingOverlay = document.querySelector('#krm-fallback-overlay');
    if (existingOverlay) existingOverlay.remove();
    
    const wrap = document.createElement('div');
    wrap.id = 'krm-fallback-overlay';
    wrap.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10000;
      background: linear-gradient(135deg, #1d4ed8, #06b6d4); color: #fff; 
      padding: 16px; border-radius: 12px; max-width: 300px;
      box-shadow: 0 10px 25px rgba(0,0,0,.3); 
      font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
      border: 1px solid rgba(255,255,255,0.2);
    `;
    wrap.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <div style="font-size: 24px; margin-right: 8px;">📚</div>
        <div>
          <div style="font-weight: bold; margin-bottom: 2px;">Kindle Review Meter</div>
          <div style="font-size: 12px; opacity: 0.9;">画像の自動添付に失敗</div>
        </div>
      </div>
      <div style="font-size: 13px; margin-bottom: 12px; opacity: 0.9;">
        手動で画像を添付してください：
      </div>
      <div style="display:flex; gap:8px; flex-wrap: wrap;">
        <button id="krm-open" style="background:rgba(255,255,255,0.2);color:#fff;border:none;border-radius:6px;padding:8px 12px;cursor:pointer;font-size:12px;backdrop-filter:blur(10px);">新しいタブで開く</button>
        <a id="krm-download" style="background:rgba(255,255,255,0.15);color:#fff;text-decoration:none;border-radius:6px;padding:8px 12px;font-size:12px;display:inline-block;" download="kindle-review-image.png">ダウンロード</a>
      </div>
      <div style="margin-top: 10px; font-size: 11px; opacity: 0.7;">
        💡 画像をダウンロードして、X投稿画面にドラッグ&ドロップしてください
      </div>
      <button id="krm-close" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 16px;">×</button>
    `;
    
    document.body.appendChild(wrap);
    
    wrap.querySelector('#krm-open').onclick = () => {
      window.open(dataUrl, '_blank');
      wrap.remove();
    };
    wrap.querySelector('#krm-download').setAttribute('href', dataUrl);
    wrap.querySelector('#krm-close').onclick = () => wrap.remove();

    // Auto-close after 20 seconds
    setTimeout(() => {
      if (wrap.parentNode) wrap.remove();
    }, 20000);
  }

  // ============================================================================
  // MAIN EXECUTION AND MESSAGE HANDLING
  // ============================================================================
  
  /**
   * Initialization Function
   * 
   * Sets up the content script and notifies background that the page is ready
   * to receive image attachment requests.
   */
  async function init() {
    try {
      console.log('Waiting for X/Twitter interface elements...');
      await waitForElements();
      
      // Notify background that tweet page is ready to receive image
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'xTweetPageReady' }, ()=>{});
      }
      
      console.log('Content script initialized and ready for image attachment');
    } catch (error) {
      console.error('Error in content script initialization:', error);
    }
  }

  /**
   * Background Script Communication Handler
   * 
   * Responsibilities:
   * - Handle ping requests for content script availability checking
   * - Process direct image attachment requests from background script
   * - Provide response confirmation for attachment success/failure
   * - Maintain communication channel reliability
   */
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Content script received message:', request.action, 'at', new Date().toISOString());
      
      if (request.action === 'krmPing') {
        console.log('Content script responding to ping');
        sendResponse({ 
          pong: true, 
          url: window.location.href,
          timestamp: Date.now(),
          readyState: document.readyState
        });
        return true;
      }
      
      if (request.action === 'attachImageDataUrl' && request.dataUrl) {
        console.log('Content script received image attach request, dataUrl length:', request.dataUrl?.length);
        
        // Validate data URL
        if (!request.dataUrl.startsWith('data:image/')) {
          console.error('Invalid data URL format');
          sendResponse({ ok: false, error: 'Invalid data URL format' });
          return true;
        }
        
        pendingDataUrl = request.dataUrl;
        setupAutoRetry(15000); // Increase retry time
        
        attachViaDataUrl(request.dataUrl).then((ok) => {
          console.log('Content script attach result:', ok);
          sendResponse({ ok, timestamp: Date.now() });
        }).catch((e) => {
          console.error('Content script attach error:', e);
          sendResponse({ 
            ok: false, 
            error: e?.message || 'Unknown attachment error',
            timestamp: Date.now()
          });
        });
        return true;
      }
      
      // Unknown action
      console.warn('Content script received unknown action:', request.action);
      sendResponse({ ok: false, error: 'Unknown action' });
      return true;
    });
  }

  // Initialize the content script
  init();

})();
