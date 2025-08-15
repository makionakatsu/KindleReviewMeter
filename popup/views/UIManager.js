/**
 * UIManager - User Interface Management Class
 * 
 * Responsibilities:
 * - Manage DOM element interactions and updates
 * - Handle form validation and user feedback
 * - Control visual states and loading indicators
 * - Manage toast notifications and error displays
 * - Handle responsive UI updates based on data changes
 * 
 * Key Features:
 * - Centralized DOM manipulation
 * - Form validation with real-time feedback
 * - Loading states and progress indicators
 * - Toast notification system
 * - Keyboard shortcuts and accessibility features
 */

export default class UIManager {
  constructor(toastService) {
    this.toastService = toastService;
    
    // DOM element cache
    this.elements = {};
    
    // UI state
    this.state = {
      isLoading: false,
      isDirty: false,
      validationErrors: {},
      formLocked: false
    };
    
    // Initialize after DOM is ready
    this.init();
  }
  /**
   * Notes:
   * - View layer only: no business logic here. Keep DOM concerns isolated.
   * - Expose minimal helpers for PopupController to orchestrate actions.
   */

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize UI manager
   */
  init() {
    this.cacheElements();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    console.log('🎨 UIManager initialized');
  }

  /**
   * Cache frequently used DOM elements
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
      console.error('Missing DOM elements:', missingElements);
    }
  }

  /**
   * Setup basic event listeners for UI elements
   * @private
   */
  setupEventListeners() {
    // Form input change tracking
    const formInputs = [
      'amazonUrl', 'title', 'author', 'imageUrl', 
      'reviewCount', 'targetReviews', 'associateTag'
    ];
    
    formInputs.forEach(inputName => {
      const element = this.elements[inputName];
      if (element) {
        element.addEventListener('input', () => this.onFormChange());
        element.addEventListener('blur', () => this.validateField(inputName));
      }
    });
    
    // Checkbox change tracking
    if (this.elements.associateEnabled) {
      this.elements.associateEnabled.addEventListener('change', () => this.onFormChange());
    }
    
    // Auto-resize text areas (if any)
    this.setupAutoResize();
  }

