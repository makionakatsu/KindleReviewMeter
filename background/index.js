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

// Import service modules
import { CacheService } from './services/CacheService.js';
import { ProxyManagerService } from './services/ProxyManagerService.js';
import { ImageGenerationService } from './services/ImageGenerationService.js';
import SocialMediaService from './services/SocialMediaService.js';

// Global service instances
let cacheService;
let proxyManagerService;
let imageGenerationService;
let socialMediaService;

/**
 * Initialize the extension background services
 */
async function initializeExtension() {
  try {
    console.log('🚀 Initializing Kindle Review Meter background services...');
    
    // Initialize core systems
    extensionStateManager.initialize();
    messageRouter.initialize();
    
    // Initialize services with dependency injection
    initializeServices();
    
    // Register message handlers with new services
    registerServiceHandlers();
    
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
 * Initialize all services with proper dependency injection
 */
function initializeServices() {
  console.log('🔧 Initializing services...');
  
  // Initialize services
  cacheService = new CacheService();
  proxyManagerService = new ProxyManagerService();
  imageGenerationService = new ImageGenerationService();
  socialMediaService = new SocialMediaService(extensionStateManager, errorHandler);
  
  console.log('✅ Services initialized successfully');
}

/**
 * Register service-based message handlers
 */
function registerServiceHandlers() {
  console.log('📋 Setting up service-based message handlers');
  
  // X sharing with automatic image attachment
  messageRouter.registerHandler('shareToXWithImage', async (request) => {
    try {
      console.log('🎯 Handling shareToXWithImage with SocialMediaService');
      const result = await socialMediaService.shareToXWithImage(request.data, request.tweetUrl);
      return { success: true, result };
    } catch (error) {
      console.error('❌ shareToXWithImage failed:', error);
      throw error;
    }
  });
  
  // Image generation completion
  messageRouter.registerHandler('imageGenerated', async (request, sender) => {
    try {
      console.log('🖼️ Handling imageGenerated with SocialMediaService');
      
      const result = await socialMediaService.handleImageGenerated(
        request.dataUrl,
        sender.tab?.id
      );
      
      return { success: result };
    } catch (error) {
      console.error('❌ imageGenerated handling failed:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Image generation service handler
  messageRouter.registerHandler('exportProgressImage', async (request) => {
    try {
      console.log('🎨 Handling exportProgressImage with ImageGenerationService');
      const result = await imageGenerationService.generateProgressImage(request.data, request.options || {});
      return { success: true, result };
    } catch (error) {
      console.error('❌ exportProgressImage failed:', error);
      throw error;
    }
  });
  
  // Amazon data fetching (placeholder for now - will use legacy background.js)
  messageRouter.registerHandler('fetchAmazonData', async (request) => {
    throw new Error('fetchAmazonData handler will be implemented in Phase 3 - please use legacy background.js temporarily');
  });
  
  console.log('✅ Service handlers registered successfully');
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