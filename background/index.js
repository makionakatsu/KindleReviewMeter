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

// Legacy push-model pending share (dataURL based)
let pendingXShare = null; // { tweetTabId, imageTabId, dataUrl, imageSent }
let amazonScrapingService;

// Priority-1: Pending image store for binary transfer
// - pendingImageStore: tweetTabId -> { buffer, mime, imageTabId, receivedAt }
// - tweetPorts: tweetTabId -> Port (content script connection)
const pendingImageStore = new Map();
const tweetPorts = new Map();

function tryPushToTweetPort(tweetTabId) {
  const record = pendingImageStore.get(tweetTabId);
  const port = tweetPorts.get(tweetTabId);
  if (!record || !port) return false;
  try {
    const { buffer, mime, imageTabId } = record;
    port.postMessage({ type: 'image', mime, buffer }, [buffer]);
    pendingImageStore.delete(tweetTabId);
    socialMediaService?.workflowService?.tabManager?.markImageAsSent(tweetTabId);
    socialMediaService?.workflowService?.tabManager?.cleanupImageTab(imageTabId).catch(()=>{});
    console.log('⚡ Pushed pending image immediately to tweet tab via Port');
    return true;
  } catch (e) {
    console.warn('Failed immediate push to tweet port:', e);
    return false;
  }
}


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
      // Initialize legacy push-model pending share state
      pendingXShare = {
        tweetTabId: result?.tweetTabId || null,
        imageTabId: result?.imageTabId || null,
        dataUrl: null,
        imageSent: false
      };
      console.log('🧭 Pending X share initialized:', pendingXShare);
      return result;
    } catch (error) {
      console.error('❌ shareToXWithImage failed:', error);
      throw error;
    }
  });
  
  // Image generation completion
  messageRouter.registerHandler('imageGenerated', async (request, sender) => {
    try {
      console.log('🖼️ Handling imageGenerated (legacy push model)');
      if (!request?.dataUrl) throw new Error('No image data');
      if (!pendingXShare?.tweetTabId) throw new Error('No pending X share');
      pendingXShare.dataUrl = request.dataUrl;
      // Attempt to send immediately
      trySendImageToTweetTab();
      return true;
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
      // Resume pending push-model share if we have data
      if (pendingXShare?.tweetTabId === tabId && pendingXShare?.dataUrl && !pendingXShare?.imageSent) {
        console.log('🔁 Tweet tab ready and pending image exists; trying to send now');
        trySendImageToTweetTab();
      }
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
          // Store pending URL in session storage for popup to consume safely
          if (chrome.storage?.session) {
            chrome.storage.session.set({ pendingAmazonUrl: info.linkUrl }).catch(()=>{});
          } else if (chrome.storage?.local) {
            // Fallback if session storage is not available
            chrome.storage.local.set({ pendingAmazonUrl: info.linkUrl }).catch(()=>{});
          }
          // Open popup (popup will read and clear pending URL)
          chrome.action.openPopup();
          console.log('Context menu clicked for URL (stored for popup):', info.linkUrl);
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

// ----------------------------------------------------------------------------
// Priority-1: Binary image transfer via Port + Pull model for CS
// ----------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  try {
    if (port.name === 'krm_image_gen') {
      // Image generator → Background (binary)
      port.onMessage.addListener(async (msg) => {
        if (!msg || msg.type !== 'image' || !msg.buffer) return;
        const imageTabId = port.sender?.tab?.id;
        try {
          let tweetTabId = Number(msg.tweetTabId) || null;
          if (!tweetTabId) {
            const share = socialMediaService?.workflowService?.tabManager?.findShareByImageTab(imageTabId);
            if (!share) {
              console.warn('Pending share not found for image tab and no tweetTabId provided:', imageTabId);
              return;
            }
            tweetTabId = share.tweetTabId;
          }
          pendingImageStore.set(tweetTabId, {
            buffer: msg.buffer,
            mime: msg.mime || 'image/jpeg',
            imageTabId,
            receivedAt: Date.now()
          });
          console.log('🔒 Stored pending image for tweetTabId:', tweetTabId);
          // If the tweet port is already connected, push immediately
          tryPushToTweetPort(tweetTabId);
        } catch (e) {
          console.error('Failed to store pending image:', e);
        }
      });
    } else if (port.name === 'krm_image_pull') {
      // Content script → Background (pull binary)
      const tweetTabId = port.sender?.tab?.id;
      if (tweetTabId) {
        tweetPorts.set(tweetTabId, port);
        port.onDisconnect.addListener(() => {
          if (tweetPorts.get(tweetTabId) === port) tweetPorts.delete(tweetTabId);
        });
        // If an image is already waiting, push immediately
        tryPushToTweetPort(tweetTabId);
      }

      port.onMessage.addListener(async (msg) => {
        if (!msg || msg.type !== 'pull') return;
        const record = pendingImageStore.get(tweetTabId);
        if (!record) {
          console.log('No pending image for tweetTabId yet:', tweetTabId);
          return;
        }
        try {
          // Respond with binary (Transferable)
          const { buffer, mime, imageTabId } = record;
          port.postMessage({ type: 'image', mime, buffer }, [buffer]);
          pendingImageStore.delete(tweetTabId);
          // Mark as sent and cleanup image tab
          socialMediaService?.workflowService?.tabManager?.markImageAsSent(tweetTabId);
          await socialMediaService?.workflowService?.tabManager?.cleanupImageTab(imageTabId);
          console.log('📤 Sent pending image to tweet tab via Port and cleaned up image tab');
        } catch (e) {
          console.error('Failed to send pending image:', e);
        }
      });
    }
  } catch (e) {
    console.error('onConnect handler error:', e);
  }
});

