/**
 * SocialMediaService - X/Twitter Integration Service
 * 
 * Responsibilities:
 * - Coordinate image generation and X tweet composition
 * - Manage cross-tab communication for image attachment
 * - Handle automatic image transfer to X compose interface
 * - Provide fallback mechanisms for manual image attachment
 * - Implement retry logic with exponential backoff
 * 
 * Architecture:
 * - Dual-tab system (X compose + image generation)
 * - Direct data URL transfer bypassing clipboard restrictions
 * - Content script injection for robust image attachment
 * - State management for pending share requests
 * - Enhanced error handling and recovery
 * 
 * Extracted from: trySendImageToTweetTab function (277 lines → organized service class)
 */

export default class SocialMediaService {
  constructor(extensionStateManager, errorHandler) {
    this.stateManager = extensionStateManager;
    this.errorHandler = errorHandler;
    
    // Configuration
    this.maxRetryAttempts = 20;
    this.baseDelayMs = 1000;
    this.maxDelayMs = 10000;
    this.attachmentTimeoutMs = 45000;
    this.pingTimeoutMs = 5000;
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
      this.stateManager.updateXShareData(tweetTab.id, { imageTabId: backgroundTab.id });
      
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
        
        // Progressive delay: start quickly, then increase delay
        const currentDelay = attempt === 0 ? 0 : Math.min(
          this.baseDelayMs + (attempt * 200), 
          this.maxDelayMs
        );
        
        if (currentDelay > 0) {
          await new Promise(r => setTimeout(r, currentDelay));
        }
        
        // Validate tab status
        const tabInfo = await this.getTabInfo(tweetTabId);
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
        if (!this.isValidTweetUrl(tabInfo.url)) {
          console.warn('Tweet tab URL not valid for attachment:', tabInfo.url);
          continue;
        }
        
        // Ensure content script is ready
        const contentScriptReady = await this.ensureContentScriptReady(tweetTabId, 5);
        if (!contentScriptReady) {
          console.warn(`⚠️ Content script not ready after 5 ping attempts, will try attachment anyway`);
        }

        // Attempt image attachment
        const attachResult = await this.attemptImageAttachment(tweetTabId, dataUrl);
        
        if (attachResult) {
          console.log('🎉 Successfully sent image to tweet tab');
          
          // Cleanup image generation tab
          if (imageTabId) {
            await this.cleanupImageTab(imageTabId);
          }
          
          // Mark as sent and update state
          this.stateManager.updateXShareData(tweetTabId, { imageSent: true });
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
        if (this.isFatalError(error)) {
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
    await this.showManualAttachmentNotification();
    
    // Update state to reflect failure
    this.stateManager.updateXShareData(tweetTabId, { imageSent: false });
    return false;
  }

  // ============================================================================
  // CONTENT SCRIPT MANAGEMENT
  // ============================================================================

  /**
   * Ensure content script is ready and responsive
   * @private
   * @param {number} tabId - Tab ID
   * @param {number} maxAttempts - Maximum ping attempts
   * @returns {Promise<boolean>} Whether content script is ready
   */
  async ensureContentScriptReady(tabId, maxAttempts = 5) {
    for (let pingAttempt = 0; pingAttempt < maxAttempts; pingAttempt++) {
      console.log(`Ping/inject attempt ${pingAttempt + 1}/${maxAttempts}`);
      
      // Always try injection first (idempotent operation)
      if (chrome?.scripting?.executeScript) {
        try {
          console.log(`Injecting content script (attempt ${pingAttempt + 1})`);
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content-scripts/x-tweet-auto-attach.js']
          });
          
          // Wait progressively longer for script initialization
          const initWait = Math.min(1000 + (pingAttempt * 500), 3000);
          console.log(`Waiting ${initWait}ms for content script initialization`);
          await new Promise(r => setTimeout(r, initWait));
        } catch (injectionError) {
          console.warn(`Content script injection failed (attempt ${pingAttempt + 1}):`, injectionError.message);
          
          // If tab doesn't exist, abort immediately
          if (injectionError.message.includes('No tab with id')) {
            console.error('Tweet tab no longer exists, aborting');
            throw new Error('Tweet tab was closed');
          }
        }
      }
      
      // Test if content script is responsive
      const pingResult = await this.pingContentScript(tabId);
      
      if (pingResult) {
        console.log('✅ Content script is ready and responding');
        return true;
      }
      
      // Exponential backoff between attempts
      if (pingAttempt < maxAttempts - 1) {
        const waitTime = Math.min(1000 * Math.pow(2, pingAttempt), 4000);
        console.log(`❌ Ping failed, waiting ${waitTime}ms before retry`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
    
    return false;
  }

  /**
   * Ping content script to check responsiveness
   * @private
   * @param {number} tabId - Tab ID
   * @returns {Promise<boolean>} Whether ping was successful
   */
  async pingContentScript(tabId) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log(`Ping timeout after ${this.pingTimeoutMs}ms`);
        resolve(false);
      }, this.pingTimeoutMs);
      
      chrome.tabs.sendMessage(tabId, { action: 'krmPing' }, (resp) => {
        clearTimeout(timeout);
        const success = !chrome.runtime.lastError && resp?.pong;
        console.log(`Ping result:`, { 
          success, 
          response: resp, 
          error: chrome.runtime.lastError?.message 
        });
        resolve(success);
      });
    });
  }

  // ============================================================================
  // IMAGE ATTACHMENT
  // ============================================================================

  /**
   * Attempt to attach image to tweet composition
   * @private
   * @param {number} tabId - Tweet tab ID
   * @param {string} dataUrl - Image data URL
   * @returns {Promise<boolean>} Success status
   */
  async attemptImageAttachment(tabId, dataUrl) {
    console.log('🎯 Attempting image attachment...');
    
    return new Promise((resolve, reject) => {
      let responseReceived = false;
      
      const timeout = setTimeout(() => {
        if (!responseReceived) {
          console.error(`🔥 Image attachment timed out after ${this.attachmentTimeoutMs}ms`);
          reject(new Error(`Image attachment timeout after ${this.attachmentTimeoutMs}ms`));
        }
      }, this.attachmentTimeoutMs);
      
      try {
        // Check if tab still exists before sending message
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            clearTimeout(timeout);
            console.error('❌ Tweet tab no longer exists:', chrome.runtime.lastError.message);
            return reject(new Error('Tweet tab was closed or inaccessible'));
          }
          
          console.log('📤 Sending attachment message to tab:', tab.url);
          
          chrome.tabs.sendMessage(tabId, {
            action: 'attachImageDataUrl',
            dataUrl: dataUrl
          }, (resp) => {
            responseReceived = true;
            clearTimeout(timeout);
            
            const lastError = chrome.runtime.lastError;
            console.log('📨 Attachment response received:', {
              response: resp,
              lastError: lastError?.message,
              timestamp: new Date().toISOString()
            });
            
            if (lastError) {
              console.error('💥 Chrome runtime error during attachment:', lastError.message);
              
              // Handle specific error cases
              if (lastError.message.includes('message channel closed') || 
                  lastError.message.includes('receiving end does not exist')) {
                return reject(new Error('Content script connection lost - tab may have navigated or refreshed'));
              }
              
              return reject(new Error(`Chrome runtime error: ${lastError.message}`));
            }
            
            // Handle null/undefined response (content script may have crashed)
            if (!resp) {
              console.warn('⚠️ Received null response from content script');
              return reject(new Error('Content script did not respond (may have crashed or been unloaded)'));
            }
            
            if (resp.ok) {
              console.log('✅ Content script confirmed successful image attachment');
              return resolve(true);
            }
            
            const errorMsg = resp.error || 'Unknown attachment error';
            console.error('❌ Content script attachment failed:', errorMsg);
            reject(new Error(`Content script attachment failed: ${errorMsg}`));
          });
        });
      } catch (sendError) {
        clearTimeout(timeout);
        console.error('💥 Failed to send attachment message:', sendError.message);
        reject(new Error(`Message send failed: ${sendError.message}`));
      }
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get tab information safely
   * @private
   * @param {number} tabId - Tab ID
   * @returns {Promise<Object|null>} Tab info or null
   */
  async getTabInfo(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          console.warn('Tab query failed:', chrome.runtime.lastError.message);
          return resolve(null);
        }
        resolve(tab);
      });
    });
  }

  /**
   * Check if URL is valid for tweet attachment
   * @private
   * @param {string} url - URL to validate
   * @returns {boolean} Whether URL is valid
   */
  isValidTweetUrl(url) {
    return /^https:\/\/(?:mobile\.)?(?:x|twitter)\.com\//.test(url);
  }

  /**
   * Check if error is fatal and shouldn't be retried
   * @private
   * @param {Error} error - Error to check
   * @returns {boolean} Whether error is fatal
   */
  isFatalError(error) {
    const fatalErrors = [
      'Tweet tab was closed',
      'No tab with id',
      'Cannot access'
    ];
    
    return fatalErrors.some(fatal => error.message.includes(fatal));
  }

  /**
   * Cleanup image generation tab
   * @private
   * @param {number} imageTabId - Image tab ID
   */
  async cleanupImageTab(imageTabId) {
    try { 
      console.log('🧹 Cleaning up image generation tab:', imageTabId);
      await chrome.tabs.remove(imageTabId); 
    } catch (cleanupError) {
      console.warn('⚠️ Failed to cleanup image tab:', cleanupError.message);
    }
  }

  /**
   * Show notification about manual attachment fallback
   * @private
   */
  async showManualAttachmentNotification() {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      try {
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Kindle Review Meter',
          message: '画像の自動添付に失敗しました。手動で画像をX投稿に添付してください。'
        });
      } catch (notifError) {
        console.warn('Failed to show notification:', notifError.message);
      }
    }
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    const pendingShares = this.stateManager.getAllPendingXShares();
    return {
      pendingSharesCount: pendingShares.length,
      activeShares: pendingShares.filter(share => !share.imageSent).length,
      completedShares: pendingShares.filter(share => share.imageSent).length,
      maxRetryAttempts: this.maxRetryAttempts,
      attachmentTimeoutMs: this.attachmentTimeoutMs
    };
  }

  /**
   * Clear all pending shares
   */
  clearPendingShares() {
    this.stateManager.clearAllPendingXShares();
    console.log('🧹 Cleared all pending X shares');
  }

  /**
   * Set debug mode for enhanced logging
   * @param {boolean} enabled - Whether to enable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    console.log(`🔧 SocialMediaService debug mode: ${enabled ? 'enabled' : 'disabled'}`);
  }
}