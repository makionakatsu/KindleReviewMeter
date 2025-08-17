/**
 * Event Handler Management Service
 * 
 * Extracted from PopupController.js for better separation of concerns
 * 
 * Responsibilities:
 * - Setup and manage all UI event listeners
 * - Handle form change events and user interactions
 * - Coordinate button clicks with appropriate handlers
 * - Manage event delegation and cleanup
 * - Handle keyboard shortcuts and accessibility events
 * 
 * This service focuses exclusively on event management,
 * improving maintainability and making event handling more testable.
 */

export default class EventHandlerManager {
  constructor(actionHandler, elements) {
    this.actionHandler = actionHandler;
    this.elements = elements;
    this.eventListeners = new Map(); // Track listeners for cleanup
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    this.setupButtonListeners();
    this.setupFormChangeListeners();
    this.setupKeyboardShortcuts();
    this.setupAccessibilityEvents();
    
    console.log('EventHandlerManager: All event listeners setup complete');
  }

  /**
   * Setup button event listeners
   * @private
   */
  setupButtonListeners() {
    const buttonConfigs = [
      {
        id: 'fetchAmazonBtn',
        handler: () => this.actionHandler.handleAmazonFetch(),
        description: 'Amazon fetch button'
      },
      {
        id: 'saveBtn', 
        handler: () => this.actionHandler.handleSave(),
        description: 'Save button'
      },
      {
        id: 'shareToXBtn',
        handler: () => this.actionHandler.handleShareToX(),
        description: 'Share to X button'
      },
      {
        id: 'exportBtn',
        handler: () => this.actionHandler.handleImageExport(),
        description: 'Export image button'
      },
      {
        id: 'clearBtn',
        handler: () => this.actionHandler.handleClear(),
        description: 'Clear button'
      }
    ];

    buttonConfigs.forEach(config => {
      const button = document.getElementById(config.id);
      if (button) {
        const listener = config.handler;
        button.addEventListener('click', listener);
        this.eventListeners.set(`${config.id}-click`, { element: button, event: 'click', listener });
        console.log(`EventHandlerManager: ${config.description} listener attached`);
      } else {
        console.warn(`EventHandlerManager: Button '${config.id}' not found`);
      }
    });
  }

  /**
   * Setup form change listeners
   * @private
   */
  setupFormChangeListeners() {
    const formElements = [
      'amazonUrl', 'title', 'author', 'imageUrl',
      'reviewCount', 'targetReviews', 'associateTag', 'associateEnabled'
    ];
    
    formElements.forEach(elementName => {
      const element = document.getElementById(elementName);
      if (element) {
        // General form change handlers
        const inputListener = () => this.actionHandler.handleFormChange();
        const changeListener = () => this.actionHandler.handleFormChange();
        
        element.addEventListener('input', inputListener);
        element.addEventListener('change', changeListener);
        
        this.eventListeners.set(`${elementName}-input`, { 
          element, event: 'input', listener: inputListener 
        });
        this.eventListeners.set(`${elementName}-change`, { 
          element, event: 'change', listener: changeListener 
        });
      } else {
        console.warn(`EventHandlerManager: Form element '${elementName}' not found`);
      }
    });
    
    // Special handling for progress-related fields
    this.setupProgressUpdateListeners();
    
    console.log(`EventHandlerManager: Form change listeners setup for ${formElements.length} elements`);
  }

  /**
   * Setup special listeners for progress display updates
   * @private
   */
  setupProgressUpdateListeners() {
    const progressElements = ['targetReviews', 'reviewCount'];
    
    progressElements.forEach(elementName => {
      const element = document.getElementById(elementName);
      if (element) {
        const progressListener = () => this.actionHandler.updateProgressDisplay();
        element.addEventListener('input', progressListener);
        
        this.eventListeners.set(`${elementName}-progress`, {
          element, event: 'input', listener: progressListener
        });
      }
    });
  }

  /**
   * Setup keyboard shortcuts for better UX
   * @private
   */
  setupKeyboardShortcuts() {
    const keyboardListener = (e) => {
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.actionHandler.handleSave();
      }
      
      // Ctrl/Cmd + Enter to share to X
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.actionHandler.handleShareToX();
      }
      
      // Escape to clear form (with confirmation)
      if (e.key === 'Escape') {
        this.actionHandler.handleClear();
      }
      
