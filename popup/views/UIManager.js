/**
 * UIManager - Core User Interface Management Class
 * 
 * Refactored Responsibilities:
 * - Initialize and coordinate specialized UI managers
 * - Manage DOM element caching and basic setup
 * - Provide unified interface to delegate specific operations
 * - Handle core UI initialization and coordination
 * 
 * Delegation to Specialized Managers:
 * - FormManager: Form data operations and validation
 * - ValidationManager: Error display and validation logic
 * - LoadingManager: Loading states and indicators
 * - UIStateManager: Keyboard shortcuts and state management
 * 
 * Architecture Benefits:
 * - Single Responsibility Principle adherence
 * - Better testability through focused services
 * - Easier maintenance and debugging
 * - Improved code reusability
 */

import { FormManager } from './FormManager.js';
import { ValidationManager } from './ValidationManager.js';
import { LoadingManager } from './LoadingManager.js';
import { UIStateManager } from './UIStateManager.js';

export default class UIManager {
  constructor(toastService) {
    this.toastService = toastService;
    
    // DOM element cache
    this.elements = {};
    
    // Specialized managers
    this.formManager = null;
    this.validationManager = null;
    this.loadingManager = null;
    this.uiStateManager = null;
    
    // Initialize after DOM is ready
    this.init();
  }

  /**
   * Notes:
   * - Core coordination layer: delegates to specialized managers
   * - Maintains backward compatibility through delegation methods
   * - Single point of initialization for all UI management
   */

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize UI manager and all specialized managers
   */
  init() {
    this.cacheElements();
    this.initializeManagers();
    this.setupEventListeners();
    console.log('🎨 UIManager initialized with specialized managers');
  }

  /**
   * Initialize all specialized managers
   * @private
   */
  initializeManagers() {
    this.formManager = new FormManager(this.elements);
    this.validationManager = new ValidationManager(this.elements, this.toastService);
    this.loadingManager = new LoadingManager(this.elements);
    this.uiStateManager = new UIStateManager(this.elements, this.toastService);
    
    // Setup additional functionality
    this.uiStateManager.setupKeyboardShortcuts();
    this.uiStateManager.setupAutoResize();
    this.uiStateManager.setupFormChangeListeners();
    this.validationManager.setupRealtimeValidation();
    
    console.log('UIManager: All specialized managers initialized');
  }

  /**
   * Cache DOM elements for quick access
   * @private
   */
  cacheElements() {
    // Form elements
    this.elements.amazonUrl = document.getElementById('amazonUrl');
    this.elements.title = document.getElementById('title');
    this.elements.author = document.getElementById('author');
    this.elements.imageUrl = document.getElementById('imageUrl');
    this.elements.reviewCount = document.getElementById('reviewCount');
    this.elements.targetReviews = document.getElementById('targetReviews');
    this.elements.associateTag = document.getElementById('associateTag');
    this.elements.associateEnabled = document.getElementById('associateEnabled');
    
    // Buttons
    this.elements.fetchAmazonBtn = document.getElementById('fetchAmazonBtn');
    this.elements.saveBtn = document.getElementById('saveBtn');
    this.elements.shareToXBtn = document.getElementById('shareToXBtn');
    this.elements.exportBtn = document.getElementById('exportBtn');
    this.elements.clearBtn = document.getElementById('clearBtn');
    
    // Containers
    this.elements.toastContainer = document.getElementById('toast-container');
    this.elements.mainContainer = document.querySelector('.main-container');
    
    // Validate all required elements are found
    const missingElements = Object.entries(this.elements)
      .filter(([key, element]) => !element)
      .map(([key]) => key);
    
    if (missingElements.length > 0) {
      console.error('UIManager: Missing DOM elements:', missingElements);
    }
  }

  /**
   * Setup basic event listeners for UI elements
   * @private
   */
  setupEventListeners() {
    // Basic event listeners are now handled by specialized managers
    console.log('UIManager: Basic event listeners delegated to specialized managers');
  }

  // ============================================================================
  // DELEGATION TO SPECIALIZED MANAGERS
  // ============================================================================

  /**
   * Get form data (delegated to FormManager)
   * @returns {Object} Form data
   */
  getFormData() {
    return this.formManager.getFormData();
  }

  /**
   * Set form data (delegated to FormManager)
   * @param {Object} data - Data to populate form with
   */
  setFormData(data) {
    this.formManager.setFormData(data);
    
    // Clear any existing validation errors
    this.validationManager.clearValidationErrors();
    
    // Mark as clean
    this.uiStateManager.setDirty(false);
    
    console.log('UIManager: Form data populated via FormManager');
  }

  /**
   * Clear all form data (delegated to FormManager)
   */
  clearForm() {
    this.formManager.clearForm();
    this.validationManager.clearValidationErrors();
    this.uiStateManager.setDirty(false);
    console.log('UIManager: Form cleared via FormManager');
  }

  // ============================================================================
  // VALIDATION AND ERROR HANDLING (Delegated to ValidationManager)
  // ============================================================================

  /**
   * Display validation errors (delegated to ValidationManager)
   * @param {Array} errors - Array of error objects
   */
  displayValidationErrors(errors) {
    this.validationManager.displayValidationErrors(errors);
  }

  /**
   * Show error for specific field (delegated to ValidationManager)
   * @param {string} fieldName - Field name
   * @param {string} message - Error message
   */
  showFieldError(fieldName, message) {
    this.validationManager.showFieldError(fieldName, message);
  }

