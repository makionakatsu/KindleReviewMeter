/**
 * Form Management Service
 * 
 * Extracted from UIManager.js for better separation of concerns
 * 
 * Responsibilities:
 * - Handle form data operations (get, set, clear)
 * - Manage form element value access and manipulation
 * - Provide type-safe data conversion and validation
 * - Support form state management and dirty tracking
 * 
 * This service focuses exclusively on form data operations,
 * making it easier to test and maintain form-related functionality.
 */

export class FormManager {
  constructor(elements) {
    this.elements = elements;
  }

  /**
   * Get all form data as structured object
   * @returns {Object} Current form data
   */
  getFormData() {
    return {
      title: this.getInputValue('title'),
      author: this.getInputValue('author'),
      imageUrl: this.getInputValue('imageUrl'),
      amazonUrl: this.getInputValue('amazonUrl'),
      currentReviews: parseInt(this.getInputValue('reviewCount')) || 0,
      targetReviews: this.getInputValue('targetReviews') ? parseInt(this.getInputValue('targetReviews')) : null,
      associateTag: this.getInputValue('associateTag'),
      associateEnabled: this.elements.associateEnabled?.checked || false
    };
  }

  /**
   * Set form data to UI elements
   * @param {Object} data - Data to populate form with
   */
  setFormData(data) {
    this.setInputValue('title', data.title || '');
    this.setInputValue('author', data.author || '');
    this.setInputValue('imageUrl', data.imageUrl || '');
    this.setInputValue('amazonUrl', data.amazonUrl || '');
    this.setInputValue('reviewCount', data.currentReviews || 0);
    this.setInputValue('targetReviews', data.targetReviews || '');
    this.setInputValue('associateTag', data.associateTag || '');
    
    if (this.elements.associateEnabled) {
      const enabled = (data.associateEnabled !== undefined) ? data.associateEnabled : true;
      this.elements.associateEnabled.checked = enabled;
    }
    
    console.log('FormManager: Form data populated');
  }

  /**
   * Clear all form data
   */
  clearForm() {
    const emptyData = {
      title: '',
      author: '',
      imageUrl: '',
      amazonUrl: '',
      currentReviews: 0,
      targetReviews: null,
      associateTag: '',
      associateEnabled: false
    };
    
    this.setFormData(emptyData);
    console.log('FormManager: Form cleared');
  }

  /**
   * Get input value by field name
   * @param {string} inputName - Name of the input field
   * @returns {string} Input value
   */
  getInputValue(inputName) {
    const element = this.elements[inputName];
    if (!element) {
      console.warn(`FormManager: Element '${inputName}' not found`);
      return '';
    }
    
    return element.type === 'checkbox' ? element.checked : (element.value || '');
  }

  /**
   * Set input value by field name
   * @param {string} inputName - Name of the input field
   * @param {string|number|boolean} value - Value to set
   */
  setInputValue(inputName, value) {
    const element = this.elements[inputName];
    if (!element) {
      console.warn(`FormManager: Element '${inputName}' not found`);
      return;
    }
    
    if (element.type === 'checkbox') {
      element.checked = Boolean(value);
    } else {
      element.value = value || '';
    }
  }

  /**
   * Validate form data
   * @returns {Object} Validation result with errors
   */
  validateFormData() {
    const data = this.getFormData();
    const errors = {};

    // Title validation
    if (!data.title.trim()) {
      errors.title = '書籍タイトルは必須です';
    }

    // Author validation  
    if (!data.author.trim()) {
      errors.author = '著者名は必須です';
    }

    // Amazon URL validation
    if (!data.amazonUrl.trim()) {
      errors.amazonUrl = 'Amazon URLは必須です';
    } else if (!this._isValidAmazonUrl(data.amazonUrl)) {
      errors.amazonUrl = '有効なAmazon URLを入力してください';
    }

    // Review count validation
    if (data.currentReviews < 0) {
      errors.reviewCount = 'レビュー数は0以上である必要があります';
    }

    // Target reviews validation
    if (data.targetReviews !== null && data.targetReviews <= data.currentReviews) {
      errors.targetReviews = '目標レビュー数は現在のレビュー数より大きい必要があります';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Check if Amazon URL is valid
   * @private
   */
  _isValidAmazonUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname.includes('amazon');
    } catch (e) {
      return false;
    }
  }

  /**
   * Get form field names
   * @returns {Array<string>} List of field names
   */
  getFieldNames() {
    return [
      'title',
      'author', 
      'imageUrl',
      'amazonUrl',
      'reviewCount',
      'targetReviews',
      'associateTag',
      'associateEnabled'
    ];
  }

  /**
   * Check if form has any data
   * @returns {boolean} True if form has data
   */
  hasData() {
    const data = this.getFormData();
    return Boolean(
      data.title.trim() ||
      data.author.trim() ||
      data.amazonUrl.trim() ||
      data.currentReviews > 0 ||
      data.targetReviews
    );
  }

  /**
   * Reset specific field to default value
   * @param {string} fieldName - Name of field to reset
   */
  resetField(fieldName) {
    const defaults = {
      title: '',
      author: '',
      imageUrl: '',
      amazonUrl: '',
      reviewCount: 0,
      targetReviews: '',
      associateTag: '',
      associateEnabled: false
    };
    
    if (defaults.hasOwnProperty(fieldName)) {
      this.setInputValue(fieldName, defaults[fieldName]);
    }
  }
}