      // F5 to refresh data
      if (e.key === 'F5') {
        e.preventDefault();
        this.actionHandler.refresh();
      }
    };

    document.addEventListener('keydown', keyboardListener);
    this.eventListeners.set('document-keydown', {
      element: document, event: 'keydown', listener: keyboardListener
    });
    
    console.log('EventHandlerManager: Keyboard shortcuts setup complete');
  }

  /**
   * Setup accessibility and focus management events
   * @private
   */
  setupAccessibilityEvents() {
    // Form validation on blur
    const formFields = ['amazonUrl', 'title', 'author', 'reviewCount', 'targetReviews', 'associateTag'];
    
    formFields.forEach(fieldName => {
      const element = document.getElementById(fieldName);
      if (element) {
        const blurListener = () => {
          // Trigger validation on blur for better UX
          this.actionHandler.validateField(fieldName);
        };
        
        element.addEventListener('blur', blurListener);
        this.eventListeners.set(`${fieldName}-blur`, {
          element, event: 'blur', listener: blurListener
        });
      }
    });

    // Focus management for better navigation
    this.setupFocusManagement();
    
    console.log('EventHandlerManager: Accessibility events setup complete');
  }

  /**
   * Setup focus management for better navigation
   * @private
   */
  setupFocusManagement() {
    // Auto-focus on Amazon URL field when popup opens
    const amazonUrlField = document.getElementById('amazonUrl');
    if (amazonUrlField && !amazonUrlField.value.trim()) {
      setTimeout(() => amazonUrlField.focus(), 100);
    }

    // Tab navigation optimization
    const tabListener = (e) => {
      if (e.key === 'Tab') {
        // Custom tab handling if needed
        this.handleTabNavigation(e);
      }
    };

    document.addEventListener('keydown', tabListener);
    this.eventListeners.set('document-tab', {
      element: document, event: 'keydown', listener: tabListener
    });
  }

  /**
   * Handle tab navigation optimization
   * @private
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleTabNavigation(e) {
    // Skip disabled fields during tab navigation
    const focusableElements = Array.from(document.querySelectorAll(
      'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    ));

    const currentIndex = focusableElements.indexOf(document.activeElement);
    
    if (currentIndex !== -1) {
      let nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
      
      // Wrap around
      if (nextIndex >= focusableElements.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = focusableElements.length - 1;
      
      const nextElement = focusableElements[nextIndex];
      if (nextElement && !nextElement.disabled) {
        e.preventDefault();
        nextElement.focus();
      }
    }
  }

  /**
   * Setup form validation events
   */
  setupValidationEvents() {
    const formElements = [
      'amazonUrl', 'title', 'author', 'reviewCount', 'targetReviews', 'associateTag'
    ];

    formElements.forEach(elementName => {
      const element = document.getElementById(elementName);
      if (element) {
        // Clear validation errors on input
        const inputListener = () => {
          this.actionHandler.clearFieldError(elementName);
        };
        
        element.addEventListener('input', inputListener);
        this.eventListeners.set(`${elementName}-validation-clear`, {
          element, event: 'input', listener: inputListener
        });
      }
    });

    console.log('EventHandlerManager: Validation events setup complete');
  }

  /**
   * Handle form submission (Enter key in fields)
   */
  setupFormSubmissionEvents() {
    const formElements = document.querySelectorAll('input, textarea');
    
    formElements.forEach(element => {
      const enterListener = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          // Determine appropriate action based on current context
          if (element.id === 'amazonUrl') {
            e.preventDefault();
            this.actionHandler.handleAmazonFetch();
          } else {
            // General form submission
            e.preventDefault();
            this.actionHandler.handleSave();
          }
        }
      };

      element.addEventListener('keydown', enterListener);
      this.eventListeners.set(`${element.id}-enter`, {
        element, event: 'keydown', listener: enterListener
      });
    });

    console.log('EventHandlerManager: Form submission events setup complete');
  }

  /**
   * Remove all event listeners (cleanup)
   */
  removeAllEventListeners() {
    this.eventListeners.forEach((listenerInfo, key) => {
      try {
        listenerInfo.element.removeEventListener(listenerInfo.event, listenerInfo.listener);
      } catch (error) {
        console.warn(`EventHandlerManager: Failed to remove listener ${key}:`, error);
      }
    });
    
    this.eventListeners.clear();
    console.log('EventHandlerManager: All event listeners removed');
  }

  /**
   * Get active event listener count
   * @returns {number} Number of active listeners
   */
  getActiveListenerCount() {
    return this.eventListeners.size;
  }

  /**
   * Check if specific event listener exists
   * @param {string} key - Event listener key
   * @returns {boolean} True if listener exists
   */
  hasEventListener(key) {
    return this.eventListeners.has(key);
  }

  /**
   * Re-setup events after DOM changes
   */
  refreshEventListeners() {
    console.log('EventHandlerManager: Refreshing event listeners');
    this.removeAllEventListeners();
    this.setupEventListeners();
  }

  /**
   * Enable/disable all form event listeners
   * @param {boolean} enabled - Whether to enable listeners
   */
  setEventListenersEnabled(enabled) {
    if (enabled) {
      this.setupEventListeners();
    } else {
      this.removeAllEventListeners();
    }
    
    console.log(`EventHandlerManager: Event listeners ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get event listener statistics
   * @returns {Object} Event listener statistics
   */
  getEventStats() {
    const stats = {
      totalListeners: this.eventListeners.size,
      buttonListeners: 0,
      formListeners: 0,
      keyboardListeners: 0,
      validationListeners: 0
    };

    this.eventListeners.forEach((listenerInfo, key) => {
      if (key.includes('-click')) stats.buttonListeners++;
      else if (key.includes('-input') || key.includes('-change')) stats.formListeners++;
      else if (key.includes('keydown')) stats.keyboardListeners++;
      else if (key.includes('validation') || key.includes('blur')) stats.validationListeners++;
    });

    return stats;
  }
}