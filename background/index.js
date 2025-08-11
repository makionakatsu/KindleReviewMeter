/**
 * Background Service Worker Entry Point
 * Kindle Review Meter Chrome Extension
 * 
 * This file serves as the main entry point for the background service worker.
 * It initializes the core systems and sets up the foundational architecture.
 */

// Import core system modules
import messageRouter from './core/MessageRouter.js';
import extensionStateManager from './core/ExtensionStateManager.js';
import errorHandler from './core/ErrorHandler.js';

// TODO: Import service modules (to be implemented in Phase 2)
// import amazonScrapingService from './services/AmazonScrapingService.js';
// import imageGenerationService from './services/ImageGenerationService.js';
// import socialMediaService from './services/SocialMediaService.js';

/**
 * Initialize the extension background services
 */
async function initializeExtension() {
  try {
    console.log('🚀 Initializing Kindle Review Meter background services...');
    
    // Initialize core systems
    extensionStateManager.initialize();
    messageRouter.initialize();
    
    // Register temporary message handlers (from legacy code)
    registerLegacyHandlers();
    
    // Set up extension lifecycle handlers
    setupExtensionLifecycle();
    
    console.log('✅ Kindle Review Meter background services initialized successfully');
    
  } catch (error) {
    const errorInfo = errorHandler.handle(error, 'INITIALIZATION', {
      operation: 'extension_initialization'
    });
    console.error('❌ Failed to initialize extension:', errorInfo);
  }
}

/**
 * Register legacy message handlers temporarily
 * These will be replaced with proper service handlers in Phase 2
 * 
 * For Phase 1, we'll revert to the original message handling approach
 * to ensure compatibility while the architecture is being built
 */
function registerLegacyHandlers() {
  console.log('📋 Setting up legacy message handlers for Phase 1 compatibility');
  
  // Instead of dynamic imports, we'll temporarily use the old approach
  // and gradually migrate in Phase 2
  
  // Temporarily disable the new message router and fall back to direct handlers
  console.warn('⚠️ Using legacy message handling during Phase 1 transition');
  
  // We'll register placeholder handlers that will be implemented in Phase 2
  messageRouter.registerHandler('fetchAmazonData', async (request) => {
    throw new Error('fetchAmazonData handler not implemented yet - please use legacy background.js temporarily');
  });
  
  messageRouter.registerHandler('exportProgressImage', async (request) => {
    throw new Error('exportProgressImage handler not implemented yet - please use legacy background.js temporarily');
  });
  
  messageRouter.registerHandler('shareToXWithImage', async (request) => {
    throw new Error('shareToXWithImage handler not implemented yet - please use legacy background.js temporarily');
  });
  
  messageRouter.registerHandler('imageGenerated', async (request, sender) => {
    console.log('imageGenerated received via MessageRouter');
    return { success: true, message: 'Handled by MessageRouter' };
  });
  
  console.log('📋 Legacy handler placeholders registered');
}

/**
 * Set up extension lifecycle handlers
 */
function setupExtensionLifecycle() {
  // Installation handler
  chrome.runtime.onInstalled.addListener((details) => {
    try {
      if (details.reason === 'install') {
        console.log('🎉 Kindle Review Meter installed');
        extensionStateManager.updateLastActivity();
        
        // Create context menu for Amazon links
        if (chrome.contextMenus) {
          chrome.contextMenus.create({
            id: 'kindle-review-meter',
            title: 'Kindle Review Meter で分析',
            contexts: ['link'],
            targetUrlPatterns: ['*://*.amazon.co.jp/dp/*', '*://*.amazon.co.jp/gp/product/*']
          });
        }
      }
    } catch (error) {
      errorHandler.handle(error, 'INSTALLATION', {
        operation: 'extension_install',
        reason: details.reason
      });
    }
  });
  
  // Context menu click handler
  if (chrome.contextMenus) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      try {
        if (info.menuItemId === 'kindle-review-meter' && info.linkUrl) {
          // Open popup with pre-filled URL
          chrome.action.openPopup();
          // TODO: Pass URL to popup in Phase 3 refactor
          console.log('Context menu clicked for URL:', info.linkUrl);
        }
      } catch (error) {
        errorHandler.handle(error, 'CONTEXT_MENU', {
          operation: 'context_menu_click',
          linkUrl: info.linkUrl
        });
      }
    });
  }
  
  console.log('📱 Extension lifecycle handlers set up');
}

/**
 * Handle unhandled errors globally
 */
function setupGlobalErrorHandling() {
  // Handle unhandled promise rejections
  self.addEventListener('unhandledrejection', (event) => {
    errorHandler.handle(event.reason, 'UNHANDLED_PROMISE', {
      operation: 'unhandled_promise_rejection'
    });
  });
  
  // Handle general errors
  self.addEventListener('error', (event) => {
    errorHandler.handle(event.error || event.message, 'GLOBAL_ERROR', {
      operation: 'global_error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });
  
  console.log('🛡️ Global error handling set up');
}

// Initialize everything when the service worker starts
setupGlobalErrorHandling();
initializeExtension();