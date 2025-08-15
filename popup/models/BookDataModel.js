/**
 * BookDataModel - Book Data Management Model
 * 
 * Responsibilities:
 * - Manage book data state and validation
 * - Handle data transformation and normalization
 * - Provide business logic for book data operations
 * - Validate Amazon URLs and book information
 * - Calculate progress metrics and sharing content
 * 
 * Key Features:
 * - Data validation with detailed error messages
 * - URL normalization for Amazon links
 * - Progress calculation algorithms
 * - Tweet text generation with customization options
 * - Associate ID integration for affiliate links
 */

export default class BookDataModel {
  constructor(storageService) {
    this.storageService = storageService;
    
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
    
    // Validation rules
    this.validationRules = {
      title: {
        required: true,
        minLength: 1,
        maxLength: 200,
        message: 'タイトルは必須です（1-200文字）'
      },
      author: {
        required: true,
        minLength: 1,
        maxLength: 100,
        message: '著者名は必須です（1-100文字）'
      },
      currentReviews: {
        required: true,
        min: 0,
        max: 999999,
        type: 'number',
        message: 'レビュー数は0以上の数値で入力してください'
      },
      targetReviews: {
        required: false,
        min: 1,
        max: 999999,
        type: 'number',
        message: '目標レビュー数は1以上の数値で入力してください'
      },
      amazonUrl: {
        required: false,
        pattern: /^https?:\/\/(?:www\.)?amazon\.co\.jp\/(?:dp\/|gp\/product\/)([A-Z0-9]{10})(?:\/|$|\?)/i,
        message: '有効なAmazon.co.jpのURLを入力してください'
      },
      associateTag: {
        required: false,
        pattern: /^[a-z0-9-]+$/i,
        minLength: 3,
        maxLength: 50,
        message: 'アソシエイトIDは3-50文字の英数字とハイフンで入力してください'
      }
    };
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
    const errors = [];
    const dataToValidate = { ...this.data, ...data };
    
    // Validate each field according to rules
    for (const [field, rules] of Object.entries(this.validationRules)) {
      const value = dataToValidate[field];
      const fieldErrors = this.validateField(field, value, rules);
      errors.push(...fieldErrors);
    }
    
    // Business logic validations
    if (dataToValidate.targetReviews && dataToValidate.currentReviews > dataToValidate.targetReviews) {
      errors.push({
        field: 'targetReviews',
        message: '目標レビュー数は現在のレビュー数以上を設定してください'
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate individual field
   * @private
   * @param {string} field - Field name
   * @param {any} value - Field value
   * @param {Object} rules - Validation rules
   * @returns {Array} Array of error objects
   */
  validateField(field, value, rules) {
    const errors = [];
    
    // Required check
    if (rules.required && (value === null || value === undefined || value === '')) {
      errors.push({
        field: field,
        message: rules.message || `${field} is required`
      });
      return errors; // Skip other validations if required field is empty
    }
    
    // Skip other validations if field is empty and not required
    if (!rules.required && (value === null || value === undefined || value === '')) {
      return errors;
    }
    
    // Type validation
    if (rules.type === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push({
          field: field,
          message: rules.message || `${field} must be a number`
        });
        return errors;
      }
      value = numValue; // Use numeric value for range checks
    }
    
    // Length validations
    if (rules.minLength && String(value).length < rules.minLength) {
      errors.push({
        field: field,
        message: rules.message || `${field} must be at least ${rules.minLength} characters`
      });
    }
    
    if (rules.maxLength && String(value).length > rules.maxLength) {
      errors.push({
        field: field,
        message: rules.message || `${field} must be no more than ${rules.maxLength} characters`
      });
    }
    
    // Range validations for numbers
    if (rules.min !== undefined && value < rules.min) {
      errors.push({
        field: field,
        message: rules.message || `${field} must be at least ${rules.min}`
      });
    }
    
    if (rules.max !== undefined && value > rules.max) {
      errors.push({
        field: field,
        message: rules.message || `${field} must be no more than ${rules.max}`
      });
    }
    
    // Pattern validation
    if (rules.pattern && !rules.pattern.test(String(value))) {
      errors.push({
        field: field,
        message: rules.message || `${field} format is invalid`
      });
    }
    
    return errors;
  }

  // ============================================================================
  // BUSINESS LOGIC
  // ============================================================================

  /**
   * Calculate progress percentage
   * @returns {number|null} Progress percentage (0-100) or null if no target
   */
  getProgressPercentage() {
    if (!this.data.targetReviews || this.data.targetReviews <= 0) {
      return null;
    }
    
    const progress = (this.data.currentReviews / this.data.targetReviews) * 100;
    return Math.min(100, Math.max(0, Math.round(progress)));
  }

  /**
   * Get remaining reviews needed
   * @returns {number|null} Remaining reviews or null if no target
   */
  getRemainingReviews() {
    if (!this.data.targetReviews || this.data.targetReviews <= 0) {
      return null;
    }
    
    return Math.max(0, this.data.targetReviews - this.data.currentReviews);
  }

  /**
   * Check if goal is achieved
   * @returns {boolean} Whether goal is achieved
   */
  isGoalAchieved() {
    const remaining = this.getRemainingReviews();
    return remaining !== null && remaining === 0;
  }

  /**
   * Generate tweet text
   * @param {Object} options - Tweet generation options
   * @returns {string} Generated tweet text
   */
  generateTweetText() {
    const title = this.data.title || '書籍';
    const current = Number(this.data.currentReviews) || 0;
    const target = Number(this.data.targetReviews) || 0;

    let tweetContent = '';
    if (target > 0) {
      const remaining = Math.max(0, target - current);
      tweetContent = `「${title}」のレビューが${current}件になりました！\nレビューを書いて著者を応援しよう！\n目標${target}件まで残り${remaining}件です📚`;
    } else {
      tweetContent = `「${title}」は、現在レビューを${current}件集めています📚\nレビューを書いて著者を応援しよう！`;
    }

    // URL + disclosure (if associate enabled)
    let urlPart = '';
    let disclosure = '';
    if (this.data.associateEnabled) {
      const url = this.getShareableUrl();
      urlPart = url ? `\n${url}` : '';
      if (this.data.associateTag) disclosure = '\n#アマゾンアソシエイトに参加しています';
    }

    return `${tweetContent}${urlPart}\n#KindleReviewMeter${disclosure}`;
  }

  /**
   * Get shareable Amazon URL (with associate tag if enabled)
   * @returns {string} Shareable URL
   */
  getShareableUrl() {
    if (!this.data.amazonUrl) {
      return '';
    }
    
    let url = this.data.amazonUrl;
    
    // Add associate tag if enabled and configured
    if (this.data.associateEnabled && this.data.associateTag) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}tag=${this.data.associateTag}`;
    }
    
    return url;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get data summary for logging
   * @returns {Object} Data summary
   */
  getSummary() {
    const progress = this.getProgressPercentage();
    const remaining = this.getRemainingReviews();
    
    return {
      title: this.data.title ? `"${this.data.title.substring(0, 30)}..."` : 'No title',
      author: this.data.author || 'No author',
      reviews: `${this.data.currentReviews}/${this.data.targetReviews || '?'}`,
      progress: progress !== null ? `${progress}%` : 'No target',
      remaining: remaining !== null ? `${remaining} left` : 'No target',
      hasImage: !!this.data.imageUrl,
      hasUrl: !!this.data.amazonUrl,
      associateEnabled: this.data.associateEnabled
    };
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
