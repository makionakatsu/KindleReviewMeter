/**
 * Message Handler Management Service
 * 
 * Extracted from PopupController.js for better separation of concerns
 * 
 * Responsibilities:
 * - Handle all Chrome extension message communication
 * - Manage background script messaging with timeout handling
 * - Process incoming messages from content scripts and background
 * - Handle message routing and response management
 * - Provide reliable communication with error handling
 * 
 * This service focuses exclusively on messaging operations,
 * making communication more reliable and easier to test.
 */

export default class MessageHandler {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.pendingMessages = new Map(); // Track pending messages
    this.messageHandlers = new Map(); // Custom message handlers
    this.setupDefaultHandlers();
  }

  /**
   * Initialize message handling
   */
  initialize() {
    this.setupMessageListeners();
    console.log('MessageHandler: Initialized successfully');
  }

  /**
   * Setup message listeners for background script communication
   * @private
   */
  setupMessageListeners() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleIncomingMessage(message, sender, sendResponse);
        return true; // Keep message channel open for async responses
      });
      
      console.log('MessageHandler: Chrome runtime message listener attached');
    } else {
      console.warn('MessageHandler: Chrome runtime not available');
    }
  }

  /**
   * Setup default message handlers
   * @private
   */
  setupDefaultHandlers() {
    // Image generation completion
    this.messageHandlers.set('imageGenerated', (message) => {
      if (typeof message.success === 'boolean') {
        this.handleImageGeneratedMessage(message);
      }
    });

    // Share operation completion
    this.messageHandlers.set('shareCompleted', (message) => {
      this.handleShareCompletedMessage(message);
    });

    // Error messages
    this.messageHandlers.set('error', (message) => {
      this.uiManager.showError(message.error || 'エラーが発生しました');
    });

    // Success notifications
    this.messageHandlers.set('success', (message) => {
      this.uiManager.showSuccess(message.message || '操作が成功しました');
    });

    console.log('MessageHandler: Default handlers setup complete');
  }

  /**
   * Handle incoming messages from background script or content scripts
   * @private
   * @param {Object} message - Message object
   * @param {Object} sender - Sender information
   * @param {Function} sendResponse - Response callback
   */
  handleIncomingMessage(message, sender, sendResponse) {
    console.log('MessageHandler: Received message:', message);

    try {
      const { action } = message;

      // Check for custom handler first
      if (this.messageHandlers.has(action)) {
        const handler = this.messageHandlers.get(action);
        const result = handler(message, sender);
        
        if (result && typeof result.then === 'function') {
          // Handle async responses
          result.then(response => sendResponse({ success: true, data: response }))
                .catch(error => sendResponse({ success: false, error: error.message }));
        } else {
          sendResponse({ received: true, handled: true });
        }
        return;
      }

      // Handle built-in actions
      switch (action) {
        case 'imageGenerated':
          this.handleImageGeneratedMessage(message);
          break;
        case 'shareCompleted':
          this.handleShareCompletedMessage(message);
          break;
        case 'error':
          this.uiManager.showError(message.error || 'エラーが発生しました');
          break;
        default:
          this.handleUnknownMessage(message, sender);
          break;
      }

      sendResponse({ received: true });
    } catch (error) {
      console.error('MessageHandler: Error processing message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle unknown or unrelated messages
   * @private
   * @param {Object} message - Message object
   * @param {Object} sender - Sender information
   */
  handleUnknownMessage(message, sender) {
    // Silently ignore messages not intended for popup
    const ignoreActions = new Set([
      'xTweetPageReady',
      'krmPing', 
      'attachImageDataUrl',
      'contentScriptReady',
      'tabActivated'
    ]);

    if (!ignoreActions.has(message?.action)) {
      console.debug('MessageHandler: Ignoring unknown message action:', message?.action);
    }
  }

  /**
   * Handle image generated message
   * @private
   * @param {Object} message - Message with image data
   */
  handleImageGeneratedMessage(message) {
    if (message.success) {
      this.uiManager.showSuccess('画像を生成しました');
      console.log('MessageHandler: Image generation successful');
    } else {
      this.uiManager.showError(message.error || '画像生成に失敗しました');
      console.error('MessageHandler: Image generation failed:', message.error);
    }
  }

  /**
   * Handle share completed message
   * @private
   * @param {Object} message - Message with share result
   */
  handleShareCompletedMessage(message) {
    if (message.success) {
      this.uiManager.showSuccess('投稿が完了しました');
      console.log('MessageHandler: Share operation successful');
    } else {
      this.uiManager.showError(message.error || '投稿に失敗しました');
      console.error('MessageHandler: Share operation failed:', message.error);
    }
  }

  /**
   * Send message to background script with timeout and retry
   * @param {Object} message - Message to send
   * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
   * @param {number} retries - Number of retry attempts (default: 1)
   * @returns {Promise<Object>} Response from background script
   */
  async sendMessageToBackground(message, timeoutMs = 30000, retries = 1) {
    const messageId = this.generateMessageId();
    message._id = messageId;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`MessageHandler: Sending message (attempt ${attempt + 1}):`, message);
        
        const response = await this.sendMessageWithTimeout(message, timeoutMs);
        
        console.log('MessageHandler: Received response:', response);
        return response;
        
      } catch (error) {
        console.error(`MessageHandler: Send attempt ${attempt + 1} failed:`, error);
        
        if (attempt === retries) {
          // Final attempt failed
          throw new Error(`Message sending failed after ${retries + 1} attempts: ${error.message}`);
        }
        
        // Wait before retry
        await this.delay(1000 * (attempt + 1));
      }
    }
  }

  /**
   * Send message with timeout handling
   * @private
   * @param {Object} message - Message to send
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<Object>} Response from background script
   */
  sendMessageWithTimeout(message, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        reject(new Error('Chrome runtime not available'));
        return;
      }
      
      const messageId = message._id;
      
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(messageId);
        reject(new Error('Background script communication timeout'));
      }, timeoutMs);
      
      this.pendingMessages.set(messageId, { resolve, reject, timeout });
      
      chrome.runtime.sendMessage(message, (response) => {
        const pendingMessage = this.pendingMessages.get(messageId);
        if (!pendingMessage) return; // Already timed out
        
        clearTimeout(pendingMessage.timeout);
        this.pendingMessages.delete(messageId);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        resolve(response || {});
      });
    });
  }

  /**
   * Check for pending URL from context menu
   * @returns {Promise<string|null>} Pending URL or null
   */
  async checkPendingUrl() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get('pendingUrl');
        if (result.pendingUrl) {
          console.log('MessageHandler: Found pending URL:', result.pendingUrl);
          
          // Clear the pending URL immediately
          await chrome.storage.local.remove('pendingUrl');
          
          return result.pendingUrl;
        }
      }
    } catch (error) {
      console.warn('MessageHandler: Failed to check pending URL:', error);
    }
    
    return null;
  }

  /**
   * Store pending URL for later processing
   * @param {string} url - URL to store
   */
  async storePendingUrl(url) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ pendingUrl: url });
        console.log('MessageHandler: Stored pending URL:', url);
      }
    } catch (error) {
      console.error('MessageHandler: Failed to store pending URL:', error);
    }
  }

  /**
   * Register custom message handler
   * @param {string} action - Message action to handle
   * @param {Function} handler - Handler function
   */
  registerHandler(action, handler) {
    this.messageHandlers.set(action, handler);
    console.log(`MessageHandler: Registered handler for action: ${action}`);
  }

  /**
   * Unregister message handler
   * @param {string} action - Message action to unregister
   */
  unregisterHandler(action) {
    if (this.messageHandlers.delete(action)) {
      console.log(`MessageHandler: Unregistered handler for action: ${action}`);
    }
  }

  /**
   * Generate unique message ID
   * @private
   * @returns {string} Unique message ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay helper for retries
   * @private
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get message handler statistics
   * @returns {Object} Handler statistics
   */
  getMessageStats() {
    return {
      registeredHandlers: this.messageHandlers.size,
      pendingMessages: this.pendingMessages.size,
      handlerActions: Array.from(this.messageHandlers.keys())
    };
  }

  /**
   * Clear all pending messages
   */
  clearPendingMessages() {
    this.pendingMessages.forEach((pendingMessage) => {
      clearTimeout(pendingMessage.timeout);
      pendingMessage.reject(new Error('Message handler cleared'));
    });
    
    this.pendingMessages.clear();
    console.log('MessageHandler: Cleared all pending messages');
  }

  /**
   * Check Chrome runtime connectivity
   * @returns {boolean} True if Chrome runtime is available
   */
  isRuntimeAvailable() {
    return typeof chrome !== 'undefined' && 
           chrome.runtime && 
           chrome.runtime.sendMessage;
  }

  /**
   * Test background script connectivity
   * @returns {Promise<boolean>} True if background script responds
   */
  async testBackgroundConnection() {
    try {
      const response = await this.sendMessageToBackground({ 
        action: 'ping',
        timestamp: Date.now()
      }, 5000, 0); // 5 second timeout, no retries

      return response && response.pong === true;
    } catch (error) {
      console.warn('MessageHandler: Background connection test failed:', error);
      return false;
    }
  }

  /**
   * Cleanup message handler
   */
  cleanup() {
    this.clearPendingMessages();
    this.messageHandlers.clear();
    console.log('MessageHandler: Cleanup completed');
  }
}