  /**
   * Setup keyboard shortcuts
   * @private
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.triggerSave();
      }
      
      // Ctrl/Cmd + Enter to share to X
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.triggerShareToX();
      }
      
      // Escape to clear form
      if (e.key === 'Escape') {
        this.triggerClear();
      }
    });
  }

  /**
   * Setup auto-resize for text areas
   * @private
   */
  setupAutoResize() {
    const textAreas = document.querySelectorAll('textarea');
    textAreas.forEach(textarea => {
      textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
      });
    });
  }

  // ============================================================================
  // FORM DATA MANAGEMENT
  // ============================================================================

  /**
   * Get form data from UI elements
   * @returns {Object} Form data
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
      this.elements.associateEnabled.checked = data.associateEnabled || false;
    }
    
    // Clear any existing validation errors
    this.clearValidationErrors();
    
    // Mark as clean
    this.setDirty(false);
    
    console.log('📝 Form data populated');
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
    console.log('🧹 Form cleared');
  }

  // ============================================================================
  // TOAST HELPERS
  // ============================================================================

  showSuccess(message, options = {}) {
    try { this.toastService?.success(message, options); } catch (e) { console.warn('toast failed', e); }
  }
  showError(message, options = {}) {
    try { this.toastService?.error(message, options); } catch (e) { console.warn('toast failed', e); }
  }
  showInfo(message, options = {}) {
    try { this.toastService?.info(message, options); } catch (e) { console.warn('toast failed', e); }
  }
  showWarning(message, options = {}) {
    try { this.toastService?.warning(message, options); } catch (e) { console.warn('toast failed', e); }
  }

  // ============================================================================
  // INPUT HANDLING UTILITIES
  // ============================================================================

  /**
   * Get input value safely
   * @private
   * @param {string} inputName - Input element name
   * @returns {string} Input value
   */
  getInputValue(inputName) {
    const element = this.elements[inputName];
    return element ? element.value.trim() : '';
  }

  /**
   * Set input value safely
   * @private
   * @param {string} inputName - Input element name
   * @param {any} value - Value to set
   */
  setInputValue(inputName, value) {
    const element = this.elements[inputName];
    if (element) {
      element.value = value || '';
    }
  }

  // ============================================================================
  // VALIDATION AND ERROR HANDLING
  // ============================================================================

  /**
   * Display validation errors
   * @param {Array} errors - Array of error objects
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
   * @private
   * @param {string} fieldName - Field name
   * @param {string} message - Error message
   */
  showFieldError(fieldName, message) {
    const element = this.elements[fieldName];
    if (!element) return;
    
    // Add error class to input
    element.classList.add('error');
    
    // Create or update error message element
    let errorElement = document.getElementById(`${fieldName}-error`);
    if (!errorElement) {
      errorElement = document.createElement('div');
      errorElement.id = `${fieldName}-error`;
      errorElement.className = 'field-error';
      element.parentNode.appendChild(errorElement);
    }
    
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Store in state
    this.state.validationErrors[fieldName] = message;
  }

  /**
   * Clear error for specific field
   * @private
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
    
    delete this.state.validationErrors[fieldName];
  }

  /**
   * Clear all validation errors
   */
  clearValidationErrors() {
    Object.keys(this.state.validationErrors).forEach(fieldName => {
      this.clearFieldError(fieldName);
    });
    this.state.validationErrors = {};
  }

  /**
   * Validate individual field (called on blur)
   * @private
   * @param {string} fieldName - Field name to validate
   */
  validateField(fieldName) {
    // This will be implemented when connected to the model
    console.log(`Validating field: ${fieldName}`);
  }

  // ============================================================================
  // LOADING STATES AND PROGRESS
  // ============================================================================

  /**
   * Set loading state for the entire form
   * @param {boolean} loading - Whether form is loading
   * @param {string} message - Optional loading message
   */
  setLoading(loading, message = 'Loading...') {
    this.state.isLoading = loading;
    
    // Disable/enable form elements
    this.setFormEnabled(!loading);
    
    if (loading) {
      this.showLoadingIndicator(message);
    } else {
      this.hideLoadingIndicator();
    }
  }

  /**
   * Set loading state for specific button
   * @param {string} buttonName - Button element name
   * @param {boolean} loading - Whether button is loading
   * @param {string} loadingText - Text to show while loading
   */
  setButtonLoading(buttonName, loading, loadingText = 'Loading...') {
    const button = this.elements[buttonName];
    if (!button) return;
    
    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
      button.classList.add('loading');
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
      button.classList.remove('loading');
    }
  }

  /**
   * Show loading indicator
   * @private
   * @param {string} message - Loading message
   */
  showLoadingIndicator(message) {
    let indicator = document.getElementById('loading-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'loading-indicator';
      indicator.className = 'loading-indicator';
      document.body.appendChild(indicator);
    }
    
    indicator.innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <div class="loading-message">${message}</div>
      </div>
    `;
    indicator.style.display = 'flex';
  }

  /**
   * Hide loading indicator
   * @private
   */
  hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  // ============================================================================
  // FORM STATE MANAGEMENT
  // ============================================================================

  /**
   * Enable/disable form elements
   * @param {boolean} enabled - Whether form should be enabled
   */
  setFormEnabled(enabled) {
    const formElements = [
      'amazonUrl', 'title', 'author', 'imageUrl', 
      'reviewCount', 'targetReviews', 'associateTag', 'associateEnabled'
    ];
    
    formElements.forEach(elementName => {
      const element = this.elements[elementName];
      if (element) {
        element.disabled = !enabled;
      }
    });
    
    this.state.formLocked = !enabled;
  }

  /**
   * Set dirty state (unsaved changes)
   * @param {boolean} dirty - Whether form has unsaved changes
   */
  setDirty(dirty) {
    this.state.isDirty = dirty;
    
    // Visual indicator for unsaved changes
    const saveBtn = this.elements.saveBtn;
    if (saveBtn) {
      // Keep the original label without emojis/asterisks
      const originalLabel = '保存';
      if (dirty) {
        saveBtn.classList.add('highlight');
        saveBtn.textContent = originalLabel;
      } else {
        saveBtn.classList.remove('highlight');
        saveBtn.textContent = originalLabel;
      }
    }
  }

  /**
   * Handle form change event
   * @private
   */
  onFormChange() {
    this.setDirty(true);
    this.clearValidationErrors(); // Clear errors on change
  }

  // ============================================================================
  // PROGRESS DISPLAY
  // ============================================================================

  /**
   * Update progress display based on book data
   * @param {Object} progressData - Progress information
   */
  updateProgressDisplay(progressData) {
    const {
      currentReviews,
      targetReviews,
      progressPercentage,
      remainingReviews,
      isGoalAchieved
    } = progressData;
    
    // Create or update progress section
    let progressSection = document.getElementById('progress-section');
    if (!progressSection && targetReviews) {
      progressSection = this.createProgressSection();
    }
    
    if (!progressSection) return;
    
    if (targetReviews && targetReviews > 0) {
      // Show progress
      progressSection.style.display = 'block';
      
      const progressBar = progressSection.querySelector('.progress-bar-fill');
      const progressText = progressSection.querySelector('.progress-text');
      const remainingText = progressSection.querySelector('.remaining-text');
      
      if (progressBar) {
        progressBar.style.width = `${progressPercentage}%`;
        progressBar.className = `progress-bar-fill ${isGoalAchieved ? 'completed' : ''}`;
      }
      
      if (progressText) {
        progressText.textContent = `${currentReviews} / ${targetReviews} reviews (${progressPercentage}%)`;
      }
      
      if (remainingText) {
        if (isGoalAchieved) {
          remainingText.textContent = '🎉 目標達成！';
          remainingText.className = 'remaining-text completed';
        } else {
          remainingText.textContent = `あと${remainingReviews}レビューで目標達成`;
          remainingText.className = 'remaining-text';
        }
      }
    } else {
      // Hide progress
      progressSection.style.display = 'none';
    }
  }

  /**
   * Create progress section HTML
   * @private
   * @returns {HTMLElement} Progress section element
   */
  createProgressSection() {
    const progressHTML = `
      <div id="progress-section" class="progress-section">
        <div class="progress-header">
          <span class="progress-text">0 / 0 reviews (0%)</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width: 0%"></div>
        </div>
        <div class="remaining-text">目標を設定してください</div>
      </div>
    `;
    
    // Insert after target reviews input
    const targetInput = this.elements.targetReviews;
    if (targetInput && targetInput.parentNode) {
      const progressSection = document.createElement('div');
      progressSection.innerHTML = progressHTML;
      targetInput.parentNode.insertAdjacentElement('afterend', progressSection.firstElementChild);
      return document.getElementById('progress-section');
    }
    
    return null;
  }

  // ============================================================================
  // EVENT TRIGGERS (to be connected to controller)
  // ============================================================================

  /**
   * Trigger save action
   */
  triggerSave() {
    console.log('🔄 Save triggered via UI');
    // This will be connected to controller
  }

  /**
   * Trigger share to X action
   */
  triggerShareToX() {
    console.log('🔄 Share to X triggered via UI');
    // This will be connected to controller
  }

  /**
   * Trigger clear action
   */
  triggerClear() {
    console.log('🔄 Clear triggered via UI');
    // This will be connected to controller
  }

  /**
   * Trigger Amazon fetch action
   */
  triggerAmazonFetch() {
    console.log('🔄 Amazon fetch triggered via UI');
    // This will be connected to controller
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Scroll to element smoothly
   * @param {string} elementId - Element ID to scroll to
   */
  scrollToElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Focus on specific input field
   * @param {string} fieldName - Field name to focus
   */
  focusField(fieldName) {
    const element = this.elements[fieldName];
    if (element) {
      element.focus();
      if (element.select) {
        element.select();
      }
    }
  }

  /**
   * Get current UI state
   * @returns {Object} Current UI state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Check if form has unsaved changes
   * @returns {boolean} Whether form is dirty
   */
  isDirty() {
    return this.state.isDirty;
  }

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    this.toastService.show(message, 'success');
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    this.toastService.show(message, 'error');
  }

  /**
   * Show info message
   * @param {string} message - Info message
   */
  showInfo(message) {
    this.toastService.show(message, 'info');
  }
}
