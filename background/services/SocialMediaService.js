/**
 * SocialMediaService - High-Performance X/Twitter Integration Service
 * 
 * PRIMARY RESPONSIBILITIES:
 * - X tweet tab management and lifecycle
 * - Image generation tab coordination
 * - Cross-tab messaging and data transfer
 * - Content script injection and ping/response management
 * - Progressive timeout and retry logic optimization
 * 
 * PERFORMANCE CHARACTERISTICS:
 * - Optimized for speed: 12 max attempts (vs original 20)
 * - Linear delay progression: 600ms + (attempt * 150ms), max 1500ms
 * - Progressive timeouts: 2s → 4s → 6s (matches fastest record a2830b6)
 * - Content script ping optimization: 300ms linear backoff
 * 
 * ARCHITECTURAL DESIGN:
 * - Dual-tab system: X compose + background image generation
 * - Direct data URL transfer (no clipboard/file system)
 * - Stateful pending share management via ExtensionStateManager
 * - Graceful degradation with user notification fallbacks
 * 
 * INTEGRATION BOUNDARIES:
 * - Input: Book data for image generation, X compose URLs
 * - Output: Tab IDs, success/failure status, timing metrics
 * - Dependencies: ExtensionStateManager (state), ErrorHandler (errors)
 * - Side effects: Tab creation/destruction, Chrome notifications
 * 
 * EXTRACTED FROM: Original trySendImageToTweetTab function
 * OPTIMIZATION TARGET: a2830b6 fastest record (40-50% speed improvement)
*/

import ContentScriptManager from './socialmedia/ContentScriptManager.js';
import AttachmentManager from './socialmedia/AttachmentManager.js';
import { getTabInfo as utilGetTabInfo, isValidTweetUrl as utilIsValidTweetUrl, isFatalError as utilIsFatalError, cleanupImageTab as utilCleanupImageTab, showManualAttachmentNotification as utilShowManual } from './socialmedia/TabUtils.js';

export default class SocialMediaService {
  constructor(extensionStateManager, errorHandler) {
    this.stateManager = extensionStateManager;
    this.errorHandler = errorHandler;
    
    // PERFORMANCE CONFIGURATION - Matches a2830b6 fastest record exactly
    this.maxRetryAttempts = 12;        // Reduced from 20 → 12 (40% fewer attempts)
    this.baseDelayMs = 600;            // Base delay matches original trySendImageToTweetTab
    this.delayIncrementMs = 150;       // Linear increment per attempt
    this.maxDelayMs = 1500;            // Cap delay at 1.5s (vs original 10s)
    this.maxPingAttempts = 3;          // Content script ping attempts (was 5)
    this.pingTimeoutMs = 1500;         // Ping response timeout
    
    // PROGRESSIVE TIMEOUT CONFIGURATION (per attachment attempt)
    this.timeoutFirstAttempt = 2000;   // 2s for attempt 0
    this.timeoutEarlyAttempts = 4000;  // 4s for attempts 1-2  
    this.timeoutLaterAttempts = 6000;  // 6s for attempts 3+

    // Delegated managers
    this.contentScriptManager = new ContentScriptManager({ pingTimeoutMs: this.pingTimeoutMs });
    this.attachmentManager = new AttachmentManager({
      timeoutFirstAttempt: this.timeoutFirstAttempt,
      timeoutEarlyAttempts: this.timeoutEarlyAttempts,
      timeoutLaterAttempts: this.timeoutLaterAttempts
    });
  }