  /**
   * Clear error for specific field (delegated to ValidationManager)
   * @param {string} fieldName - Field name
   */
  clearFieldError(fieldName) {
    this.validationManager.clearFieldError(fieldName);
  }

  /**
   * Clear all validation errors (delegated to ValidationManager)
   */
  clearValidationErrors() {
    this.validationManager.clearValidationErrors();
  }

  /**
   * Validate individual field (delegated to ValidationManager)
   * @param {string} fieldName - Field name to validate
   */
  validateField(fieldName) {
    return this.validationManager.validateField(fieldName);
  }

  // ============================================================================
  // LOADING STATES (Delegated to LoadingManager)
  // ============================================================================

  /**
   * Set global loading state (delegated to LoadingManager)
   * @param {boolean} loading - Loading state
   * @param {string} message - Loading message
   */
  setLoading(loading, message = 'Loading...') {
    this.loadingManager.setLoading(loading, message);
  }

  /**
   * Set button loading state (delegated to LoadingManager)
   * @param {string} buttonName - Button name
   * @param {boolean} loading - Loading state
   * @param {string} loadingText - Loading text
   */
  setButtonLoading(buttonName, loading, loadingText = 'Loading...') {
    this.loadingManager.setButtonLoading(buttonName, loading, loadingText);
  }

  /**
   * Enable/disable form (delegated to LoadingManager)
   * @param {boolean} enabled - Whether form should be enabled
   */
  setFormEnabled(enabled) {
    this.loadingManager.setFormEnabled(enabled);
  }

  // ============================================================================
  // UI STATE MANAGEMENT (Delegated to UIStateManager)
  // ============================================================================

  /**
   * Set dirty state (delegated to UIStateManager)
   * @param {boolean} dirty - Whether form has unsaved changes
   */
  setDirty(dirty) {
    this.uiStateManager.setDirty(dirty);
  }

  /**
   * Update progress display (delegated to UIStateManager)
   * @param {Object} progressData - Progress information
   */
  updateProgressDisplay(progressData) {
    this.uiStateManager.updateProgressDisplay(progressData);
  }

  /**
   * Handle form change (delegated to UIStateManager)
   */
  onFormChange() {
    this.uiStateManager.onFormChange();
  }

  // ============================================================================
  // INPUT HANDLING UTILITIES (Delegated to FormManager)
  // ============================================================================

  /**
   * Get input value safely (delegated to FormManager)
   * @param {string} inputName - Input element name
   * @returns {string} Input value
   */
  getInputValue(inputName) {
    return this.formManager.getInputValue(inputName);
  }

  /**
   * Set input value safely (delegated to FormManager)
   * @param {string} inputName - Input element name
   * @param {any} value - Value to set
   */
  setInputValue(inputName, value) {
    this.formManager.setInputValue(inputName, value);
  }

  // ============================================================================
  // TOAST HELPERS (Delegated to ToastService)
  // ============================================================================

  /**
   * Show success message (delegated to ToastService)
   */
  showSuccess(message, options = {}) {
    try { this.toastService?.show(message, 'success', options); } catch (e) { console.warn('toast failed', e); }
  }

  /**
   * Show error message (delegated to ToastService)
   */
  showError(message, options = {}) {
    try { this.toastService?.show(message, 'error', options); } catch (e) { console.warn('toast failed', e); }
  }

  /**
   * Show info message (delegated to ToastService)
   */
  showInfo(message, options = {}) {
    try { this.toastService?.show(message, 'info', options); } catch (e) { console.warn('toast failed', e); }
  }

  /**
   * Show warning message (delegated to ToastService)
   */
  showWarning(message, options = {}) {
    try { this.toastService?.show(message, 'warning', options); } catch (e) { console.warn('toast failed', e); }
  }

  // ============================================================================
  // STATE ACCESS
  // ============================================================================

  /**
   * Get current state from all managers
   * @returns {Object} Combined state
   */
  getState() {
    return {
      form: this.formManager?.getFormData() || {},
      validation: this.validationManager?.getValidationState() || {},
      loading: this.loadingManager?.getLoadingState() || {},
      ui: this.uiStateManager?.getState() || {}
    };
  }

  /**
   * Check if form has unsaved changes
   * @returns {boolean} True if dirty
   */
  isDirty() {
    return this.uiStateManager?.isDirty() || false;
  }

  // ============================================================================
  // UTILITY METHODS (Delegated to UIStateManager)
  // ============================================================================

  /**
   * Scroll to element (delegated to UIStateManager)
   * @param {string} elementId - Element ID
   */
  scrollToElement(elementId) {
    this.uiStateManager.scrollToElement(elementId);
  }

  /**
   * Focus field (delegated to UIStateManager)
   * @param {string} fieldName - Field name
   */
  focusField(fieldName) {
    this.uiStateManager.focusField(fieldName);
  }

  /**
   * Trigger save action (delegated to UIStateManager)
   */
  triggerSave() {
    this.uiStateManager.triggerSave();
  }

  /**
   * Trigger share to X action (delegated to UIStateManager)
   */
  triggerShareToX() {
    this.uiStateManager.triggerShareToX();
  }

  /**
   * Trigger clear action (delegated to UIStateManager)
   */
  triggerClear() {
    this.uiStateManager.triggerClear();
  }
}