/**
 * Twitter UI Fallback Service
 * 
 * Extracted from x-tweet-auto-attach.js for better separation of concerns
 * 
 * Responsibilities:
 * - Provide manual attachment options when automatic methods fail
 * - Display user-friendly fallback interface with clear instructions
 * - Handle auto-retry functionality for UI state changes
 * - Offer image download and new tab opening functionality
 * - Maintain consistent branding and user experience
 * 
 * Features:
 * - Beautiful gradient design matching extension theme
 * - Auto-dismissal with manual close option
 * - Duplicate overlay prevention
 * - Accessibility considerations
 * - MutationObserver-based retry mechanism
 */

(function() {
  'use strict';
  
  class TwitterUIFallbackService {
    constructor() {
      this.retryObserver = null;
      this.overlayId = 'krm-fallback-overlay';
    }

    /**
     * Setup automatic retry when UI changes are detected
     * @param {number} maxMs - Maximum retry duration in milliseconds
     */
    setupAutoRetry(maxMs = 8000) {
      const start = Date.now();
      
      // Get attachment service for retry
      const attachmentService = window.ImageAttachmentService ? new window.ImageAttachmentService() : null;
      if (!attachmentService) {
        console.warn('TwitterUIFallbackService: ImageAttachmentService not available for retry');
        return;
      }

      if (this.retryObserver) {
        this.retryObserver.disconnect();
      }

      this.retryObserver = new MutationObserver(async () => {
        const state = attachmentService.getState();
        
        if (state.completed) { 
          this.retryObserver.disconnect(); 
          return; 
        }
        
        const elapsed = Date.now() - start;
        if (elapsed > maxMs) { 
          this.retryObserver.disconnect(); 
          return; 
        }
        
        if (!state.inProgress && state.hasPendingData) {
          console.log('TwitterUIFallbackService: UI changed; retrying attachment');
          // Note: In the refactored structure, retry would be handled by the controller
          // This is just for backward compatibility
          window.dispatchEvent(new CustomEvent('krm-retry-attachment'));
        }
      });
      
      this.retryObserver.observe(document.documentElement, { 
        childList: true, 
        subtree: true 
      });
      
      setTimeout(() => {
        if (this.retryObserver) {
          this.retryObserver.disconnect();
        }
      }, maxMs + 200);
    }

    /**
     * Show user-friendly fallback overlay when automatic attachment fails
     * @param {string} dataUrl - Base64 image data URL for manual download
     */
    showFallbackOverlay(dataUrl) {
      // Remove any existing overlay first
      const existingOverlay = document.querySelector(`#${this.overlayId}`);
      if (existingOverlay) existingOverlay.remove();
      
      const wrap = document.createElement('div');
      wrap.id = this.overlayId;
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
      
      // Setup event handlers
      this._setupOverlayEventHandlers(wrap, dataUrl);
      
      // Auto-close after 20 seconds
      setTimeout(() => {
        if (wrap.parentNode) wrap.remove();
      }, 20000);
    }

    /**
     * Setup event handlers for fallback overlay
     * @private
     */
    _setupOverlayEventHandlers(overlay, dataUrl) {
      const openButton = overlay.querySelector('#krm-open');
      const downloadLink = overlay.querySelector('#krm-download');
      const closeButton = overlay.querySelector('#krm-close');

      if (openButton) {
        openButton.onclick = () => {
          window.open(dataUrl, '_blank');
          overlay.remove();
        };
      }

      if (downloadLink) {
        downloadLink.setAttribute('href', dataUrl);
      }

      if (closeButton) {
        closeButton.onclick = () => overlay.remove();
      }

      // Keyboard accessibility
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          overlay.remove();
        }
      });

      // Make overlay focusable for accessibility
      overlay.setAttribute('tabindex', '-1');
      overlay.focus();
    }

    /**
     * Remove fallback overlay if currently displayed
     */
    removeFallbackOverlay() {
      const existingOverlay = document.querySelector(`#${this.overlayId}`);
      if (existingOverlay) {
        existingOverlay.remove();
        return true;
      }
      return false;
    }

    /**
     * Check if fallback overlay is currently displayed
     * @returns {boolean} True if overlay is visible
     */
    isFallbackOverlayVisible() {
      return !!document.querySelector(`#${this.overlayId}`);
    }

    /**
     * Stop auto-retry mechanism
     */
    stopAutoRetry() {
      if (this.retryObserver) {
        this.retryObserver.disconnect();
        this.retryObserver = null;
      }
    }

    /**
     * Clean up all resources
     */
    cleanup() {
      this.stopAutoRetry();
      this.removeFallbackOverlay();
    }
  }
  
  // Make available globally within IIFE context
  window.TwitterUIFallbackService = TwitterUIFallbackService;
  
})();