/**
 * Content Script for X (Twitter) Tweet Intent Auto Image Attachment
 * Automatically attaches image from clipboard when X tweet compose page loads
 */

(function() {
  'use strict';
  
  // Prevent multiple attachment attempts
  let attachmentInProgress = false;
  let attachmentCompleted = false;

  console.log('KindleReviewMeter: X tweet auto-attach script loaded');

  // Detect if this compose/intent is initiated by our extension text (used only to gate clipboard fallback)
  const urlParams = new URLSearchParams(window.location.search);
  const tweetText = urlParams.get('text');
  const isKRM = !!(tweetText && tweetText.includes('#KindleReviewMeter'));
  if (isKRM) {
    console.log('KindleReviewMeter tweet detected (clipboard fallback enabled)');
  } else {
    console.log('Non-KRM tweet or missing text param (clipboard fallback disabled)');
  }

  // Wait for page to be fully loaded
  function waitForElements() {
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
        
        if (fileInput && composerTextbox) {
          resolve({ fileInput, composerTextbox });
        } else {
          setTimeout(checkForElements, 500);
        }
      };
      checkForElements();
    });
  }

  // Function to paste image from clipboard
  async function pasteImageFromClipboard(fileInput) {
    try {
      // Check if clipboard contains image
      const clipboardItems = await navigator.clipboard.read();
      
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            console.log('Found image in clipboard:', type);
            
            const blob = await clipboardItem.getType(type);
            
            // Create a File object from the blob
            const file = new File([blob], 'kindle-review-image.png', { type: 'image/png' });
            
            // Create a DataTransfer object and add the file
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            
            // Set the files on the input element
            fileInput.files = dataTransfer.files;
            
            // Trigger change event to notify X/Twitter of the file upload
            const changeEvent = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(changeEvent);
            
            console.log('Image successfully attached to tweet');
            return true;
          }
        }
      }
      
      console.log('No image found in clipboard');
      return false;
    } catch (error) {
      console.error('Failed to paste image from clipboard:', error);
      return false;
    }
  }

  // Alternative method: simulate drag and drop
  async function simulateDragDrop(composerTextbox) {
    try {
      const clipboardItems = await navigator.clipboard.read();
      
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            const file = new File([blob], 'kindle-review-image.png', { type: 'image/png' });
            
            // Create drag and drop events
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            
            const dragEnterEvent = new DragEvent('dragenter', {
              bubbles: true,
              dataTransfer: dataTransfer
            });
            
            const dragOverEvent = new DragEvent('dragover', {
              bubbles: true,
              dataTransfer: dataTransfer
            });
            
            const dropEvent = new DragEvent('drop', {
              bubbles: true,
              dataTransfer: dataTransfer
            });
            
            // Dispatch the events
            composerTextbox.dispatchEvent(dragEnterEvent);
            composerTextbox.dispatchEvent(dragOverEvent);
            composerTextbox.dispatchEvent(dropEvent);
            
            console.log('Image drag-drop simulation completed');
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Failed to simulate drag and drop:', error);
      return false;
    }
  }

  // Alternative method: simulate paste event
  async function simulatePaste(composerTextbox) {
    try {
      const clipboardItems = await navigator.clipboard.read();
      
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            
            const clipboardData = {
              items: [{
                type: type,
                getAsFile: () => new File([blob], 'kindle-review-image.png', { type: 'image/png' })
              }]
            };
            
            const pasteEvent = new ClipboardEvent('paste', {
              bubbles: true,
              clipboardData: clipboardData
            });
            
            composerTextbox.dispatchEvent(pasteEvent);
            
            console.log('Paste event simulation completed');
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Failed to simulate paste:', error);
      return false;
    }
  }

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

  // Function to find and click the attachment button to reveal file input
  async function findAndClickAttachmentButton() {
    const attachButtonSelectors = [
      '[data-testid="attachments"]',
      '[aria-label*="Media"]',
      '[aria-label*="画像"]',
      '[aria-label*="写真"]',
      'button[aria-label*="Add photos"]',
      'button[aria-label*="Add media"]',
      '[data-testid="toolBarAttachments"]'
    ];
    
    for (const selector of attachButtonSelectors) {
      const button = document.querySelector(selector);
      if (button) {
        console.log('Found attachment button with selector:', selector);
        button.click();
        await new Promise(resolve => setTimeout(resolve, 200)); // Wait for file input to appear
        return true;
      }
    }
    
    console.warn('No attachment button found');
    return false;
  }

  async function attachViaDataUrl(dataUrl) {
    try {
      console.log('attachViaDataUrl called with dataUrl length:', dataUrl?.length);
      
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
      
      // Try to click attachment button first to reveal file input
      await findAndClickAttachmentButton();
      
      const { fileInput, composerTextbox } = await waitForElements();
      console.log('Found elements:', { hasFileInput: !!fileInput, hasComposerTextbox: !!composerTextbox });
      
      const file = dataUrlToFile(dataUrl);
      console.log('Converted dataUrl to file:', { name: file.name, size: file.size, type: file.type });

      // Method 1: Direct file input assignment
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
        '.css-175oi2r[role="group"]', // Twitter's compose area
        '[role="main"]'
      ];
      
      for (const selector of dropZoneSelectors) {
        const dropZone = document.querySelector(selector);
        if (dropZone) {
          try {
            console.log(`Attempting method 2: drag and drop on ${selector}`);
            const dt = new DataTransfer();
            dt.items.add(file);
            
            const dragEnterEvent = new DragEvent('dragenter', { 
              bubbles: true, 
              cancelable: true, 
              dataTransfer: dt 
            });
            const dragOverEvent = new DragEvent('dragover', { 
              bubbles: true, 
              cancelable: true, 
              dataTransfer: dt 
            });
            const dropEvent = new DragEvent('drop', { 
              bubbles: true, 
              cancelable: true, 
              dataTransfer: dt 
            });
            
            dropZone.dispatchEvent(dragEnterEvent);
            await new Promise(resolve => setTimeout(resolve, 100));
            dropZone.dispatchEvent(dragOverEvent);
            await new Promise(resolve => setTimeout(resolve, 100));
            dropZone.dispatchEvent(dropEvent);
            
            console.log(`Image attached via drag-drop on ${selector}`);
            attachmentCompleted = true;
            return true;
          } catch (e) {
            console.warn(`Drag-drop on ${selector} failed:`, e);
          }
        }
      }

      // Method 3: Enhanced paste simulation with proper target
      const pasteTargets = [
        composerTextbox,
        document.querySelector('[data-testid="tweetTextarea_0"]'),
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

  // Main execution (legacy clipboard-based auto-attach)
  async function main() {
    try {
      console.log('Waiting for X/Twitter interface elements...');
      const { fileInput, composerTextbox } = await waitForElements();
      // Notify background that tweet page is ready to receive image
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'xTweetPageReady' }, ()=>{});
      }
      
      console.log('Elements found, attempting image attachment...');
      
      // Give X/Twitter a moment to fully initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Clipboard-based fallback is only attempted for our tweets
      let success = false;
      if (isKRM) {
        // Method 1: Direct file input
        if (fileInput && !success) {
          console.log('Trying method 1: direct file input');
          success = await pasteImageFromClipboard(fileInput);
        }
        // Method 2: Drag and drop simulation
        if (composerTextbox && !success) {
          console.log('Trying method 2: drag and drop simulation');
          success = await simulateDragDrop(composerTextbox);
        }
        // Method 3: Paste event simulation
        if (composerTextbox && !success) {
          console.log('Trying method 3: paste event simulation');
          success = await simulatePaste(composerTextbox);
        }
      }
      
      if (success) {
        console.log('✅ Image attachment via clipboard path successful!');
      } else {
        console.log('❌ Clipboard-based methods failed (will wait for direct handoff)');
        // Do not show clipboard guidance; direct handoff will attempt next.
      }
      
    } catch (error) {
      console.error('Error in main execution (clipboard path):', error);
      // Do not notify; direct handoff may still arrive.
    }
  }

  // Removed clipboard guidance UI.

  // Listen for direct image handoff from background
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Content script received message:', request.action);
      
      if (request.action === 'krmPing') {
        console.log('Content script responding to ping');
        sendResponse({ pong: true });
        return true;
      }
      
      if (request.action === 'attachImageDataUrl' && request.dataUrl) {
        console.log('Content script received image attach request, dataUrl length:', request.dataUrl?.length);
        attachViaDataUrl(request.dataUrl).then((ok) => {
          console.log('Content script attach result:', ok);
          sendResponse({ ok });
        }).catch((e) => {
          console.error('Content script attach error:', e);
          sendResponse({ ok: false, error: e?.message });
        });
        return true;
      }
    });
  }

  // Run the main function (clipboard path remains as a fallback)
  main();

})();
