/**
 * TabManagementService - Tab creation and state management for social sharing
 * Extracted from SocialMediaService.js
 * 
 * Responsibilities:
 * - X tweet tab creation and validation
 * - Image generation tab management
 * - Tab state tracking and cleanup
 * - Share data state management coordination
 */

import { getTabInfo as utilGetTabInfo, isValidTweetUrl as utilIsValidTweetUrl, cleanupImageTab as utilCleanupImageTab } from './TabUtils.js';

export default class TabManagementService {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Create X tweet tab and set up initial state
   * @param {string} tweetUrl - X compose URL
   * @param {Object} data - Book data for sharing
   * @returns {Promise<Object>} Created tab and state info
   */
  async createTweetTab(tweetUrl, data) {
    if (!tweetUrl) {
      throw new Error('Tweet URL is required but not provided');
    }
    
    if (!data) {
      throw new Error('Data is required but not provided');
    }

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

    return { tweetTab, shareData };
  }

  /**
   * Create image generation tab in background
   * @param {Object} data - Book data for image generation
   * @param {number} tweetTabId - Associated tweet tab ID
   * @returns {Promise<Object>} Created image tab info
   */
  async createImageGenerationTab(data, tweetTabId) {
    // Store data for image generation
    await chrome.storage.local.set({ 'pendingImageData': data });
    console.log('Stored data in chrome.storage for image generation');
    
    // Create image generation page URL
    const encodedData = encodeURIComponent(JSON.stringify(data));
    const imagePageUrl = chrome.runtime.getURL(`popup/image-generator.html?data=${encodedData}&quickMode=true`);
    
    // Create image generation tab in background
    const backgroundTab = await chrome.tabs.create({
      url: imagePageUrl,
      active: false
    });

    console.log('Created image generation tab:', backgroundTab.id);
    
    // Update share state with image tab ID
    this.stateManager.updatePendingXShare(tweetTabId, { imageTabId: backgroundTab.id });
    
    return { backgroundTab };
  }

  /**
   * Validate tweet tab status and URL
   * @param {number} tweetTabId - Tweet tab ID to validate
   * @returns {Promise<Object|null>} Tab info if valid, null if invalid
   */
  async validateTweetTab(tweetTabId) {
    const tabInfo = await utilGetTabInfo(tweetTabId);
    if (!tabInfo) {
      console.warn('Tweet tab no longer exists');
      return null;
    }
    
    console.log(`Tab status - URL: ${tabInfo.url}, Loading: ${tabInfo.status}`);
    
    // Check if tab is still loading
    if (tabInfo.status === 'loading') {
      console.log('Tab still loading, needs retry');
      return { ...tabInfo, needsRetry: true };
    }
    
    // Validate URL
    if (!utilIsValidTweetUrl(tabInfo.url)) {
      console.warn('Tweet tab URL not valid for attachment:', tabInfo.url);
      return { ...tabInfo, urlInvalid: true };
    }

    return { ...tabInfo, valid: true };
  }

  /**
   * Find pending share by image tab ID
   * @param {number} imageTabId - Image tab ID
   * @returns {Object|null} Share data if found
   */
  findShareByImageTab(imageTabId) {
    const allShares = this.stateManager.getAllPendingXShares();
    
    for (const [tweetTabId, shareData] of allShares) {
      if (shareData.imageTabId === imageTabId) {
        return { tweetTabId, ...shareData };
      }
    }
    
    console.warn('No matching pending X share found for image tab:', imageTabId);
    return null;
  }

  /**
   * Check if image was already sent to avoid duplicates
   * @param {number} tweetTabId - Tweet tab ID
   * @returns {boolean} Whether image was already sent
   */
  isImageAlreadySent(tweetTabId) {
    const shareData = this.stateManager.getPendingXShare(tweetTabId);
    if (shareData?.imageSent) {
      console.log('Image already sent, skipping duplicate send attempt');
      return true;
    }
    return false;
  }

  /**
   * Mark image as sent in share state
   * @param {number} tweetTabId - Tweet tab ID
   */
  markImageAsSent(tweetTabId) {
    this.stateManager.updatePendingXShare(tweetTabId, { 
      imageSent: true, 
      sentAt: Date.now() 
    });
  }

  /**
   * Clean up image generation tab
   * @param {number} imageTabId - Image tab ID to cleanup
   */
  async cleanupImageTab(imageTabId) {
    if (imageTabId) {
      await utilCleanupImageTab(imageTabId);
    }
  }

  /**
   * Get tab management statistics
   * @returns {Object} Statistics about managed tabs
   */
  getStats() {
    const pendingSharesMap = this.stateManager.getAllPendingXShares();
    const pendingShares = Array.from(pendingSharesMap.values());
    
    return {
      pendingSharesCount: pendingShares.length,
      activeShares: pendingShares.filter(share => !share.imageSent).length,
      completedShares: pendingShares.filter(share => share.imageSent).length,
      oldestPendingShare: pendingShares.length > 0 ? 
        Math.min(...pendingShares.map(s => s.createdAt)) : null
    };
  }

  /**
   * Clear all pending shares for cleanup
   */
  clearAllPendingShares() {
    const sharesMap = this.stateManager.getAllPendingXShares();
    for (const tabId of sharesMap.keys()) {
      this.stateManager.clearPendingXShare(tabId);
    }
    console.log('🧹 TabManagementService: Cleared all pending X shares');
  }
}