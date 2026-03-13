/**
 * ShareWorkflowService - Orchestrates the complete social sharing workflow
 * Extracted from SocialMediaService.js
 * 
 * Responsibilities:
 * - Complete share-to-X workflow coordination
 * - Image generation and attachment process management
 * - Error handling and fallback logic
 * - Success/failure notification management
 */

import { showManualAttachmentNotification as utilShowManual } from './TabUtils.js';

export default class ShareWorkflowService {
  constructor(tabManager, retryService, contentScriptManager, attachmentManager, errorHandler) {
    this.tabManager = tabManager;
    this.retryService = retryService;
    this.contentScriptManager = contentScriptManager;
    this.attachmentManager = attachmentManager;
    this.errorHandler = errorHandler;
  }

  /**
   * Execute complete share-to-X workflow
   * @param {Object} data - Book data for sharing
   * @param {string} tweetUrl - X compose URL
   * @param {string} tweetText - Text to inject into the compose box
   * @returns {Promise<Object>} Share result with tab IDs
   */
  async executeShareWorkflow(data, tweetUrl, tweetText = '') {
    try {
      console.log('🚀 Starting X share with image process');
      console.log('📊 Data:', data);
      console.log('🔗 Tweet URL:', tweetUrl);
      const shareId = this.generateShareId();
      
      // Create tweet tab and set up state
      const { tweetTab } = await this.tabManager.createTweetTab(tweetUrl, data, shareId, tweetText);
      
      // Create image generation tab in background
      const { backgroundTab } = await this.tabManager.createImageGenerationTab(data, tweetTab.id, shareId, tweetText);
      
      return { 
        success: true, 
        policy: 'strict_affinity',
        shareId,
        tweetTabId: tweetTab.id, 
        imageTabId: backgroundTab.id 
      };
      
    } catch (error) {
      console.error('X share with image failed:', error);
      const failedReason = this.inferFailureReason(error);
      try {
        if (this.errorHandler?.handleXSharingError) {
          this.errorHandler.handleXSharingError(error, {
            operation: 'share_to_x_with_image',
            tweetUrl,
            hasData: !!data,
            failedReason,
            policy: 'strict_affinity'
          });
        }
      } catch {}

      return {
        success: false,
        policy: 'strict_affinity',
        failedReason,
        error: `X投稿準備に失敗しました: ${error.message}`
      };
    }
  }

