/**
 * UI State Management Service
 * 
 * Extracted from UIManager.js for better separation of concerns
 * 
 * Responsibilities:
 * - Manage keyboard shortcuts and accessibility features
 * - Handle UI state changes (dirty state, form changes)
 * - Setup auto-resize functionality for text areas
 * - Manage progress display updates
 * - Provide UI utility functions and helpers
 * 
 * This service focuses on UI state management and interaction enhancements,
 * providing a better user experience through keyboard shortcuts and
 * responsive UI behavior.
 */

export class UIStateManager {
  constructor(elements, toastService) {
    this.elements = elements;
    this.toastService = toastService;
    this.state = {
      isDirty: false,
      formLocked: false
    };
  }

  /**
   * Setup keyboard shortcuts for better UX
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
      
      // F1 for help (prevent default browser help)
      if (e.key === 'F1') {
        e.preventDefault();
        this.showKeyboardShortcuts();
      }
    });
    
    console.log('UIStateManager: Keyboard shortcuts setup completed');
  }

  /**
   * Setup auto-resize for text areas
   */
  setupAutoResize() {
    const textAreas = document.querySelectorAll('textarea');
    textAreas.forEach(textarea => {
      textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
      });
    });
    
    console.log(`UIStateManager: Auto-resize setup for ${textAreas.length} text areas`);
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
      const originalLabel = '保存';
      if (dirty) {
        saveBtn.classList.add('highlight');
        saveBtn.textContent = originalLabel;
      } else {
        saveBtn.classList.remove('highlight');
        saveBtn.textContent = originalLabel;
      }
    }
    
    // Update page title to indicate unsaved changes
    if (dirty) {
      if (!document.title.startsWith('* ')) {
        document.title = '* ' + document.title;
      }
    } else {
      document.title = document.title.replace(/^\* /, '');
    }
    
    console.log(`UIStateManager: Dirty state set to ${dirty}`);
  }

  /**
   * Handle form change event
   */
  onFormChange() {
    this.setDirty(true);
    // Emit custom event for other components to listen
    window.dispatchEvent(new CustomEvent('formChanged', { 
      detail: { isDirty: true } 
    }));
  }

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
    
    if (progressSection && targetReviews) {
      this.updateProgressContent(progressSection, progressData);
    } else if (progressSection && !targetReviews) {
      // Remove progress section if no target set
      progressSection.remove();
    }
  }

  /**
   * Create progress section HTML
   * @private
   */
  createProgressSection() {
    const progressSection = document.createElement('div');
    progressSection.id = 'progress-section';
    progressSection.className = 'progress-section';
    progressSection.style.cssText = `
      margin: 16px 0;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 6px;
      border-left: 4px solid #3498db;
    `;
    
    // Insert after target reviews field
    const targetField = this.elements.targetReviews?.parentNode;
    if (targetField && targetField.parentNode) {
      targetField.parentNode.insertBefore(progressSection, targetField.nextSibling);
    }
    
    return progressSection;
  }

  /**
   * Update progress section content
   * @private
   */
  updateProgressContent(progressSection, progressData) {
    const {
      currentReviews,
      targetReviews,
      progressPercentage,
      remainingReviews,
      isGoalAchieved
    } = progressData;
    
    const statusEmoji = isGoalAchieved ? '🎉' : '📈';
    const statusText = isGoalAchieved ? '目標達成！' : `あと${remainingReviews}件`;
    const statusColor = isGoalAchieved ? '#27ae60' : '#3498db';
    
    progressSection.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 500; color: #2c3e50;">進捗状況</span>
        <span style="color: ${statusColor}; font-weight: 500;">${statusEmoji} ${statusText}</span>
      </div>
      <div style="background: #ecf0f1; border-radius: 10px; height: 8px; overflow: hidden; margin-bottom: 8px;">
        <div style="background: ${statusColor}; height: 100%; width: ${progressPercentage}%; transition: width 0.3s ease;"></div>
      </div>
      <div style="font-size: 12px; color: #7f8c8d;">
        ${currentReviews} / ${targetReviews} レビュー (${progressPercentage.toFixed(1)}%)
      </div>
    `;
  }

  /**
   * Trigger save action (delegate to controller)
   */
  triggerSave() {
    const saveBtn = this.elements.saveBtn;
    if (saveBtn && !saveBtn.disabled) {
      saveBtn.click();
    } else {
      this.toastService?.show('保存できません', 'warning');
    }
  }

  /**
   * Trigger share to X action (delegate to controller)
   */
  triggerShareToX() {
    const shareBtn = this.elements.shareToXBtn;
    if (shareBtn && !shareBtn.disabled) {
      shareBtn.click();
    } else {
      this.toastService?.show('共有できません', 'warning');
    }
  }

  /**
   * Trigger clear action (delegate to controller)
   */
  triggerClear() {
    const clearBtn = this.elements.clearBtn;
    if (clearBtn && !clearBtn.disabled) {
      clearBtn.click();
    }
  }

  /**
   * Show keyboard shortcuts help
   */
  showKeyboardShortcuts() {
    const shortcuts = [
      'Ctrl/Cmd + S: 保存',
      'Ctrl/Cmd + Enter: X に共有',
      'Escape: フォームクリア',
      'F1: このヘルプ'
    ];
    
    if (this.toastService) {
      this.toastService.show(
        'キーボードショートカット:\n' + shortcuts.join('\n'),
        'info',
        { duration: 5000 }
      );
    }
  }

  /**
   * Scroll to specific element
   * @param {string} elementId - Element ID to scroll to
   */
  scrollToElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  }

  /**
   * Focus specific field
   * @param {string} fieldName - Field name to focus
   */
  focusField(fieldName) {
    const element = this.elements[fieldName];
    if (element && element.focus) {
      element.focus();
      
      // Select text if it's an input field
      if (element.select && element.type !== 'checkbox') {
        element.select();
      }
    }
  }

  /**
   * Get current UI state
   * @returns {Object} Current state information
   */
  getState() {
    return {
      ...this.state,
      hasUnsavedChanges: this.state.isDirty,
      isFormLocked: this.state.formLocked
    };
  }

  /**
   * Check if form has unsaved changes
   * @returns {boolean} True if dirty
   */
  isDirty() {
    return this.state.isDirty;
  }

  /**
   * Setup form change listeners
   */
  setupFormChangeListeners() {
    const formElements = [
      'amazonUrl', 'title', 'author', 'imageUrl',
      'reviewCount', 'targetReviews', 'associateTag', 'associateEnabled'
    ];
    
    formElements.forEach(elementName => {
      const element = this.elements[elementName];
      if (element) {
        const eventType = element.type === 'checkbox' ? 'change' : 'input';
        element.addEventListener(eventType, () => {
          this.onFormChange();
        });
      }
    });
    
    console.log('UIStateManager: Form change listeners setup completed');
  }

  /**
   * Reset UI state
   */
  reset() {
    this.setDirty(false);
    this.state.formLocked = false;
    
    // Remove progress section if exists
    const progressSection = document.getElementById('progress-section');
    if (progressSection) {
      progressSection.remove();
    }
    
    console.log('UIStateManager: State reset completed');
  }

  /**
   * Setup responsive behavior
   */
  setupResponsiveBehavior() {
    // Handle window resize
    window.addEventListener('resize', () => {
      this.handleWindowResize();
    });
    
    // Handle visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.state.isDirty) {
        console.log('UIStateManager: Tab became visible with unsaved changes');
      }
    });
  }

  /**
   * Handle window resize
   * @private
   */
  handleWindowResize() {
    // Trigger auto-resize for text areas
    this.setupAutoResize();
    
    // Emit resize event for other components
    window.dispatchEvent(new CustomEvent('uiResize'));
  }
}