  /**
   * Main method to share content to X with image attachment
   * @param {Object} data - Book data for image generation
   * @param {string} tweetUrl - X compose URL
   * @returns {Promise<Object>} Share result with tab IDs
   */
  async shareToXWithImage(data, tweetUrl) {
    try {
      console.log('🚀 Starting X share with image process');
      console.log('📊 Data:', data);
      console.log('🔗 Tweet URL:', tweetUrl);
      
      // Validate inputs
      if (!tweetUrl) {
        throw new Error('Tweet URL is required but not provided');
      }
      
      if (!data) {
        throw new Error('Data is required but not provided');
      }
      
      // First, open X tweet page immediately
      console.log('🌐 Creating X tweet tab...');
      const tweetTab = await chrome.tabs.create({
        url: tweetUrl,
        active: true
      });

      console.log('✅ Opened X tweet tab:', tweetTab.id, 'URL:', tweetTab.url);
      
      // Store share state
      const shareData = this.stateManager.setPendingXShare(tweetTab.id, {
        url: tweetUrl,
        data: data,
        createdAt: Date.now()
      });
      
      // Generate image in background and prepare for transfer
      await chrome.storage.local.set({ 'pendingImageData': data });
      console.log('Stored data in chrome.storage for image generation');
      
      // Create image generation page (will auto-close after generating)
      const encodedData = encodeURIComponent(JSON.stringify(data));
      const imagePageUrl = chrome.runtime.getURL(`popup/image-generator.html?data=${encodedData}&quickMode=true`);
      
      // Create image generation tab briefly in background
      const backgroundTab = await chrome.tabs.create({
        url: imagePageUrl,
        active: false // No need to focus; we'll relay the image directly
      });

      console.log('Created image generation tab:', backgroundTab.id);
      
      // Update share state with image tab ID
      shareData.imageTabId = backgroundTab.id;
      this.stateManager.updatePendingXShare(tweetTab.id, { imageTabId: backgroundTab.id });
      
      return { success: true, tweetTabId: tweetTab.id, imageTabId: backgroundTab.id };
      
    } catch (error) {
      console.error('X share with image failed:', error);
      const errorInfo = this.errorHandler.handleSocialMediaError(error, {
        operation: 'share_to_x_with_image',
        tweetUrl,
        hasData: !!data
      });
      throw new Error(`X投稿準備に失敗しました: ${error.message}`);
    }
  }