// ----------------------------------------------------------------------------
// Legacy push-model sender: replicate fastest-record behavior
// ----------------------------------------------------------------------------
async function trySendImageToTweetTab(maxAttempts = 12) {
  const snapshot = pendingXShare ? {
    tweetTabId: pendingXShare.tweetTabId,
    dataUrl: pendingXShare.dataUrl,
    imageTabId: pendingXShare.imageTabId,
    imageSent: !!pendingXShare.imageSent,
  } : null;

  console.log('trySendImageToTweetTab:', {
    hasPending: !!pendingXShare,
    tweetTabId: snapshot?.tweetTabId,
    hasDataUrl: !!snapshot?.dataUrl,
    imageSent: !!snapshot?.imageSent
  });

  if (!snapshot?.tweetTabId || !snapshot?.dataUrl) return false;
  if (snapshot.imageSent) return true;

  // Helper: find any open X compose tab as fallback when the original tab closed
  const findComposeTab = async () => {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query({
          url: [
            'https://x.com/compose/tweet*',
            'https://twitter.com/compose/tweet*',
            'https://mobile.twitter.com/compose/tweet*'
          ]
        }, (tabs) => {
          if (chrome.runtime.lastError || !tabs) return resolve(null);
          // Prefer active tab, else the most recently opened
          const active = tabs.find(t => t.active);
          if (active) return resolve(active);
          if (tabs.length > 0) return resolve(tabs.sort((a,b)=> (b.id||0)-(a.id||0))[0]);
          resolve(null);
        });
      } catch (_) { resolve(null); }
    });
  };

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const delay = i === 0 ? 0 : Math.min(600 + (i * 150), 1500);
      if (delay > 0) await new Promise(r => setTimeout(r, delay));

      // Ensure tab exists and is ready
      let tab = await new Promise((resolve) => {
        chrome.tabs.get(snapshot.tweetTabId, (t) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(t);
        });
      });
      if (!tab) {
        // Try to find any compose tab and update pending share mapping
        const alt = await findComposeTab();
        if (alt?.id) {
          pendingXShare.tweetTabId = alt.id;
          tab = alt;
        } else {
          continue;
        }
      }
      if (tab.status === 'loading') continue;
      if (!/^https:\/\/(?:mobile\.)?(?:x|twitter)\.com\//.test(tab.url)) continue;

      // Inject CS (idempotent) then ping up to 3 times
      let ready = false;
      for (let pingAttempt = 0; pingAttempt < 3; pingAttempt++) {
        try {
          if (chrome?.scripting?.executeScript) {
            await chrome.scripting.executeScript({ target: { tabId: snapshot.tweetTabId }, files: ['content-scripts/x-tweet-auto-attach.js'] });
            const initWait = Math.min(500 + (pingAttempt * 300), 1500);
            await new Promise(r => setTimeout(r, initWait));
          }
        } catch {}

        const ping = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(false), 2000);
          chrome.tabs.sendMessage(snapshot.tweetTabId, { action: 'krmPing' }, (resp) => {
            clearTimeout(timeout);
            resolve(!chrome.runtime.lastError && resp?.pong);
          });
        });
        if (ping) { ready = true; break; }
        if (pingAttempt < 2) await new Promise(r => setTimeout(r, Math.min(300 + (pingAttempt * 200), 1000)));
      }

      // Send attachment message with progressive timeout
      const ok = await new Promise((resolve, reject) => {
        let responseReceived = false;
        let timeoutDuration;
        if (i === 0) timeoutDuration = 2000; else if (i <= 2) timeoutDuration = 4000; else timeoutDuration = 6000;
        const to = setTimeout(() => { if (!responseReceived) reject(new Error('timeout')); }, timeoutDuration);
        try {
          chrome.tabs.get(pendingXShare.tweetTabId, () => {
            if (chrome.runtime.lastError) { clearTimeout(to); return reject(new Error('tab closed')); }
            chrome.tabs.sendMessage(pendingXShare.tweetTabId, { action: 'attachImageDataUrl', dataUrl: snapshot.dataUrl }, (resp) => {
              responseReceived = true; clearTimeout(to);
              if (chrome.runtime.lastError || !resp) return reject(new Error(chrome.runtime.lastError?.message || 'no response'));
              if (resp.ok) return resolve(true);
              return reject(new Error(resp.error || 'attach failed'));
            });
          });
        } catch (e) { clearTimeout(to); reject(e); }
      });

      if (ok) {
        pendingXShare.imageSent = true;
        // cleanup image tab if exists
        try {
          if (snapshot.imageTabId) {
            chrome.tabs.get(snapshot.imageTabId, (t) => {
              if (!chrome.runtime.lastError && t) {
                try { chrome.tabs.remove(snapshot.imageTabId); } catch {}
              }
            });
          }
        } catch {}
        console.log('✅ Legacy push-model attachment succeeded');
        return true;
      }
    } catch (e) {
      console.warn(`Attempt ${i + 1} failed:`, e?.message || e);
      continue;
    }
  }
  console.error('❌ Failed to attach image after attempts');
  return false;
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