  generateShareId() {
    return `xshare_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  inferFailureReason(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('tweet url')) return 'invalid_tweet_url';
    if (message.includes('data is required') || message.includes('book')) return 'invalid_share_data';
    if (message.includes('tab') && message.includes('closed')) return 'tab_closed_during_setup';
    return 'share_setup_failed';
  }

  /**
   * Handle image generation completion and send to tweet tab
   * @param {string} dataUrl - Generated image data URL
   * @param {number} imageTabId - Image generation tab ID
   * @returns {Promise<boolean>} Success status
   */
  async handleImageGeneration(dataUrl, imageTabId) {
    try {
      console.log('🖼️ ShareWorkflowService handling imageGenerated:', {
        hasDataUrl: !!dataUrl,
        dataUrlLength: dataUrl?.length,
        imageTabId
      });
      
      if (!dataUrl) {
        throw new Error('No image data provided');
      }
      
      // Find the associated tweet tab
      const targetShare = this.tabManager.findShareByImageTab(imageTabId);
      if (!targetShare) {
        // Clean up orphaned image tab
        await this.tabManager.cleanupImageTab(imageTabId);
        return false;
      }
      
      console.log('Found matching share, sending image to tweet tab:', targetShare.tweetTabId);
      
      // Execute image sending with retry logic
      const result = await this.sendImageWithRetry(
        targetShare.tweetTabId,
        dataUrl,
        imageTabId
      );
      
      return result;
    } catch (error) {
      console.error('❌ handleImageGeneration failed:', error);
      return false;
    }
  }

  /**
   * Send image to tweet tab with optimized retry logic
   * @param {number} tweetTabId - Tweet tab ID
   * @param {string} dataUrl - Image data URL
   * @param {number} imageTabId - Image generation tab ID (for cleanup)
   * @returns {Promise<boolean>} Success status
   */
  async sendImageWithRetry(tweetTabId, dataUrl, imageTabId) {
    console.log('sendImageWithRetry called:', {
      tweetTabId,
      hasDataUrl: !!dataUrl,
      dataUrlLength: dataUrl?.length,
      imageTabId
    });

    if (!tweetTabId || !dataUrl) {
      console.warn('Cannot send image to tweet tab - missing required data');
      return false;
    }
    
    // Check if already sent to avoid duplicates
    if (this.tabManager.isImageAlreadySent(tweetTabId)) {
      return true;
    }
    
    // Create retry context for this operation
    const retryContext = this.retryService.createRetryContext('send_image_to_tweet_tab', {
      tweetTabId,
      imageTabId
    });
    
    try {
      const result = await this.retryService.executeWithRetry(
        async (attempt) => this.attemptImageSend(tweetTabId, dataUrl, attempt),
        retryContext
      );
      
      if (result) {
        console.log('🎉 Successfully sent image to tweet tab');
        
        // Mark as sent and cleanup
        this.tabManager.markImageAsSent(tweetTabId);
        await this.tabManager.cleanupImageTab(imageTabId);
        
        return true;
      }
      
      // If all retries failed, show manual attachment notification
      await this.handleAttachmentFailure(tweetTabId, imageTabId);
      return false;
      
    } catch (error) {
      console.error('❌ Send image with retry failed:', error);
      await this.handleAttachmentFailure(tweetTabId, imageTabId);
      return false;
    }
  }

  /**
   * Attempt to send image to tweet tab (single attempt)
   * @param {number} tweetTabId - Tweet tab ID
   * @param {string} dataUrl - Image data URL
   * @param {number} attempt - Current attempt number
   * @returns {Promise<Object>} Attempt result
   */
  async attemptImageSend(tweetTabId, dataUrl, attempt) {
    // Validate tab status
    const tabValidation = await this.tabManager.validateTweetTab(tweetTabId);
    if (!tabValidation) {
      return { success: false, shouldRetry: false, error: 'Tab no longer exists' };
    }
    
    if (tabValidation.needsRetry) {
      return { success: false, shouldRetry: true, error: 'Tab still loading' };
    }
    
    if (tabValidation.urlInvalid) {
      return { success: false, shouldRetry: true, error: 'Invalid URL for attachment' };
    }
    
    // Ensure content script is ready
    const contentScriptReady = await this.contentScriptManager.ensureContentScriptReady(
      tweetTabId, 
      this.retryService.maxPingAttempts
    );
    
    if (!contentScriptReady) {
      console.warn(`⚠️ Content script not ready after ${this.retryService.maxPingAttempts} ping attempts, will try attachment anyway`);
    }

    // Attempt image attachment
    try {
      const pendingShare = this.tabManager?.stateManager?.getPendingXShare?.(tweetTabId);
      const tweetText = typeof pendingShare?.tweetText === 'string' ? pendingShare.tweetText : '';
      const attachResult = await this.attachmentManager.attemptImageAttachment(tweetTabId, dataUrl, attempt, tweetText);
      return attachResult ? { success: true } : { success: false, shouldRetry: true, error: 'Attachment failed' };
      
    } catch (attachError) {
      console.warn(`💥 Attachment attempt failed: ${attachError.message}`);
      
      // Handle connection errors with recovery attempt
      if (this.retryService.isConnectionError(attachError)) {
        const recoveryResult = await this.attemptConnectionRecovery(tweetTabId, dataUrl, attempt);
        if (recoveryResult) {
          return { success: true };
        }
      }
      
      return { 
        success: false, 
        shouldRetry: !this.retryService.isFatalError(attachError), 
        error: attachError.message 
      };
    }
  }

  /**
   * Attempt to recover from connection errors
   * @param {number} tweetTabId - Tweet tab ID
   * @param {string} dataUrl - Image data URL
   * @param {number} attempt - Current attempt number
   * @returns {Promise<boolean>} Recovery success
   */
  async attemptConnectionRecovery(tweetTabId, dataUrl, attempt) {
    console.log('🔄 Connection failed, checking script status without re-injection...');
    
    try {
      // Check if script is responsive first
      const scriptResponsive = await this.contentScriptManager.pingContentScript(tweetTabId);
      if (!scriptResponsive) {
        console.log('⚠️ Script not responsive, but avoiding re-injection to prevent duplicate instances');
        console.log('ℹ️ Will retry attachment without script re-injection');
        
        // Wait for potential script recovery
        await this.retryService.sleep(1000);
      } else {
        console.log('ℹ️ Script is responsive, connection may be temporary issue');
        await this.retryService.sleep(500);
      }
      
      // Retry attachment once without re-injection
      console.log('🔄 Retrying attachment without script re-injection...');
      const pendingShare = this.tabManager?.stateManager?.getPendingXShare?.(tweetTabId);
      const tweetText = typeof pendingShare?.tweetText === 'string' ? pendingShare.tweetText : '';
      const attachResult = await this.attachmentManager.attemptImageAttachment(tweetTabId, dataUrl, attempt, tweetText);
      return attachResult;
      
    } catch (retryError) {
      console.error('💥 Attachment retry failed:', retryError.message);
      return false;
    }
  }

  /**
   * Handle attachment failure with user notification
   * @param {number} tweetTabId - Tweet tab ID
   * @param {number} imageTabId - Image tab ID for cleanup
   */
  async handleAttachmentFailure(tweetTabId, imageTabId) {
    console.log('💔 All attachment attempts failed, falling back to manual notification');
    
    try {
      // Show manual attachment notification to user
      await utilShowManual(tweetTabId);
      
      // Clean up image tab
      await this.tabManager.cleanupImageTab(imageTabId);
      
      // Mark as completed (user will handle manually)
      this.tabManager.markImageAsSent(tweetTabId);
      
    } catch (notificationError) {
      console.error('Failed to show manual attachment notification:', notificationError);
    }
  }

  /**
   * Get workflow performance statistics
   * @returns {Object} Workflow performance stats
   */
  getWorkflowStats() {
    return {
      ...this.tabManager.getStats(),
      retryConfig: this.retryService.getConfig(),
      estimatedMaxRetryTime: this.retryService.getEstimatedTotalRetryTime()
    };
  }

  /**
   * Clear all workflow state for cleanup
   */
  clearWorkflowState() {
    this.tabManager.clearAllPendingShares();
  }
}
