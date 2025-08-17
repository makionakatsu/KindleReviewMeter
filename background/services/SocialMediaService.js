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
import TabManagementService from './socialmedia/TabManagementService.js';
import RetryLogicService from './socialmedia/RetryLogicService.js';
import ShareWorkflowService from './socialmedia/ShareWorkflowService.js';

export default class SocialMediaService {
  constructor(extensionStateManager, errorHandler) {
    this.stateManager = extensionStateManager;
    this.errorHandler = errorHandler;
    
    // PERFORMANCE CONFIGURATION - Matches a2830b6 fastest record exactly
    const retryConfig = {
      maxRetryAttempts: 12,        // Reduced from 20 → 12 (40% fewer attempts)
      baseDelayMs: 600,            // Base delay matches original trySendImageToTweetTab
      delayIncrementMs: 150,       // Linear increment per attempt
      maxDelayMs: 1500,            // Cap delay at 1.5s (vs original 10s)
      maxPingAttempts: 3           // Content script ping attempts (was 5)
    };
    
    const attachmentConfig = {
      timeoutFirstAttempt: 2000,   // 2s for attempt 0
      timeoutEarlyAttempts: 4000,  // 4s for attempts 1-2  
      timeoutLaterAttempts: 6000   // 6s for attempts 3+
    };

    // Initialize specialized services
    this.tabManager = new TabManagementService(this.stateManager);
    this.retryService = new RetryLogicService(retryConfig);
    this.contentScriptManager = new ContentScriptManager({ pingTimeoutMs: 1500 });
    this.attachmentManager = new AttachmentManager(attachmentConfig);
    this.workflowService = new ShareWorkflowService(
      this.tabManager,
      this.retryService,
      this.contentScriptManager,
      this.attachmentManager,
      this.errorHandler
    );
  }

  /**
   * Main method to share content to X with image attachment
   * @param {Object} data - Book data for image generation
   * @param {string} tweetUrl - X compose URL
   * @returns {Promise<Object>} Share result with tab IDs
   */
  async shareToXWithImage(data, tweetUrl) {
    return this.workflowService.executeShareWorkflow(data, tweetUrl);
  }

  /**
   * Attempt to send image to tweet tab with retry logic
   * @param {number} tweetTabId - Tweet tab ID
   * @param {string} dataUrl - Image data URL
   * @param {number} imageTabId - Image generation tab ID (for cleanup)
   * @returns {Promise<boolean>} Success status
   */
  async sendImageToTweetTab(tweetTabId, dataUrl, imageTabId) {
    return this.workflowService.sendImageWithRetry(tweetTabId, dataUrl, imageTabId);
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
    return this.workflowService.handleImageGeneration(dataUrl, imageTabId);
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  /**
   * Get comprehensive service statistics and performance metrics
   * @returns {Object} Service statistics
   */
  getStats() {
    return this.workflowService.getWorkflowStats();
  }

  /**
   * Clear all pending share state for cleanup/reset scenarios
   */
  clearPendingShares() {
    this.workflowService.clearWorkflowState();
  }

  /**
   * Enable/disable debug mode for development and performance analysis
   * @param {boolean} enabled - Whether to enable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    console.log(`🔧 SocialMediaService: Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    
    if (enabled) {
      console.log('🔧 Performance configuration active:', this.getStats());
    }
  }
}
