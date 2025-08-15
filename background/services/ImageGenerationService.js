/**
 * Image Generation Service
 * 
 * Responsibilities:
 * - Coordinate progress visualization image creation
 * - Manage tab-based image generation process
 * - Handle data transfer between popup and image generator
 * - Provide multiple image generation modes (normal, quick, silent)
 * 
 * Features:
 * - Tab management for image generation
 * - Data encoding and transfer optimization
 * - Multiple generation modes support
 * - Error handling and fallback strategies
 * 
 * Notes:
 * - This class orchestrates browser-tab based generation and messaging only.
 *   The actual canvas drawing lives in popup/image-generator.js.
 * - Keep this class free of business logic (tweet text, parsing, etc.).
 */

export class ImageGenerationService {
  constructor() {
    this.activeGenerations = new Map(); // Track active generation processes
    this.generationStats = {
      total: 0,
      successful: 0,
      failed: 0,
      averageTime: 0
    };
  }

  /**
   * Generate progress image for social media sharing
   * @param {Object} data - Book and progress data
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation result
   */
  async generateProgressImage(data, options = {}) {
    const {
      mode = 'normal', // 'normal', 'quick', 'silent'
      quality = 'high',
      format = 'png',
      closeTabAfter = true
    } = options;

    const generationId = this.generateId();
    const startTime = Date.now();

    try {
      console.log('🎨 Starting image generation:', {
        id: generationId,
        mode,
        quality,
        format,
        hasData: !!data
      });

      this.generationStats.total++;
      
      // Validate input data
      this.validateGenerationData(data);

      // Store data for image generation tab access
      await this.storeGenerationData(generationId, data);

      // Create image generation tab
      const tab = await this.createImageGenerationTab(generationId, data, options);

      // Track the generation process
      this.activeGenerations.set(generationId, {
        tabId: tab.id,
        startTime,
        mode,
        data,
        options
      });

      // Handle different modes
      switch (mode) {
        case 'quick':
          return await this.handleQuickGeneration(generationId, tab);
        case 'silent':
          return await this.handleSilentGeneration(generationId, tab);
        default:
          return await this.handleNormalGeneration(generationId, tab);
      }

    } catch (error) {
      this.generationStats.failed++;
      this.cleanupGeneration(generationId);
      
      console.error('❌ Image generation failed:', error);
      throw new Error(`画像生成に失敗しました: ${error.message}`);
    }
  }

  /**
   * Handle normal (user-facing) image generation
   * @private
   */
  async handleNormalGeneration(generationId, tab) {
    console.log('🖼️ Normal generation mode - tab will remain open for user interaction');
    
    const generation = this.activeGenerations.get(generationId);
    const duration = Date.now() - generation.startTime;
    
    this.updateAverageTime(duration);
    this.generationStats.successful++;
    
    return {
      success: true,
      mode: 'normal',
      tabId: tab.id,
      generationId,
      duration,
      message: '画像生成タブを開きました。ダウンロードしてください。'
    };
  }

  /**
   * Handle quick (background) image generation for social media
   * @private
   */
  async handleQuickGeneration(generationId, tab) {
    console.log('⚡ Quick generation mode - background processing');
    
    return new Promise((resolve, reject) => {
      const generation = this.activeGenerations.get(generationId);
      const timeout = setTimeout(() => {
        this.cleanupGeneration(generationId);
        reject(new Error('Quick generation timeout'));
      }, 30000); // 30 second timeout

      // Listen for generation completion
      const messageHandler = (request, sender, sendResponse) => {
        if (request.action === 'imageGenerated' && 
            sender.tab?.id === tab.id) {
          
          clearTimeout(timeout);
          
          const duration = Date.now() - generation.startTime;
          this.updateAverageTime(duration);
          this.generationStats.successful++;
          
          // Clean up listener
          chrome.runtime.onMessage.removeListener(messageHandler);
          
          resolve({
            success: true,
            mode: 'quick',
            dataUrl: request.dataUrl,
            generationId,
            duration,
            tabId: tab.id
          });
        }
      };

      chrome.runtime.onMessage.addListener(messageHandler);
    });
  }

  /**
   * Handle silent image generation
   * @private
   */
  async handleSilentGeneration(generationId, tab) {
    console.log('🔇 Silent generation mode - minimal UI interaction');
    
    // Similar to quick mode but with different UI behavior
    return this.handleQuickGeneration(generationId, tab);
  }

  /**
   * Create image generation tab
   * @private
   */
  async createImageGenerationTab(generationId, data, options) {
    const { mode } = options;
    
    // Method 1: Store data in chrome.storage
    await chrome.storage.local.set({ 
      [`pendingImageData_${generationId}`]: data,
      'pendingImageData': data // Fallback for legacy code
    });
    
    console.log('💾 Stored generation data in chrome.storage');
    
    // Method 2: Create URL with encoded data as backup
    const encodedData = encodeURIComponent(JSON.stringify(data));
    const queryParams = new URLSearchParams({
      data: encodedData,
      generationId,
      mode
    });
    
    const imagePageUrl = chrome.runtime.getURL(`popup/image-generator.html?${queryParams.toString()}`);
    
    // Create tab with appropriate settings based on mode
    const tabOptions = {
      url: imagePageUrl,
      active: mode === 'normal' // Only make active for normal mode
    };

    const tab = await chrome.tabs.create(tabOptions);
    
    console.log('🆕 Created image generation tab:', {
      id: tab.id,
      mode,
      active: tab.active
    });

    return tab;
  }

