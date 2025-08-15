/**
 * ErrorHandler - Centralized Error Management
 * 
 * Responsibilities:
 * - Provide consistent error handling across all services
 * - Categorize and prioritize different error types
 * - Generate user-friendly error messages
 * - Log detailed error information for debugging
 * - Track error patterns and frequency
 */

class ErrorHandler {
  constructor() {
    this.errorTypes = {
      AMAZON_FETCH: 'AMAZON_FETCH',
      IMAGE_GENERATION: 'IMAGE_GENERATION',
      X_SHARING: 'X_SHARING',
      STORAGE: 'STORAGE',
      NETWORK: 'NETWORK',
      VALIDATION: 'VALIDATION',
      PERMISSION: 'PERMISSION',
      CONTENT_SCRIPT: 'CONTENT_SCRIPT',
      UNKNOWN: 'UNKNOWN'
    };

    this.errorCounts = new Map();
    this.recentErrors = [];
    this.maxRecentErrors = 100;
  }
  /**
   * Notes:
   * - Produces user-friendly messages; do not leak low-level details to users.
   * - Prefer typed helpers (handleAmazonFetchError, handleXSharingError, etc.).
   */

  /**
   * Handle an error with proper categorization and logging
   * @param {Error|string} error - The error to handle
   * @param {string} type - Error type from this.errorTypes
   * @param {Object} context - Additional context information
   * @returns {Object} Processed error information
   */
  handle(error, type = this.errorTypes.UNKNOWN, context = {}) {
    // Normalize error to Error object
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Create error info object
    const errorInfo = {
      type,
      message: errorObj.message,
      stack: errorObj.stack,
      timestamp: new Date().toISOString(),
      context,
      userMessage: this.getUserFriendlyMessage(type, errorObj.message),
      id: this.generateErrorId()
    };

    // Track error frequency
    this.trackError(type);

    // Add to recent errors
    this.addToRecentErrors(errorInfo);

    // Log error with appropriate level
    this.logError(errorInfo);

    // Check for notification requirements
    this.checkNotificationTriggers(errorInfo);

    return errorInfo;
  }

  /**
   * Handle Amazon data fetch errors
   * @param {Error} error - The error
   * @param {Object} context - Context (url, proxy, attempt, etc.)
   */
  handleAmazonFetchError(error, context = {}) {
    const enhancedContext = {
      ...context,
      operation: 'amazon_data_fetch'
    };

    // Categorize Amazon-specific errors
    if (error.message.includes('CORS')) {
      enhancedContext.subtype = 'cors_error';
    } else if (error.message.includes('timeout')) {
      enhancedContext.subtype = 'timeout_error';
    } else if (error.message.includes('404') || error.message.includes('not found')) {
      enhancedContext.subtype = 'not_found_error';
    } else if (error.message.includes('rate limit') || error.message.includes('429')) {
      enhancedContext.subtype = 'rate_limit_error';
    }

    return this.handle(error, this.errorTypes.AMAZON_FETCH, enhancedContext);
  }

  /**
   * Handle image generation errors
   * @param {Error} error - The error
   * @param {Object} context - Context (tabId, data, etc.)
   */
  handleImageGenerationError(error, context = {}) {
    const enhancedContext = {
      ...context,
      operation: 'image_generation'
    };

    return this.handle(error, this.errorTypes.IMAGE_GENERATION, enhancedContext);
  }

  /**
   * Handle X/Twitter sharing errors
   * @param {Error} error - The error
   * @param {Object} context - Context (tabId, attachment method, etc.)
   */
  handleXSharingError(error, context = {}) {
    const enhancedContext = {
      ...context,
      operation: 'x_sharing'
    };

    // Categorize X sharing specific errors
    if (error.message.includes('message channel closed')) {
      enhancedContext.subtype = 'channel_closed';
    } else if (error.message.includes('Content script')) {
      enhancedContext.subtype = 'content_script_error';
    } else if (error.message.includes('Tab was closed')) {
      enhancedContext.subtype = 'tab_closed';
    }

    return this.handle(error, this.errorTypes.X_SHARING, enhancedContext);
  }

