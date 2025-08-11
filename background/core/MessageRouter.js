/**
 * MessageRouter - Central Message Routing System
 * 
 * Responsibilities:
 * - Route all messages between popup, content scripts, and background
 * - Provide consistent async response handling
 * - Maintain action type registry for type safety
 * - Enable centralized logging and debugging
 */

class MessageRouter {
  constructor() {
    this.handlers = new Map();
    this.middleware = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the message router with Chrome runtime listener
   */
  initialize() {
    if (this.isInitialized) {
      console.warn('MessageRouter already initialized');
      return;
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep channel open for async responses
    });

    this.isInitialized = true;
    console.log('MessageRouter initialized successfully');
  }

  /**
   * Register a message handler for a specific action
   * @param {string} action - The action type to handle
   * @param {Function} handler - The handler function (can be async)
   */
  registerHandler(action, handler) {
    if (this.handlers.has(action)) {
      console.warn(`Handler for action '${action}' already exists, overwriting`);
    }

    this.handlers.set(action, handler);
    console.log(`Registered handler for action: ${action}`);
  }

  /**
   * Register multiple handlers at once
   * @param {Object} handlersMap - Object with action: handler pairs
   */
  registerHandlers(handlersMap) {
    Object.entries(handlersMap).forEach(([action, handler]) => {
      this.registerHandler(action, handler);
    });
  }

  /**
   * Add middleware for pre/post processing messages
   * @param {Function} middlewareFunction - Function to process messages
   */
  addMiddleware(middlewareFunction) {
    this.middleware.push(middlewareFunction);
  }

  /**
   * Main message handling logic
   * @param {Object} request - The message request
   * @param {Object} sender - The message sender
   * @param {Function} sendResponse - Response callback
   */
  async handleMessage(request, sender, sendResponse) {
    try {
      // Log incoming message
      console.log('📨 MessageRouter received:', {
        action: request.action,
        sender: sender.tab?.id || 'extension',
        timestamp: new Date().toISOString()
      });

      // Validate message structure
      if (!request.action) {
        throw new Error('Message missing required "action" field');
      }

      // Apply middleware
      for (const middleware of this.middleware) {
        const result = await middleware(request, sender);
        if (result === false) {
          // Middleware rejected the message
          sendResponse({ success: false, error: 'Message rejected by middleware' });
          return;
        }
      }

      // Get handler for action
      const handler = this.handlers.get(request.action);
      if (!handler) {
        throw new Error(`No handler registered for action: ${request.action}`);
      }

      // Execute handler
      const result = await handler(request, sender);
      
      // Send successful response
      sendResponse({
        success: true,
        data: result,
        timestamp: Date.now()
      });

      console.log('✅ MessageRouter completed:', request.action);

    } catch (error) {
      console.error('❌ MessageRouter error:', {
        action: request.action,
        error: error.message,
        stack: error.stack
      });

      // Send error response
      sendResponse({
        success: false,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get all registered action types
   * @returns {string[]} Array of registered actions
   */
  getRegisteredActions() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Remove a handler for specific action
   * @param {string} action - The action to unregister
   */
  unregisterHandler(action) {
    const removed = this.handlers.delete(action);
    if (removed) {
      console.log(`Unregistered handler for action: ${action}`);
    }
    return removed;
  }

  /**
   * Clear all handlers (useful for testing)
   */
  clearAllHandlers() {
    const count = this.handlers.size;
    this.handlers.clear();
    console.log(`Cleared ${count} message handlers`);
  }
}

// Export singleton instance
const messageRouter = new MessageRouter();
export default messageRouter;