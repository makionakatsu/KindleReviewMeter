/**
 * BookDataValidator - Data validation logic for book information
 * Extracted from BookDataModel.js - handles validation rules and field checking
 * 
 * Responsibilities:
 * - Define and enforce validation rules for book data fields
 * - Validate individual fields and complete data objects
 * - Provide detailed error messages for validation failures
 * - Handle business logic validations (e.g., target vs current reviews)
 */

export default class BookDataValidator {
  constructor() {
    // Validation rules for book data fields
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
   * Validate complete data object against all rules
   * @param {Object} data - Data object to validate
   * @param {Object} existingData - Current data for merge validation
   * @returns {Object} Validation result with isValid flag and errors array
   */
  validateData(data, existingData = {}) {
    const errors = [];
    const dataToValidate = { ...existingData, ...data };
    
    // Validate each field according to rules
    for (const [field, rules] of Object.entries(this.validationRules)) {
      const value = dataToValidate[field];
      const fieldErrors = this.validateField(field, value, rules);
      errors.push(...fieldErrors);
    }
    
    // Business logic validations
    // Note: targetReviews can be any positive number (smaller than current is also valid)
    // This allows for flexible goal setting and progress tracking beyond 100%
    // No additional validation needed - basic number validation is sufficient
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate individual field against its rules
   * @param {string} field - Field name
   * @param {any} value - Field value
   * @param {Object} rules - Validation rules (optional, uses default if not provided)
   * @returns {Array} Array of error objects
   */
  validateField(field, value, rules = null) {
    const validationRules = rules || this.validationRules[field];
    if (!validationRules) {
      return []; // No rules defined for this field
    }
    
    const errors = [];
    
    // Required check
    if (validationRules.required && (value === null || value === undefined || value === '')) {
      errors.push({
        field: field,
        message: validationRules.message || `${field} is required`
      });
      return errors; // Skip other validations if required field is empty
    }
    
    // Skip other validations if field is empty and not required
    if (!validationRules.required && (value === null || value === undefined || value === '')) {
      return errors;
    }
    
    // Type validation
    if (validationRules.type === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push({
          field: field,
          message: validationRules.message || `${field} must be a number`
        });
        return errors;
      }
      value = numValue; // Use numeric value for range checks
    }
    
    // Length validations
    if (validationRules.minLength && String(value).length < validationRules.minLength) {
      errors.push({
        field: field,
        message: validationRules.message || `${field} must be at least ${validationRules.minLength} characters`
      });
    }
    
    if (validationRules.maxLength && String(value).length > validationRules.maxLength) {
      errors.push({
        field: field,
        message: validationRules.message || `${field} must be no more than ${validationRules.maxLength} characters`
      });
    }
    
    // Range validations for numbers
    if (validationRules.min !== undefined && value < validationRules.min) {
      errors.push({
        field: field,
        message: validationRules.message || `${field} must be at least ${validationRules.min}`
      });
    }
    
    if (validationRules.max !== undefined && value > validationRules.max) {
      errors.push({
        field: field,
        message: validationRules.message || `${field} must be no more than ${validationRules.max}`
      });
    }
    
    // Pattern validation
    if (validationRules.pattern && !validationRules.pattern.test(String(value))) {
      errors.push({
        field: field,
        message: validationRules.message || `${field} format is invalid`
      });
    }
    
    return errors;
  }

  /**
   * Get validation rules for a specific field
   * @param {string} field - Field name
   * @returns {Object|null} Validation rules or null if not found
   */
  getFieldRules(field) {
    return this.validationRules[field] || null;
  }

  /**
   * Get all validation rules
   * @returns {Object} All validation rules
   */
  getAllRules() {
    return { ...this.validationRules };
  }
}