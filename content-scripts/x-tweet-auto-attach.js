/**
 * Content Script for X (Twitter) Tweet Intent Auto Image Attachment
 * Automatically attaches image from clipboard when X tweet compose page loads
 */

(function() {
  'use strict';

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
        // Look for X/Twitter's file input or drag-drop area
        const fileInput = document.querySelector('input[type="file"][accept*="image"]');
        const composerTextbox = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                               document.querySelector('[contenteditable="true"]') ||
                               document.querySelector('textarea[placeholder*="happening"]');
        
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

  async function attachViaDataUrl(dataUrl) {
    try {
      const { fileInput, composerTextbox } = await waitForElements();
      const file = dataUrlToFile(dataUrl);

      // Method 1: Direct file input assignment
      if (fileInput) {
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          const changeEvent = new Event('change', { bubbles: true });
          fileInput.dispatchEvent(changeEvent);
          console.log('Image attached via file input');
          return true;
        } catch (e) {
          console.warn('File input attach failed:', e);
        }
      }

      // Method 2: Drag and drop simulation
      if (composerTextbox) {
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          const dragEnterEvent = new DragEvent('dragenter', { bubbles: true, dataTransfer: dt });
          const dragOverEvent  = new DragEvent('dragover',  { bubbles: true, dataTransfer: dt });
          const dropEvent      = new DragEvent('drop',      { bubbles: true, dataTransfer: dt });
          composerTextbox.dispatchEvent(dragEnterEvent);
          composerTextbox.dispatchEvent(dragOverEvent);
          composerTextbox.dispatchEvent(dropEvent);
          console.log('Image attached via drag-drop simulation');
          return true;
        } catch (e) {
          console.warn('Drag-drop attach failed:', e);
        }
      }

      // Method 3: Paste simulation
      if (composerTextbox) {
        try {
          const clipboardData = new DataTransfer();
          clipboardData.items.add(file);
          const pasteEvent = new ClipboardEvent('paste', { bubbles: true, clipboardData: clipboardData });
          composerTextbox.dispatchEvent(pasteEvent);
          console.log('Image attached via paste simulation');
          return true;
        } catch (e) {
          console.warn('Paste simulation failed:', e);
        }
      }

      // Fallback: show overlay with open/download options
      showFallbackOverlay(dataUrl);
      return false;
    } catch (error) {
      console.error('attachViaDataUrl error:', error);
      showFallbackOverlay(dataUrl);
      return false;
    }
  }

  function showFallbackOverlay(dataUrl) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position: fixed; inset: 20px 20px auto auto; z-index: 10000;
      background: #0f172a; color: #fff; padding: 12px 14px; border-radius: 10px;
      box-shadow: 0 6px 18px rgba(0,0,0,.25); font-family: system-ui, -apple-system, sans-serif;
    `;
    wrap.innerHTML = `
      📚 Kindle Review Meter<br>
      <small>画像の自動添付に失敗しました。以下のボタンをご利用ください。</small>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button id="krm-open" style="background:#1da1f2;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer">画像を開く</button>
        <a id="krm-download" style="background:#334155;color:#fff;text-decoration:none;border-radius:6px;padding:6px 10px;" download="kindle-review-image.png">ダウンロード</a>
      </div>
    `;
    document.body.appendChild(wrap);
    wrap.querySelector('#krm-open').onclick = () => window.open(dataUrl, '_blank');
    wrap.querySelector('#krm-download').setAttribute('href', dataUrl);

    setTimeout(() => { wrap.remove(); }, 12000);
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
      if (request.action === 'attachImageDataUrl' && request.dataUrl) {
        attachViaDataUrl(request.dataUrl).then((ok) => sendResponse({ ok })).catch((e)=>sendResponse({ ok:false, error: e?.message }));
        return true;
      }
    });
  }

  // Run the main function (clipboard path remains as a fallback)
  main();

})();
