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
 */
function registerLegacyHandlers() {
  // Import legacy background.js functions temporarily
  // This is a bridge during the refactoring process
  
  messageRouter.registerHandler('fetchAmazonData', async (request) => {
    // TODO: Replace with AmazonScrapingService in Phase 2
    const { handleAmazonDataFetch } = await import('./background.js');
    return await handleAmazonDataFetch(request.url);
  });
  
  messageRouter.registerHandler('exportProgressImage', async (request) => {
    // TODO: Replace with ImageGenerationService in Phase 2
    const { handleImageExport } = await import('./background.js');
    return await handleImageExport(request.data);
  });
  
  messageRouter.registerHandler('shareToXWithImage', async (request) => {
    // TODO: Replace with SocialMediaService in Phase 2
    const { handleShareToXWithImage } = await import('./background.js');
    return await handleShareToXWithImage(request.data, request.tweetUrl);
  });
  
  messageRouter.registerHandler('imageGenerated', async (request, sender) => {
    // TODO: Replace with proper service coordination in Phase 2
    console.log('imageGenerated received:', {
      hasPendingXShare: !!extensionStateManager.getPendingXShare('any'), // TODO: Proper lookup
      hasDataUrl: !!request.dataUrl,
      dataUrlLength: request.dataUrl?.length,
      senderTabId: sender?.tab?.id
    });
    
    // For now, maintain compatibility with legacy pendingXShare global
    // This will be replaced with proper state management in Phase 2
    if (request.dataUrl && sender?.tab?.id) {
      // TODO: Update state manager and trigger proper service flow
      try {
        await chrome.tabs.remove(sender.tab.id);
      } catch (e) {
        console.warn('Failed to close image generation tab:', e);
      }
    }
    
    return { success: true };
  });
  
  console.log('📋 Registered legacy message handlers (temporary)');
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