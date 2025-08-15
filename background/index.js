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
import AmazonScrapingService from './services/AmazonScrapingService.js';
import { DEBUG_MODE } from './config.js';

// Global service instances
let cacheService;
let proxyManagerService;
let imageGenerationService;
let socialMediaService;
let amazonScrapingService;


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
  
  // Initialize base services first
  cacheService = new CacheService();
  proxyManagerService = new ProxyManagerService();
  
  // Initialize dependent services
  amazonScrapingService = new AmazonScrapingService(cacheService, proxyManagerService, errorHandler);
  imageGenerationService = new ImageGenerationService();
  socialMediaService = new SocialMediaService(extensionStateManager, errorHandler);
  
  // Set debug mode (reduce noisy logs in production)
  try {
    if (amazonScrapingService?.setDebugMode) amazonScrapingService.setDebugMode(DEBUG_MODE);
    if (socialMediaService?.setDebugMode) socialMediaService.setDebugMode(DEBUG_MODE);
  } catch (e) {
    console.warn('Debug mode configuration failed:', e?.message || e);
  }

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
      // Return raw result; MessageRouter will wrap with { success: true, data }
      return result;
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
      
      // Return boolean; MessageRouter will wrap
      return result;
    } catch (error) {
      console.error('❌ imageGenerated handling failed:', error);
      throw error;
    }
  });
  
  // Image generation service handler
  messageRouter.registerHandler('exportProgressImage', async (request) => {
    try {
      console.log('🎨 Handling exportProgressImage with ImageGenerationService');
      const result = await imageGenerationService.generateProgressImage(request.data, request.options || {});
      return result;
    } catch (error) {
      console.error('❌ exportProgressImage failed:', error);
      throw error;
    }
  });
  
  // Amazon data fetching with AmazonScrapingService
  messageRouter.registerHandler('fetchAmazonData', async (request) => {
    try {
      console.log('🔍 Handling fetchAmazonData with AmazonScrapingService');
      const result = await amazonScrapingService.fetchBookData(request.url);
      return result;
    } catch (error) {
      console.error('❌ fetchAmazonData failed:', error);
      throw error;
    }
  });

  // Content script on X compose page signals readiness
  messageRouter.registerHandler('xTweetPageReady', async (_request, sender) => {
    try {
      const tabId = sender.tab?.id || null;
      console.log('✅ xTweetPageReady acknowledged', { tabId });
      // Optionally, we could try to resume pending share here if needed.
      return { ready: true, tabId };
    } catch (error) {
      console.error('❌ xTweetPageReady handling failed:', error);
      throw error;
    }
  });

  // Optional clipboard copy telemetry from image generator
  messageRouter.registerHandler('clipboardCopySuccess', async (request) => {
    try {
      console.log('📋 Clipboard copy result:', {
        success: request?.success,
        error: request?.error || null,
        timestamp: new Date().toISOString()
      });
      return { acknowledged: true };
    } catch (error) {
      console.warn('Failed to handle clipboardCopySuccess:', error);
      return { acknowledged: false };
    }
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

// Fallback: ensure xTweetPageReady doesn't error even if router isn't ready yet
try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'xTweetPageReady') {
      try {
        const tabId = sender?.tab?.id || null;
        console.log('⚡ Fallback ACK for xTweetPageReady', { tabId });
        sendResponse({ ok: true, tabId });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
      return true;
    }
  });
} catch (e) {
  console.warn('Failed to add fallback xTweetPageReady listener:', e);
}
