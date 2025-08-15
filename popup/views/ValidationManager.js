/**
 * Validation Management Service
 * 
 * Extracted from UIManager.js for better separation of concerns
 * 
 * Responsibilities:
 * - Handle form field validation and error display
 * - Manage validation error state and UI feedback
 * - Provide real-time validation for individual fields
 * - Display validation errors with appropriate styling
 * - Support bulk validation error handling
 * 
 * This service focuses exclusively on validation logic and error display,
 * making validation behavior consistent and easier to test.
 */

export class ValidationManager {
  constructor(elements, toastService) {
    this.elements = elements;
    this.toastService = toastService;
    this.validationErrors = {};
  }

  /**
   * Display multiple validation errors
   * @param {Array} errors - Array of error objects with field and message
   */
  displayValidationErrors(errors) {
    // Clear existing errors
    this.clearValidationErrors();
    
    errors.forEach(error => {
      this.showFieldError(error.field, error.message);
    });
    
    // Show summary toast if multiple errors
    if (errors.length > 1) {
      this.toastService.show(`${errors.length}個のエラーがあります`, 'error');
    } else if (errors.length === 1) {
      this.toastService.show(errors[0].message, 'error');
    }
  }

  /**
   * Show error for specific field
   * @param {string} fieldName - Field name
   * @param {string} message - Error message
   */
  showFieldError(fieldName, message) {
    const element = this.elements[fieldName];
    if (!element) {
      console.warn(`ValidationManager: Element '${fieldName}' not found`);
      return;
    }
    
    // Add error class to input
    element.classList.add('error');
    
    // Create or update error message element
    let errorElement = document.getElementById(`${fieldName}-error`);
    if (!errorElement) {
      errorElement = document.createElement('div');
      errorElement.id = `${fieldName}-error`;
      errorElement.className = 'field-error';
      errorElement.style.cssText = `
        color: #ef4444;
        font-size: 12px;
        margin-top: 4px;
        display: none;
      `;
      element.parentNode.appendChild(errorElement);
    }
    
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Store in state
    this.validationErrors[fieldName] = message;
    
    console.log(`ValidationManager: Field error shown for ${fieldName}: ${message}`);
  }

  /**
   * Clear error for specific field
   * @param {string} fieldName - Field name
   */
  clearFieldError(fieldName) {
    const element = this.elements[fieldName];
    if (element) {
      element.classList.remove('error');
    }
    
    const errorElement = document.getElementById(`${fieldName}-error`);
    if (errorElement) {
      errorElement.style.display = 'none';
    }
    
    delete this.validationErrors[fieldName];
    
    console.log(`ValidationManager: Field error cleared for ${fieldName}`);
  }

  /**
   * Clear all validation errors
   */
  clearValidationErrors() {
    Object.keys(this.validationErrors).forEach(fieldName => {
      this.clearFieldError(fieldName);
    });
    this.validationErrors = {};
    
    console.log('ValidationManager: All validation errors cleared');
  }

  /**
   * Validate individual field (called on blur/change)
   * @param {string} fieldName - Field name to validate
   * @returns {boolean} True if field is valid
   */
  validateField(fieldName) {
    const element = this.elements[fieldName];
    if (!element) return true;
    
    const value = element.type === 'checkbox' ? element.checked : element.value.trim();
    let isValid = true;
    let errorMessage = '';

    // Clear existing error first
    this.clearFieldError(fieldName);

    // Field-specific validation
    switch (fieldName) {
      case 'title':
        if (!value) {
          isValid = false;
          errorMessage = '書籍タイトルは必須です';
        }
        break;
        
      case 'author':
        if (!value) {
          isValid = false;
          errorMessage = '著者名は必須です';
        }
        break;
        
      case 'amazonUrl':
        if (!value) {
          isValid = false;
          errorMessage = 'Amazon URLは必須です';
        } else if (!this._isValidAmazonUrl(value)) {
          isValid = false;
          errorMessage = '有効なAmazon URLを入力してください';
        }
        break;
        
      case 'reviewCount':
        const reviewCount = parseInt(value);
        if (isNaN(reviewCount) || reviewCount < 0) {
          isValid = false;
          errorMessage = 'レビュー数は0以上の数値である必要があります';
        }
        break;
        
      case 'targetReviews':
        if (value) {
          const targetReviews = parseInt(value);
          const currentReviews = parseInt(this.elements.reviewCount?.value) || 0;
          if (isNaN(targetReviews) || targetReviews <= currentReviews) {
            isValid = false;
            errorMessage = '目標レビュー数は現在のレビュー数より大きい必要があります';
          }
        }
        break;
        
      case 'associateTag':
        // Associate tag is optional, but if provided should be valid format
        if (value && !/^[a-zA-Z0-9\-_]+$/.test(value)) {
          isValid = false;
          errorMessage = 'アソシエイトタグは英数字、ハイフン、アンダースコアのみ使用可能です';
        }
        break;
    }

    // Show error if validation failed
    if (!isValid) {
      this.showFieldError(fieldName, errorMessage);
    }

    return isValid;
  }

  /**
   * Validate all form fields
   * @returns {Object} Validation result with isValid flag and errors array
   */
  validateAllFields() {
    const fieldNames = [
      'title',
      'author',
      'amazonUrl',
      'reviewCount',
      'targetReviews',
      'associateTag'
    ];

    const errors = [];
    let allValid = true;

    fieldNames.forEach(fieldName => {
      if (!this.validateField(fieldName)) {
        allValid = false;
        if (this.validationErrors[fieldName]) {
          errors.push({
            field: fieldName,
            message: this.validationErrors[fieldName]
          });
        }
      }
    });

    return {
      isValid: allValid,
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
   * Get current validation state
   * @returns {Object} Current validation errors
   */
  getValidationState() {
    return { ...this.validationErrors };
  }

  /**
   * Check if there are any validation errors
   * @returns {boolean} True if there are errors
   */
  hasErrors() {
    return Object.keys(this.validationErrors).length > 0;
  }

  /**
   * Get error count
   * @returns {number} Number of validation errors
   */
  getErrorCount() {
    return Object.keys(this.validationErrors).length;
  }

  /**
   * Setup real-time validation for form elements
   */
  setupRealtimeValidation() {
    const fieldNames = [
      'title',
      'author',
      'amazonUrl',
      'reviewCount',
      'targetReviews',
      'associateTag'
    ];

    fieldNames.forEach(fieldName => {
      const element = this.elements[fieldName];
      if (element) {
        // Validate on blur for better UX
        element.addEventListener('blur', () => {
          this.validateField(fieldName);
        });

        // Clear error on input for immediate feedback
        element.addEventListener('input', () => {
          if (this.validationErrors[fieldName]) {
            this.clearFieldError(fieldName);
          }
        });
      }
    });

    console.log('ValidationManager: Real-time validation setup completed');
  }
}