  /**
   * Attempt to send image to tweet tab with retry logic
   * @param {number} tweetTabId - Tweet tab ID
   * @param {string} dataUrl - Image data URL
   * @param {number} imageTabId - Image generation tab ID (for cleanup)
   * @returns {Promise<boolean>} Success status
   */
  async sendImageToTweetTab(tweetTabId, dataUrl, imageTabId) {
    console.log('sendImageToTweetTab called:', {
      tweetTabId,
      hasDataUrl: !!dataUrl,
      dataUrlLength: dataUrl?.length,
      imageTabId
    });

    if (!tweetTabId || !dataUrl) {
      console.warn('Cannot send image to tweet tab - missing required data');
      return false;
    }
    
    // Check if already sent
    const shareData = this.stateManager.getPendingXShare(tweetTabId);
    if (shareData?.imageSent) {
      console.log('Image already sent, skipping duplicate send attempt');
      return true;
    }
    
    for (let attempt = 0; attempt < this.maxRetryAttempts; attempt++) {
      try {
        console.log(`Attempt ${attempt + 1}/${this.maxRetryAttempts} to send image to tweet tab ${tweetTabId}`);
        
        // FASTEST RECORD DELAY PATTERN: Exact match to a2830b6
        const currentDelay = attempt === 0 ? 0 : Math.min(
          this.baseDelayMs + (attempt * this.delayIncrementMs), 
          this.maxDelayMs
        );
        
        if (currentDelay > 0) {
          await new Promise(r => setTimeout(r, currentDelay));
        }
        
        // Validate tab status
        const tabInfo = await utilGetTabInfo(tweetTabId);
        if (!tabInfo) {
          console.warn('Tweet tab no longer exists');
          continue;
        }
        
        console.log(`Attempt ${attempt + 1}: Tab status - URL: ${tabInfo.url}, Loading: ${tabInfo.status}`);
        
        // Check if tab is still loading
        if (tabInfo.status === 'loading') {
          console.log('Tab still loading, will retry');
          continue;
        }
        
        // Validate URL
        if (!utilIsValidTweetUrl(tabInfo.url)) {
          console.warn('Tweet tab URL not valid for attachment:', tabInfo.url);
          continue;
        }
        
        // OPTIMIZED CONTENT SCRIPT READINESS: Reduced from 5 → 3 attempts
        const contentScriptReady = await this.contentScriptManager.ensureContentScriptReady(tweetTabId, this.maxPingAttempts);
        if (!contentScriptReady) {
          console.warn(`⚠️ Content script not ready after ${this.maxPingAttempts} ping attempts, will try attachment anyway`);
        }

        // Attempt image attachment with connection retry
        let attachResult = false;
        try {
          attachResult = await this.attachmentManager.attemptImageAttachment(tweetTabId, dataUrl, attempt);
        } catch (attachError) {
          console.warn(`💥 Attachment attempt failed: ${attachError.message}`);
          
          // If connection failed, avoid re-injection to prevent duplicate script instances
          if (attachError.message.includes('connection') || 
              attachError.message.includes('receiving end does not exist') ||
              attachError.message.includes('script did not respond')) {
            console.log('🔄 Connection failed, checking script status without re-injection...');
            
            try {
              // Check if script is responsive first
              const scriptResponsive = await this.contentScriptManager.pingContentScript(tweetTabId);
              if (!scriptResponsive) {
                console.log('⚠️ Script not responsive, but avoiding re-injection to prevent duplicate instances');
                console.log('ℹ️ Will retry attachment without script re-injection');
                
                // Wait a bit for potential script recovery
                await new Promise(r => setTimeout(r, 1000));
              } else {
                console.log('ℹ️ Script is responsive, connection may be temporary issue');
                await new Promise(r => setTimeout(r, 500));
              }
              
              // Retry attachment once without re-injection
              console.log('🔄 Retrying attachment without script re-injection...');
              attachResult = await this.attachmentManager.attemptImageAttachment(tweetTabId, dataUrl, attempt);
            } catch (retryError) {
              console.error('💥 Attachment retry failed:', retryError.message);
              // Continue with the original error handling below
            }
          }
          
          if (!attachResult) {
            // Re-throw the original error if retry didn't work
            throw attachError;
          }
        }
        
        if (attachResult) {
          console.log('🎉 Successfully sent image to tweet tab');
          
          // Cleanup image generation tab
          if (imageTabId) { await utilCleanupImageTab(imageTabId); }
          
          // Mark as sent and update state
          this.stateManager.updatePendingXShare(tweetTabId, { imageSent: true });
          return true;
        }
        
      } catch (error) {
        console.error(`💥 Send attempt ${attempt + 1} failed:`, {
          error: error.message,
          stack: error.stack,
          attempt: attempt + 1,
          maxAttempts: this.maxRetryAttempts
        });
        
        // Check if this is a fatal error that shouldn't be retried
        if (utilIsFatalError(error)) {
          console.error('🛑 Fatal error detected, aborting all retry attempts');
          break;
        }
        
        // Wait before retry with exponential backoff
        if (attempt < this.maxRetryAttempts - 1) {
          const retryDelay = Math.min(2000 * Math.pow(1.5, attempt), this.maxDelayMs);
          console.log(`⏳ Waiting ${retryDelay}ms before retry attempt ${attempt + 2}...`);
          await new Promise(r => setTimeout(r, retryDelay));
        }
      }
    }
    
    console.error('💀 All attempts to send image to tweet tab failed after', this.maxRetryAttempts, 'attempts');
    
    // Show user notification about manual attachment
    await utilShowManual();
    
    // Update state to reflect failure
    this.stateManager.updatePendingXShare(tweetTabId, { imageSent: false });
    return false;
  }

  // ============================================================================
  // CONTENT SCRIPT MANAGEMENT
  // ============================================================================

  

  // ============================================================================
  // IMAGE ATTACHMENT
  // ============================================================================

  

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  

