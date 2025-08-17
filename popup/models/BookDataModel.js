/**
 * BookDataModel - Book Data Management Model (Modularized)
 * 
 * Core Responsibilities:
 * - Manage book data state and persistence
 * - Coordinate between specialized service modules
 * - Handle data transformation and normalization
 * - Provide unified API for book data operations
 * 
 * Service Delegation:
 * - Validation logic delegated to BookDataValidator
 * - Progress calculations delegated to BookProgressCalculator  
 * - Text generation delegated to BookTextGenerator
 */

import BookDataValidator from './book/BookDataValidator.js';
import BookProgressCalculator from './book/BookProgressCalculator.js';
import BookTextGenerator from './book/BookTextGenerator.js';

export default class BookDataModel {
  constructor(storageService) {
    this.storageService = storageService;
    
    // Initialize service modules
    this.validator = new BookDataValidator();
    this.progressCalculator = new BookProgressCalculator();
    this.textGenerator = new BookTextGenerator();
    
    // Default book data structure
    this.defaultData = {
      title: '',
      author: '',
      imageUrl: '',
      amazonUrl: '',
      currentReviews: 0,
      targetReviews: null,
      associateTag: '',
      associateEnabled: true,
      lastUpdated: null,
      extractedFrom: '',
      createdAt: null
    };
    
    // Current book data state
    this.data = { ...this.defaultData };
  }
  /**
   * Notes:
   * - Model encapsulates validation and data shaping for popup only.
   * - Keep API surface stable for controller and view; no direct DOM access.
   */

  // ============================================================================
  // DATA MANAGEMENT
  // ============================================================================

  /**
   * Load book data from storage
   * @returns {Promise<Object>} Loaded book data
   */
  async load() {
    try {
      const savedData = await this.storageService.load();
      if (savedData && typeof savedData === 'object') {
        // Merge with default data to ensure all fields exist
        this.data = { ...this.defaultData, ...savedData };
        console.log('📚 Book data loaded:', this.getSummary());
      } else {
        this.data = { ...this.defaultData };
        console.log('📚 Using default book data (no saved data found)');
      }
      return this.data;
    } catch (error) {
      console.error('Failed to load book data:', error);
      this.data = { ...this.defaultData };
      return this.data;
    }
  }

  /**
   * Save book data to storage
   * @returns {Promise<boolean>} Success status
   */
  async save() {
    try {
      // Update timestamps
      this.data.lastUpdated = new Date().toISOString();
      if (!this.data.createdAt) {
        this.data.createdAt = this.data.lastUpdated;
      }
      
      const success = await this.storageService.save(this.data);
      if (success) {
        console.log('💾 Book data saved:', this.getSummary());
      } else {
        console.error('Failed to save book data');
      }
      return success;
    } catch (error) {
      console.error('Error saving book data:', error);
      return false;
    }
  }

  /**
   * Clear all book data
   * @returns {Promise<boolean>} Success status
   */
  async clear() {
    try {
      this.data = { ...this.defaultData };
      const success = await this.storageService.clear();
      if (success) {
        console.log('🗑️ Book data cleared');
      }
      return success;
    } catch (error) {
      console.error('Error clearing book data:', error);
      return false;
    }
  }

  // ============================================================================
  // DATA ACCESS AND MANIPULATION
  // ============================================================================

  /**
   * Get current book data
   * @returns {Object} Current book data
   */
  getData() {
    return { ...this.data };
  }

  /**
   * Set book data
   * @param {Object} newData - New book data
   * @param {boolean} validate - Whether to validate data
   * @returns {Object} Validation result
   */
  setData(newData, validate = true) {
    if (validate) {
      const validation = this.validateData(newData);
      if (!validation.isValid) {
        return validation;
      }
    }
    
    // Merge with current data
    this.data = { ...this.data, ...newData };
    
    return { isValid: true, errors: [] };
  }

