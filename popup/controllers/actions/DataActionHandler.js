/**
 * DataActionHandler - Data management and form operations
 * Extracted from ActionHandler.js - handles data persistence and form management
 * 
 * Responsibilities:
 * - Data saving and loading operations
 * - Form data validation and management
 * - Data clearing and reset operations
 * - UI state synchronization with data model
 */

export default class DataActionHandler {
  constructor(bookModel, uiManager, stateManager) {
    this.bookModel = bookModel;
    this.uiManager = uiManager;
    this.stateManager = stateManager;
  }

  /**
   * Handle data save operation with validation
   * @param {boolean} silent - Whether to show success/error messages
   * @returns {Promise<boolean>} Save success status
   */
  async handleSave(silent = false) {
    try {
      // Get form data and update model
      const formData = this.uiManager.getFormData();
      const validationResult = this.bookModel.setData(formData, true);
      
      if (!validationResult.isValid) {
        this.uiManager.displayValidationErrors(validationResult.errors);
        return false;
      }
      
      // Save to storage
      const saveResult = await this.bookModel.save();
      
      if (saveResult) {
        this.stateManager.recordSaveTime();
        this.uiManager.setDirty(false);
        
        if (!silent) {
          this.uiManager.showSuccess('データを保存しました');
        }
        
        console.log('DataActionHandler: Data saved successfully');
        return true;
      } else {
        if (!silent) {
          this.uiManager.showError('データの保存に失敗しました');
        }
        return false;
      }
      
    } catch (error) {
      console.error('DataActionHandler: Save failed:', error);
      if (!silent) {
        this.uiManager.showError('保存中にエラーが発生しました');
      }
      return false;
    }
  }

  /**
   * Handle data clear operation with confirmation
   */
  async handleClear() {
    // Confirm if there are unsaved changes
    if (this.uiManager.isDirty()) {
      const confirmed = confirm('未保存の変更があります。本当にクリアしますか？');
      if (!confirmed) {
        return;
      }
    }
    
    try {
      // Clear model data
      await this.bookModel.clear();
      
      // Clear UI form
      this.uiManager.clearForm();
      
      // Update progress display
      this.updateProgressDisplay();
      
      this.uiManager.showSuccess('データをクリアしました');
      console.log('DataActionHandler: Data cleared');
      
    } catch (error) {
      console.error('DataActionHandler: Clear failed:', error);
      this.uiManager.showError('クリア中にエラーが発生しました');
    }
  }

  /**
   * Handle form change events and update model
   */
  handleFormChange() {
    // Update model with current form data (without validation)
    const formData = this.uiManager.getFormData();
    this.bookModel.setData(formData, false);
    
    // Mark as dirty
    this.uiManager.setDirty(true);
    
    // Clear validation errors on change
    this.uiManager.clearValidationErrors();
    
    // Update progress display if target reviews changed
    if (formData.targetReviews !== undefined) {
      this.updateProgressDisplay();
    }
  }

  /**
   * Validate specific field
   * @param {string} fieldName - Field name to validate
   * @returns {boolean} Validation result
   */
  validateField(fieldName) {
    return this.uiManager.validateField(fieldName);
  }

  /**
   * Clear field error
   * @param {string} fieldName - Field name to clear error for
   */
  clearFieldError(fieldName) {
    this.uiManager.clearFieldError(fieldName);
  }

  /**
   * Auto-save current data silently
   * @returns {Promise<boolean>} Save success status
   */
  async autoSave() {
    return this.handleSave(true);
  }

  /**
   * Load saved data and populate form
   */
  async loadSavedData() {
    try {
      const loaded = await this.bookModel.load();
      if (loaded) {
        this.uiManager.setFormData(this.bookModel.getData());
        this.updateProgressDisplay();
        this.uiManager.setDirty(false);
        console.log('DataActionHandler: Data loaded successfully');
      }
    } catch (error) {
      console.error('DataActionHandler: Load failed:', error);
    }
  }

  /**
   * Update progress display with current data
   * @private
   */
  updateProgressDisplay() {
    const progressData = {
      percentage: this.bookModel.getProgressPercentage(),
      remaining: this.bookModel.getRemainingReviews(),
      achieved: this.bookModel.isGoalAchieved(),
      current: this.bookModel.getData().currentReviews,
      target: this.bookModel.getData().targetReviews
    };
    
    if (this.uiManager.updateProgressDisplay) {
      this.uiManager.updateProgressDisplay(progressData);
    }
  }

  /**
   * Check if current data is valid for operations
   * @returns {boolean} Whether data is valid
   */
  isDataValid() {
    const validationResult = this.bookModel.validateData(this.bookModel.getData());
    return validationResult.isValid;
  }

  /**
   * Get current data state summary
   * @returns {Object} Data state summary
   */
  getDataState() {
    return {
      hasData: this.bookModel.isComplete(),
      isValid: this.isDataValid(),
      isDirty: this.uiManager.isDirty(),
      lastSaved: this.stateManager.getLastSaveTime(),
      canSave: this.uiManager.isDirty() && this.isDataValid()
    };
  }

  /**
   * Force form data sync with model
   */
  syncFormWithModel() {
    const modelData = this.bookModel.getData();
    this.uiManager.setFormData(modelData);
    this.updateProgressDisplay();
  }

  /**
   * Reset form to last saved state
   */
  async resetToSaved() {
    if (this.uiManager.isDirty()) {
      const confirmed = confirm('未保存の変更を破棄して、最後に保存した状態に戻しますか？');
      if (!confirmed) {
        return false;
      }
    }
    
    await this.loadSavedData();
    return true;
  }
}