  /**
   * Handle content script errors
   * @param {Error} error - The error
   * @param {Object} context - Context (url, action, etc.)
   */
  handleContentScriptError(error, context = {}) {
    const enhancedContext = {
      ...context,
      operation: 'content_script'
    };

    return this.handle(error, this.errorTypes.CONTENT_SCRIPT, enhancedContext);
  }

  /**
   * Handle storage errors
   * @param {Error} error - The error
   * @param {Object} context - Context (operation, key, etc.)
   */
  handleStorageError(error, context = {}) {
    const enhancedContext = {
      ...context,
      operation: 'storage'
    };

    return this.handle(error, this.errorTypes.STORAGE, enhancedContext);
  }

  /**
   * Handle network errors
   * @param {Error} error - The error
   * @param {Object} context - Context (url, method, etc.)
   */
  handleNetworkError(error, context = {}) {
    const enhancedContext = {
      ...context,
      operation: 'network'
    };

    return this.handle(error, this.errorTypes.NETWORK, enhancedContext);
  }

  /**
   * Handle validation errors
   * @param {Error} error - The error
   * @param {Object} context - Context (field, value, etc.)
   */
  handleValidationError(error, context = {}) {
    const enhancedContext = {
      ...context,
      operation: 'validation'
    };

    return this.handle(error, this.errorTypes.VALIDATION, enhancedContext);
  }

  /**
   * Generate user-friendly error messages
   * @param {string} type - Error type
   * @param {string} originalMessage - Original error message
   * @returns {string} User-friendly message
   */
  getUserFriendlyMessage(type, originalMessage) {
    const messageMap = {
      [this.errorTypes.AMAZON_FETCH]: {
        default: 'Amazon書籍データの取得に失敗しました。URLを確認してもう一度お試しください。',
        'cors_error': 'ネットワークアクセスエラーが発生しました。しばらく待ってから再試行してください。',
        'timeout_error': 'データ取得がタイムアウトしました。ネットワーク接続を確認してください。',
        'not_found_error': '指定された書籍が見つかりませんでした。URLが正しいか確認してください。',
        'rate_limit_error': 'アクセス回数制限に達しました。しばらく時間をおいてから再試行してください。'
      },
      [this.errorTypes.IMAGE_GENERATION]: {
        default: '画像生成に失敗しました。データを確認してもう一度お試しください。'
      },
      [this.errorTypes.X_SHARING]: {
        default: 'X投稿の準備でエラーが発生しました。画像を手動でダウンロードしてX投稿に添付してください。',
        'channel_closed': 'X投稿画面への接続が切断されました。新しいタブで再度お試しください。',
        'content_script_error': 'X投稿画面での操作に失敗しました。ページを更新してから再試行してください。',
        'tab_closed': 'X投稿画面が閉じられました。新しいタブで再度お試しください。'
      },
      [this.errorTypes.STORAGE]: {
        default: 'データの保存に失敗しました。ブラウザの設定を確認してください。'
      },
      [this.errorTypes.NETWORK]: {
        default: 'ネットワークエラーが発生しました。インターネット接続を確認してください。'
      },
      [this.errorTypes.VALIDATION]: {
        default: '入力されたデータに問題があります。内容を確認してください。'
      },
      [this.errorTypes.CONTENT_SCRIPT]: {
        default: 'ページとの連携でエラーが発生しました。ページを更新してもう一度お試しください。'
      },
      [this.errorTypes.PERMISSION]: {
        default: '必要な権限が不足しています。拡張機能の設定を確認してください。'
      },
      [this.errorTypes.UNKNOWN]: {
        default: '予期しないエラーが発生しました。しばらく待ってから再試行してください。'
      }
    };

    const typeMessages = messageMap[type] || messageMap[this.errorTypes.UNKNOWN];
    
    // Try to find a specific message based on original message content
    for (const [key, message] of Object.entries(typeMessages)) {
      if (key !== 'default' && originalMessage.toLowerCase().includes(key.replace('_error', ''))) {
        return message;
      }
    }

    return typeMessages.default;
  }

