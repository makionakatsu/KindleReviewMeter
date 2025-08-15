/**
 * Loading State Management Service
 * 
 * Extracted from UIManager.js for better separation of concerns
 * 
 * Responsibilities:
 * - Manage global and button-specific loading states
 * - Display and hide loading indicators with custom messages
 * - Control form enable/disable state during operations
 * - Provide visual feedback for ongoing operations
 * - Handle loading state persistence and recovery
 * 
 * This service focuses exclusively on loading state management,
 * providing consistent loading experience across the application.
 */

export class LoadingManager {
  constructor(elements) {
    this.elements = elements;
    this.isLoading = false;
    this.buttonStates = new Map();
    this.createLoadingStyles();
  }

  /**
   * Set global loading state
   * @param {boolean} loading - Whether app is loading
   * @param {string} message - Loading message to display
   */
  setLoading(loading, message = 'Loading...') {
    this.isLoading = loading;
    
    // Disable/enable form elements
    this.setFormEnabled(!loading);
    
    if (loading) {
      this.showLoadingIndicator(message);
    } else {
      this.hideLoadingIndicator();
    }
    
    console.log(`LoadingManager: Global loading state set to ${loading}`);
  }

  /**
   * Set loading state for specific button
   * @param {string} buttonName - Button element name
   * @param {boolean} loading - Whether button is loading
   * @param {string} loadingText - Text to show while loading
   */
  setButtonLoading(buttonName, loading, loadingText = 'Loading...') {
    const button = this.elements[buttonName];
    if (!button) {
      console.warn(`LoadingManager: Button '${buttonName}' not found`);
      return;
    }
    
    if (loading) {
      // Store original state
      this.buttonStates.set(buttonName, {
        originalText: button.textContent,
        originalDisabled: button.disabled
      });
      
      button.textContent = loadingText;
      button.disabled = true;
      button.classList.add('loading');
    } else {
      // Restore original state
      const originalState = this.buttonStates.get(buttonName);
      if (originalState) {
        button.textContent = originalState.originalText;
        button.disabled = originalState.originalDisabled;
        this.buttonStates.delete(buttonName);
      }
      button.classList.remove('loading');
    }
    
    console.log(`LoadingManager: Button '${buttonName}' loading state set to ${loading}`);
  }

  /**
   * Show global loading indicator
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
    
    console.log(`LoadingManager: Loading indicator shown with message: ${message}`);
  }

  /**
   * Hide global loading indicator
   * @private
   */
  hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
    
    console.log('LoadingManager: Loading indicator hidden');
  }

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
    
    // Also disable buttons during loading
    const buttonElements = [
      'fetchAmazonBtn', 'saveBtn', 'shareToXBtn', 'exportBtn', 'clearBtn'
    ];
    
    buttonElements.forEach(elementName => {
      const element = this.elements[elementName];
      if (element && !this.buttonStates.has(elementName)) {
        element.disabled = !enabled;
      }
    });
    
    console.log(`LoadingManager: Form enabled state set to ${enabled}`);
  }

  /**
   * Create loading-related CSS styles
   * @private
   */
  createLoadingStyles() {
    const styleId = 'loading-manager-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .loading-indicator {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
      }
      
      .loading-content {
        background: white;
        padding: 24px;
        border-radius: 8px;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        min-width: 200px;
      }
      
      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 12px;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .loading-message {
        font-size: 14px;
        color: #666;
        font-weight: 500;
      }
      
      button.loading {
        position: relative;
        color: transparent;
      }
      
      button.loading::after {
        content: "";
        position: absolute;
        width: 16px;
        height: 16px;
        top: 50%;
        left: 50%;
        margin-left: -8px;
        margin-top: -8px;
        border: 2px solid #ffffff;
        border-radius: 50%;
        border-top-color: transparent;
        animation: spin 1s linear infinite;
      }
      
      .highlight {
        background-color: #3498db !important;
        color: white !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Get current loading state
   * @returns {Object} Current loading state information
   */
  getLoadingState() {
    return {
      isGlobalLoading: this.isLoading,
      loadingButtons: Array.from(this.buttonStates.keys()),
      buttonCount: this.buttonStates.size
    };
  }

  /**
   * Check if any loading operation is active
   * @returns {boolean} True if any loading is active
   */
  isAnyLoading() {
    return this.isLoading || this.buttonStates.size > 0;
  }

  /**
   * Clear all loading states (emergency reset)
   */
  clearAllLoading() {
    // Clear global loading
    this.setLoading(false);
    
    // Clear all button loading states
    const loadingButtons = Array.from(this.buttonStates.keys());
    loadingButtons.forEach(buttonName => {
      this.setButtonLoading(buttonName, false);
    });
    
    console.log('LoadingManager: All loading states cleared');
  }

  /**
   * Set loading with timeout (auto-clear after specified time)
   * @param {boolean} loading - Loading state
   * @param {string} message - Loading message
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {number} Timeout ID for cancellation
   */
  setLoadingWithTimeout(loading, message = 'Loading...', timeoutMs = 30000) {
    this.setLoading(loading, message);
    
    if (loading && timeoutMs > 0) {
      return setTimeout(() => {
        console.warn('LoadingManager: Loading timeout reached, clearing loading state');
        this.setLoading(false);
      }, timeoutMs);
    }
    
    return null;
  }

  /**
   * Set button loading with timeout
   * @param {string} buttonName - Button name
   * @param {boolean} loading - Loading state
   * @param {string} loadingText - Loading text
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {number} Timeout ID for cancellation
   */
  setButtonLoadingWithTimeout(buttonName, loading, loadingText = 'Loading...', timeoutMs = 30000) {
    this.setButtonLoading(buttonName, loading, loadingText);
    
    if (loading && timeoutMs > 0) {
      return setTimeout(() => {
        console.warn(`LoadingManager: Button '${buttonName}' loading timeout reached`);
        this.setButtonLoading(buttonName, false);
      }, timeoutMs);
    }
    
    return null;
  }
}