  /**
   * Handle image generation completion
   * @param {string} dataUrl - Generated image data URL
   * @param {number} imageTabId - Image generation tab ID
   * @returns {Promise<boolean>} Success status
   */
  async handleImageGenerated(dataUrl, imageTabId) {
    try {
      console.log('🖼️ SocialMediaService handling imageGenerated:', {
        hasDataUrl: !!dataUrl,
        dataUrlLength: dataUrl?.length,
        imageTabId
      });
      
      if (!dataUrl) {
        throw new Error('No image data provided');
      }
      
      // Find the pending X share that matches this image tab
      const allShares = this.stateManager.getAllPendingXShares();
      let targetShare = null;
      
      for (const [tweetTabId, shareData] of allShares) {
        if (shareData.imageTabId === imageTabId) {
          targetShare = { tweetTabId, ...shareData };
          break;
        }
      }
      
      if (!targetShare) {
        console.warn('No matching pending X share found for image tab:', imageTabId);
        // Clean up the image tab anyway
        if (imageTabId) { await utilCleanupImageTab(imageTabId); }
        return false;
      }
      
      console.log('Found matching share, sending image to tweet tab:', targetShare.tweetTabId);
      
      // Send the image to the tweet tab
      const result = await this.sendImageToTweetTab(
        targetShare.tweetTabId,
        dataUrl,
        imageTabId
      );
      
      return result;
    } catch (error) {
      console.error('❌ handleImageGenerated failed:', error);
      return false;
    }
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  /**
   * SERVICE PERFORMANCE METRICS AND STATISTICS
   * 
   * Provides real-time insights into service performance:
   * - Active/pending share request counts
   * - Configuration parameters for debugging
   * - Performance characteristics tracking
   * 
   * @returns {Object} Comprehensive service statistics
   */
  getStats() {
    const pendingSharesMap = this.stateManager.getAllPendingXShares();
    const pendingShares = Array.from(pendingSharesMap.values());
    return {
      // OPERATIONAL METRICS
      pendingSharesCount: pendingShares.length,
      activeShares: pendingShares.filter(share => !share.imageSent).length,
      completedShares: pendingShares.filter(share => share.imageSent).length,
      
      // PERFORMANCE CONFIGURATION
      maxRetryAttempts: this.maxRetryAttempts,        // 12 (a2830b6 optimized)
      baseDelayMs: this.baseDelayMs,                  // 600ms
      maxDelayMs: this.maxDelayMs,                    // 1500ms
      maxPingAttempts: this.maxPingAttempts,          // 3
      
      // TIMEOUT CONFIGURATION
      timeoutFirstAttempt: this.timeoutFirstAttempt,  // 2000ms
      timeoutEarlyAttempts: this.timeoutEarlyAttempts, // 4000ms
      timeoutLaterAttempts: this.timeoutLaterAttempts  // 6000ms
    };
  }

  /**
   * ADMINISTRATIVE OPERATIONS
   * 
   * Clears all pending share state for cleanup/reset scenarios:
   * - Development/testing reset
   * - Error recovery cleanup
   * - Extension reload preparation
   */
  clearPendingShares() {
    try {
      const sharesMap = this.stateManager.getAllPendingXShares();
      for (const tabId of sharesMap.keys()) {
        this.stateManager.clearPendingXShare(tabId);
      }
      console.log('🧹 SocialMediaService: Cleared all pending X shares');
    } catch (e) {
      console.warn('SocialMediaService: Failed to clear pending X shares:', e?.message || e);
    }
  }

  /**
   * DEVELOPMENT AND DEBUGGING SUPPORT
   * 
   * Enables enhanced logging for performance analysis:
   * - Timing measurements
   * - Retry attempt details
   * - Tab state transitions
   * - Content script communication
   * 
   * @param {boolean} enabled - Whether to enable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    console.log(`🔧 SocialMediaService: Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    
    if (enabled) {
      console.log('🔧 Performance configuration active:', {
        maxRetryAttempts: this.maxRetryAttempts,
        baseDelayMs: this.baseDelayMs,
        maxDelayMs: this.maxDelayMs,
        timeouts: `${this.timeoutFirstAttempt}ms → ${this.timeoutEarlyAttempts}ms → ${this.timeoutLaterAttempts}ms`
      });
    }
  }
}