  /**
   * Store generation data for tab access
   * @private
   */
  async storeGenerationData(generationId, data) {
    const storageKey = `pendingImageData_${generationId}`;
    
    await chrome.storage.local.set({
      [storageKey]: {
        ...data,
        generationId,
        timestamp: Date.now()
      }
    });
    
    // Clean up old generation data (older than 1 hour)
    await this.cleanupOldGenerationData();
  }

  /**
   * Clean up old generation data from storage
   * @private
   */
  async cleanupOldGenerationData() {
    try {
      const result = await chrome.storage.local.get(null);
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      
      const keysToRemove = [];
      
      for (const [key, value] of Object.entries(result)) {
        if (key.startsWith('pendingImageData_') && 
            value.timestamp && 
            (now - value.timestamp) > oneHour) {
          keysToRemove.push(key);
        }
      }
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log('🧹 Cleaned up old generation data:', keysToRemove.length);
      }
    } catch (error) {
      console.warn('⚠️ Failed to cleanup old generation data:', error);
    }
  }

  /**
   * Validate generation data
   * @private
   */
  validateGenerationData(data) {
    if (!data) {
      throw new Error('Generation data is required');
    }
    
    if (!data.title) {
      throw new Error('Book title is required for image generation');
    }
    
    if (typeof data.reviewCount !== 'number' || data.reviewCount < 0) {
      throw new Error('Valid review count is required');
    }
    
    // Additional validation can be added here
    console.log('✅ Generation data validated');
  }

  /**
   * Generate unique ID for generation process
   * @private
   */
  generateId() {
    return `img_gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up generation process
   * @private
   */
  cleanupGeneration(generationId) {
    const generation = this.activeGenerations.get(generationId);
    
    if (generation) {
      // Attempt to close tab if needed
      if (generation.tabId && generation.options?.closeTabAfter !== false) {
        try {
          chrome.tabs.remove(generation.tabId);
          console.log('🗑️ Closed generation tab:', generation.tabId);
        } catch (error) {
          console.warn('⚠️ Failed to close generation tab:', error);
        }
      }
      
      this.activeGenerations.delete(generationId);
    }
    
    // Clean up storage
    chrome.storage.local.remove([`pendingImageData_${generationId}`]);
  }

  /**
   * Update average generation time
   * @private
   */
  updateAverageTime(duration) {
    const total = this.generationStats.total;
    const current = this.generationStats.averageTime;
    
    this.generationStats.averageTime = ((current * (total - 1)) + duration) / total;
  }

  /**
   * Get active generation processes
   * @returns {Array} Active generations
   */
  getActiveGenerations() {
    return Array.from(this.activeGenerations.entries()).map(([id, gen]) => ({
      id,
      tabId: gen.tabId,
      mode: gen.mode,
      startTime: gen.startTime,
      duration: Date.now() - gen.startTime
    }));
  }

  /**
   * Get generation statistics
   * @returns {Object} Generation statistics
   */
  getStats() {
    return {
      ...this.generationStats,
      activeGenerations: this.activeGenerations.size,
      averageTime: `${this.generationStats.averageTime.toFixed(0)}ms`,
      successRate: this.generationStats.total > 0 
        ? `${((this.generationStats.successful / this.generationStats.total) * 100).toFixed(1)}%`
        : '0%'
    };
  }

  /**
   * Cancel active generation
   * @param {string} generationId - Generation ID to cancel
   * @returns {boolean} Whether generation was found and cancelled
   */
  cancelGeneration(generationId) {
    const generation = this.activeGenerations.get(generationId);
    
    if (generation) {
      this.cleanupGeneration(generationId);
      this.generationStats.failed++;
      
      console.log('❌ Generation cancelled:', generationId);
      return true;
    }
    
    return false;
  }

  /**
   * Cancel all active generations
   * @returns {number} Number of generations cancelled
   */
  cancelAllGenerations() {
    const count = this.activeGenerations.size;
    
    for (const generationId of this.activeGenerations.keys()) {
      this.cleanupGeneration(generationId);
    }
    
    this.generationStats.failed += count;
    
    console.log('❌ All generations cancelled:', count);
    return count;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.generationStats = {
      total: 0,
      successful: 0,
      failed: 0,
      averageTime: 0
    };
    
    console.log('📊 Image generation statistics reset');
  }

  /**
   * Get detailed service information
   * @returns {Object} Detailed information
   */
  getDetailedInfo() {
    return {
      stats: this.getStats(),
      activeGenerations: this.getActiveGenerations(),
      configuration: {
        supportedModes: ['normal', 'quick', 'silent'],
        supportedFormats: ['png', 'jpg'],
        supportedQuality: ['high', 'medium', 'low']
      }
    };
  }
}
