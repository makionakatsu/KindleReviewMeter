/**
 * Twitter Integration Controller
 * 
 * Extracted from x-tweet-auto-attach.js for better separation of concerns
 * 
 * Responsibilities:
 * - Coordinate all Twitter integration services
 * - Handle Chrome extension message communication
 * - Manage initialization and setup of Twitter interface detection
 * - Process attachment requests and coordinate with attachment service
 * - Provide ping/pong communication for background script health checks
 * - Handle async attachment with proper error handling and response management
 * 
 * This controller acts as the main orchestrator for the Twitter integration,
 * delegating specific tasks to specialized services while maintaining
 * the communication interface with the background script.
 */

(function() {
  'use strict';
  
  class TwitterIntegrationController {
    constructor() {
      this.config = {
        avoidNativeFileDialog: true,
        maxNativeClickAttempts: 0
      };
      
      this.state = {
        attachmentInProgress: false,
        attachmentCompleted: false,
        pendingDataUrl: null
      };
      
      // Initialize services
      this.selectorService = null;
      this.attachmentService = null;
      this.fallbackService = null;
      
      this.init();
    }

    /**
     * Initialize the Twitter integration controller
     */
    async init() {
      try {
        console.log('TwitterIntegrationController: Initializing...');
        
        // Initialize services
        this._initializeServices();
        
        console.log('TwitterIntegrationController: Waiting for X/Twitter interface elements...');
        await this.selectorService.waitForElements();
        
        // Setup message listener
        this._setupMessageListener();
        
        // Notify background that tweet page is ready to receive image
        if (chrome?.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ action: 'xTweetPageReady' }, () => {});
        }
        
        console.log('TwitterIntegrationController: Initialized and ready for image attachment');
      } catch (error) {
        console.error('TwitterIntegrationController: Error in initialization:', error);
      }
    }

    /**
     * Initialize all required services
     * @private
     */
    _initializeServices() {
      if (window.TwitterSelectorService) {
        this.selectorService = new window.TwitterSelectorService();
      } else {
        console.error('TwitterIntegrationController: TwitterSelectorService not available');
      }

      if (window.ImageAttachmentService) {
        this.attachmentService = new window.ImageAttachmentService();
      } else {
        console.error('TwitterIntegrationController: ImageAttachmentService not available');
      }

      if (window.TwitterUIFallbackService) {
        this.fallbackService = new window.TwitterUIFallbackService();
      } else {
        console.error('TwitterIntegrationController: TwitterUIFallbackService not available');
      }
    }

    /**
     * Setup Chrome extension message listener
     * @private
     */
    _setupMessageListener() {
      if (!chrome?.runtime?.onMessage) {
        console.warn('TwitterIntegrationController: Chrome runtime message API not available');
        return;
      }

      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('TwitterIntegrationController: Received message:', request.action, 'at', new Date().toISOString());
        
        try {
          if (request.action === 'krmPing') {
            return this._handlePingRequest(sendResponse);
          }
          
          if (request.action === 'attachImageDataUrl' && request.dataUrl) {
            return this._handleAttachImageRequest(request, sendResponse);
          }
          
          // Unknown action
          console.warn('TwitterIntegrationController: Received unknown action:', request.action);
          sendResponse({ ok: false, error: 'Unknown action' });
          return false; // Synchronous response for unknown actions
          
        } catch (handlerError) {
          console.error('TwitterIntegrationController: Message handler error:', handlerError);
          try {
            sendResponse({ 
              ok: false, 
              error: `Handler error: ${handlerError.message}`,
              timestamp: Date.now()
            });
          } catch (responseError) {
            console.error('TwitterIntegrationController: Failed to send error response:', responseError);
          }
          return false; // Don't keep channel open on handler errors
        }
      });
    }

    /**
     * Handle ping request from background script
     * @private
     */
    _handlePingRequest(sendResponse) {
      console.log('TwitterIntegrationController: Responding to ping');
      const response = { 
        pong: true, 
        url: window.location.href,
        timestamp: Date.now(),
        readyState: document.readyState
      };
      sendResponse(response);
      return false; // Synchronous response, don't keep channel open
    }

    /**
     * Handle image attachment request from background script
     * @private
     */
    _handleAttachImageRequest(request, sendResponse) {
      console.log('TwitterIntegrationController: Received image attach request, dataUrl length:', request.dataUrl?.length);
      
      // Validate data URL
      if (!request.dataUrl.startsWith('data:image/')) {
        console.error('TwitterIntegrationController: Invalid data URL format');
        sendResponse({ ok: false, error: 'Invalid data URL format' });
        return false; // Synchronous response for validation errors
      }
      
      this.state.pendingDataUrl = request.dataUrl;
      
      // Setup auto-retry through fallback service
      if (this.fallbackService) {
        this.fallbackService.setupAutoRetry(15000); // Increase retry time
      }
      
      // Handle async attachment with proper error handling
      (async () => {
        try {
          console.log('TwitterIntegrationController: Starting async image attachment...');
          const attachResult = await this.attachmentService.attachViaDataUrl(request.dataUrl);
          console.log('TwitterIntegrationController: Attach result:', attachResult);
          
          // Ensure we can still send response
          if (chrome.runtime?.id) {
            sendResponse({ 
              ok: attachResult, 
              timestamp: Date.now(),
              method: attachResult ? 'success' : 'fallback'
            });
          } else {
            console.warn('TwitterIntegrationController: Extension context invalidated, cannot send response');
          }
        } catch (e) {
          console.error('TwitterIntegrationController: Attach error:', e);
          
          // Ensure we can still send response
          if (chrome.runtime?.id) {
            sendResponse({ 
              ok: false, 
              error: e?.message || 'Unknown attachment error',
              timestamp: Date.now()
            });
          } else {
            console.warn('TwitterIntegrationController: Extension context invalidated during error, cannot send response');
          }
        }
      })();
      
      return true; // Indicate async response
    }

    /**
     * Get current state of the controller
     */
    getState() {
      const attachmentState = this.attachmentService ? this.attachmentService.getState() : {
        inProgress: false,
        completed: false,
        hasPendingData: false
      };

      return {
        ...this.state,
        services: {
          selector: !!this.selectorService,
          attachment: !!this.attachmentService,
          fallback: !!this.fallbackService
        },
        attachment: attachmentState
      };
    }

    /**
     * Reset controller state
     */
    reset() {
      this.state.attachmentInProgress = false;
      this.state.attachmentCompleted = false;
      this.state.pendingDataUrl = null;
      
      if (this.attachmentService) {
        this.attachmentService.reset();
      }
      
      if (this.fallbackService) {
        this.fallbackService.cleanup();
      }
    }

    /**
     * Clean up resources
     */
    cleanup() {
      if (this.fallbackService) {
        this.fallbackService.cleanup();
      }
    }
  }
  
  // Make available globally within IIFE context
  window.TwitterIntegrationController = TwitterIntegrationController;
  
  // Auto-initialize when all services are loaded
  if (window.TwitterSelectorService && 
      window.ImageAttachmentService && 
      window.TwitterUIFallbackService) {
    window.twitterController = new TwitterIntegrationController();
  } else {
    console.warn('TwitterIntegrationController: Required services not yet loaded, initialization deferred');
  }
  
})();