  /**
   * Update specific field
   * @param {string} field - Field name
   * @param {any} value - New value
   * @param {boolean} validate - Whether to validate
   * @returns {Object} Validation result
   */
  updateField(field, value, validate = true) {
    const newData = { [field]: value };
    return this.setData(newData, validate);
  }

  /**
   * Update from Amazon data fetch result
   * @param {Object} amazonData - Data from Amazon fetch
   * @returns {Object} Updated data
   */
  updateFromAmazonData(amazonData) {
    const updates = {};
    
    if (amazonData.title) {
      updates.title = amazonData.title;
    }
    
    if (amazonData.author) {
      updates.author = amazonData.author;
    }
    
    if (amazonData.imageUrl) {
      updates.imageUrl = amazonData.imageUrl;
    }
    
    if (amazonData.currentReviews !== undefined) {
      updates.currentReviews = parseInt(amazonData.currentReviews) || 0;
    } else if (amazonData.reviewCount !== undefined) {
      updates.currentReviews = parseInt(amazonData.reviewCount) || 0;
    }
    
    // Prefer normalized URL fields from background
    const srcUrl = amazonData.normalizedUrl || amazonData.amazonUrl || amazonData.extractedFrom || amazonData.url;
    if (srcUrl) {
      updates.extractedFrom = srcUrl;
      updates.amazonUrl = srcUrl;
    }
    
    updates.lastUpdated = new Date().toISOString();
    
    const result = this.setData(updates, true);
    if (result.isValid) {
      console.log('📚 Book data updated from Amazon:', this.getSummary());
    }
    
    return result;
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate book data
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result with errors
   */
  validateData(data) {
    return this.validator.validateData(data, this.data);
  }

  validateField(field, value) {
    return this.validator.validateField(field, value);
  }

  // ============================================================================
  // BUSINESS LOGIC
  // ============================================================================

  /**
   * Calculate progress percentage
   * @returns {number|null} Progress percentage (0-100) or null if no target
   */
  getProgressPercentage() {
    return this.progressCalculator.getProgressPercentage(this.data.currentReviews, this.data.targetReviews);
  }

  getRemainingReviews() {
    return this.progressCalculator.getRemainingReviews(this.data.currentReviews, this.data.targetReviews);
  }

  isGoalAchieved() {
    return this.progressCalculator.isGoalAchieved(this.data.currentReviews, this.data.targetReviews);
  }

  /**
   * Generate tweet text
   * @param {Object} options - Tweet generation options
   * @returns {string} Generated tweet text
   */
  generateTweetText() {
    const progressData = this.progressCalculator.getProgressSummary(this.data.currentReviews, this.data.targetReviews);
    return this.textGenerator.generateTweetText(this.data, progressData);
  }

  getShareableUrl() {
    return this.textGenerator.getShareableUrl(this.data);
  }

  getSummary() {
    const progressData = this.progressCalculator.getProgressSummary(this.data.currentReviews, this.data.targetReviews);
    return this.textGenerator.getSummary(this.data, progressData);
  }

  /**
   * Check if data is complete enough for sharing
   * @returns {boolean} Whether data is complete
   */
  isComplete() {
    return !!(this.data.title && this.data.author && this.data.currentReviews !== undefined);
  }

  /**
   * Export data for image generation
   * @returns {Object} Data formatted for image generation
   */
  exportForImageGeneration() {
    return {
      title: this.data.title,
      author: this.data.author,
      imageUrl: this.data.imageUrl,
      // Both fields for backward compatibility with image generator
      currentReviews: this.data.currentReviews,
      reviewCount: this.data.currentReviews,
      targetReviews: this.data.targetReviews,
      progressPercentage: this.getProgressPercentage(),
      remainingReviews: this.getRemainingReviews(),
      isGoalAchieved: this.isGoalAchieved(),
      url: this.getShareableUrl(),
      generateTime: new Date().toISOString()
    };
  }

  /**
   * Reset to default state
   */
  reset() {
    this.data = { ...this.defaultData };
    console.log('🔄 Book data reset to defaults');
  }
}