  /**
   * Generate unique error ID
   * @returns {string} Unique error ID
   */
  generateErrorId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `err_${timestamp}_${random}`;
  }

  /**
   * Track error frequency
   * @param {string} type - Error type
   */
  trackError(type) {
    const count = this.errorCounts.get(type) || 0;
    this.errorCounts.set(type, count + 1);
  }

  /**
   * Add error to recent errors list
   * @param {Object} errorInfo - Error information
   */
  addToRecentErrors(errorInfo) {
    this.recentErrors.unshift(errorInfo);
    
    // Keep only the most recent errors
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors = this.recentErrors.slice(0, this.maxRecentErrors);
    }
  }

  /**
   * Log error with appropriate level
   * @param {Object} errorInfo - Error information
   */
  logError(errorInfo) {
    const logPrefix = `💥 [${errorInfo.type}]`;
    const logData = {
      id: errorInfo.id,
      message: errorInfo.message,
      context: errorInfo.context,
      timestamp: errorInfo.timestamp
    };

    // Use different log levels based on error type
    switch (errorInfo.type) {
      case this.errorTypes.VALIDATION:
        console.warn(logPrefix, logData);
        break;
      case this.errorTypes.NETWORK:
      case this.errorTypes.AMAZON_FETCH:
        console.error(logPrefix, logData);
        if (errorInfo.stack) {
          console.error('Stack trace:', errorInfo.stack);
        }
        break;
      default:
        console.error(logPrefix, logData);
        if (errorInfo.stack) {
          console.error('Stack trace:', errorInfo.stack);
        }
    }
  }

  /**
   * Check if error should trigger user notification
   * @param {Object} errorInfo - Error information
   */
  async checkNotificationTriggers(errorInfo) {
    // High-priority errors that should show user notifications
    const notificationTypes = [
      this.errorTypes.PERMISSION,
      this.errorTypes.STORAGE
    ];

    if (notificationTypes.includes(errorInfo.type)) {
      try {
        await this.showUserNotification(errorInfo);
      } catch (notificationError) {
        console.warn('Failed to show error notification:', notificationError);
      }
    }
  }

  /**
   * Show user notification for critical errors
   * @param {Object} errorInfo - Error information
   */
  async showUserNotification(errorInfo) {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      try {
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Kindle Review Meter - エラー',
          message: errorInfo.userMessage
        });
      } catch (error) {
        console.warn('Notification creation failed:', error);
      }
    }
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    const total = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
    const byType = Object.fromEntries(this.errorCounts);
    
    return {
      total,
      byType,
      recentErrorsCount: this.recentErrors.length,
      mostFrequentType: this.getMostFrequentErrorType()
    };
  }

  /**
   * Get most frequent error type
   * @returns {string|null} Most frequent error type
   */
  getMostFrequentErrorType() {
    let maxCount = 0;
    let mostFrequent = null;

    for (const [type, count] of this.errorCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = type;
      }
    }

    return mostFrequent;
  }

  /**
   * Get recent errors
   * @param {number} limit - Number of recent errors to return
   * @returns {Array} Recent errors
   */
  getRecentErrors(limit = 10) {
    return this.recentErrors.slice(0, limit);
  }

  /**
   * Clear error statistics (useful for testing)
   */
  clearStats() {
    this.errorCounts.clear();
    this.recentErrors = [];
    console.log('Error statistics cleared');
  }

  /**
   * Create a bound error handler for a specific context
   * @param {string} type - Default error type
   * @param {Object} defaultContext - Default context
   * @returns {Function} Bound error handler
   */
  createHandler(type, defaultContext = {}) {
    return (error, additionalContext = {}) => {
      const context = { ...defaultContext, ...additionalContext };
      return this.handle(error, type, context);
    };
  }
}

// Export singleton instance
const errorHandler = new ErrorHandler();
export default errorHandler;
