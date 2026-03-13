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

// Strict share affinity state (fail-closed)
// - shareById: shareId -> share state
// - shareIdByTweetTabId: tweet tab index
// - shareIdByImageTabId: image generation tab index
const shareById = new Map();
const shareIdByTweetTabId = new Map();
const shareIdByImageTabId = new Map();
const sendLockByShareId = new Map();
let shareCreationInFlightPromise = null;
let amazonScrapingService;

// Priority-1: Pending image store for binary transfer
// - pendingImageStore: tweetTabId -> { buffer, mime, imageTabId, receivedAt }
// - tweetPorts: tweetTabId -> Port (content script connection)
const pendingImageStore = new Map();
const tweetPorts = new Map();
// Idempotency cache for shareToXWithImage requests from popup retries.
const shareRequestCache = new Map(); // requestId -> { createdAt, promise }
const SHARE_TTL_MS = 10 * 60 * 1000;
const SHARE_DONE_TTL_MS = 2 * 60 * 1000;
let shareMaintenanceInterval = null;
let lifecycleTabListenersAttached = false;
let lifecycleRuntimeListenersAttached = false;

function pruneShareRequestCache() {
  const now = Date.now();
  const ttlMs = 5 * 60 * 1000; // 5 minutes

  for (const [requestId, entry] of shareRequestCache.entries()) {
    if (!entry?.createdAt || (now - entry.createdAt) > ttlMs) {
      shareRequestCache.delete(requestId);
    }
  }

  // Hard cap to avoid unbounded growth
  if (shareRequestCache.size > 200) {
    const sorted = Array.from(shareRequestCache.entries())
      .sort((a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0));
    const overflow = shareRequestCache.size - 200;
    for (let i = 0; i < overflow; i++) {
      shareRequestCache.delete(sorted[i][0]);
    }
  }
}

function generateShareId() {
  return `xshare_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isComposeTweetUrl(url) {
  if (typeof url !== 'string') return false;
  return /^https:\/\/(?:mobile\.)?(?:x|twitter)\.com\/(?:i\/(?:flow\/)?|)?compose\/(?:tweet|post)(?:[/?#]|$)/i.test(url);
}

function logShareEvent(event, shareOrMeta = {}, extra = {}) {
  const meta = shareOrMeta && typeof shareOrMeta === 'object'
    ? {
        shareId: shareOrMeta.shareId || null,
        tweetTabId: shareOrMeta.tweetTabId || null,
        imageTabId: shareOrMeta.imageTabId || null,
        status: shareOrMeta.status || null,
        failureReason: shareOrMeta.failureReason || null
      }
    : {};
  console.log(`[X_SHARE] ${event}`, { ...meta, ...extra });
}

function indexShare(share) {
  if (!share?.shareId) return;
  if (Number.isInteger(share.tweetTabId)) {
    shareIdByTweetTabId.set(share.tweetTabId, share.shareId);
  }
  if (Number.isInteger(share.imageTabId)) {
    shareIdByImageTabId.set(share.imageTabId, share.shareId);
  }
}

function unindexShare(share) {
  if (!share) return;
  if (Number.isInteger(share.tweetTabId) && shareIdByTweetTabId.get(share.tweetTabId) === share.shareId) {
    shareIdByTweetTabId.delete(share.tweetTabId);
  }
  if (Number.isInteger(share.imageTabId) && shareIdByImageTabId.get(share.imageTabId) === share.shareId) {
    shareIdByImageTabId.delete(share.imageTabId);
  }
}

function syncExtensionPendingShare(share) {
  if (!share) return;
  const tweetTabId = Number(share.tweetTabId);
  if (!Number.isInteger(tweetTabId)) return;

  const syncPayload = {
    shareId: share.shareId || null,
    imageTabId: Number.isInteger(share.imageTabId) ? share.imageTabId : null,
    status: share.status || null,
    imageSent: !!share.imageSent,
    failureReason: share.failureReason || null,
    policy: share.policy || 'strict_affinity',
    updatedAt: share.updatedAt || Date.now()
  };

  try {
    const existing = extensionStateManager.getPendingXShare(tweetTabId);
    if (existing) {
      extensionStateManager.updatePendingXShare(tweetTabId, syncPayload);
      logShareEvent('state_synced', share, { syncMode: 'update' });
    } else {
      extensionStateManager.setPendingXShare(tweetTabId, {
        ...syncPayload,
        createdAt: share.createdAt || Date.now()
      });
      logShareEvent('state_synced', share, { syncMode: 'set' });
    }
  } catch (e) {
    console.warn('Failed to sync strict share state to ExtensionStateManager:', e?.message || e);
  }
}

function upsertShare(share, extra = {}) {
  if (!share?.shareId) return null;
  const existing = shareById.get(share.shareId);
  if (existing) {
    unindexShare(existing);
  }
  const next = {
    ...existing,
    ...share,
    updatedAt: Date.now(),
    ...extra
  };
  shareById.set(next.shareId, next);
  indexShare(next);
  syncExtensionPendingShare(next);
  return next;
}

function getShareByTweetTabId(tabId) {
  const id = Number(tabId);
  if (!Number.isInteger(id)) return null;
  const shareId = shareIdByTweetTabId.get(id);
  return shareId ? (shareById.get(shareId) || null) : null;
}

function clearShare(shareId, reason = 'cleared') {
  const share = shareById.get(shareId);
  if (!share) return;
  const tweetTabId = Number(share.tweetTabId);
  let extensionCleared = false;

  if (Number.isInteger(tweetTabId)) {
    try {
      extensionCleared = !!extensionStateManager.clearPendingXShare(tweetTabId);
    } catch (e) {
      console.warn('Failed to clear ExtensionStateManager pending share:', e?.message || e);
    }
  }

  unindexShare(share);
  shareById.delete(shareId);
  sendLockByShareId.delete(shareId);
  logShareEvent('cleared', share, { reason, extensionCleared });
}

function markShareFailed(shareId, reason, extra = {}) {
  const share = shareById.get(shareId);
  if (!share) return null;
  const failed = upsertShare(
    {
      ...share,
      status: 'failed',
      failureReason: reason
    },
    { updatedAt: Date.now() }
  );
  logShareEvent('failed', failed, { reason, ...extra });
  return failed;
}

async function notifyStrictFailure(share, reason) {
  const msg = `自動添付を中断しました（${reason}）。誤添付防止のため再実行してください。`;
  logShareEvent('strict_failure_notified', share || {}, { reason, message: msg });
  if (typeof chrome !== 'undefined' && chrome.notifications) {
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Kindle Review Meter',
        message: msg
      });
    } catch (e) {
      console.warn('Failed to show strict failure notification:', e?.message || e);
    }
  }
}

function pruneStaleShares() {
  const now = Date.now();
  for (const [shareId, share] of shareById.entries()) {
    const age = now - (share.updatedAt || share.createdAt || now);
    const done = share.status === 'completed' || share.status === 'failed';
    const maxAge = done ? SHARE_DONE_TTL_MS : SHARE_TTL_MS;
    if (age > maxAge) {
      clearShare(shareId, 'stale');
    }
  }
}

function startShareMaintenance() {
  if (shareMaintenanceInterval) return;
  shareMaintenanceInterval = setInterval(() => {
    try {
      pruneStaleShares();
      pruneShareRequestCache();
    } catch (e) {
      console.warn('Share maintenance failed:', e?.message || e);
    }
  }, 60 * 1000);
}

function stopShareMaintenance() {
  if (!shareMaintenanceInterval) return;
  clearInterval(shareMaintenanceInterval);
  shareMaintenanceInterval = null;
}

function tryPushToTweetPort(tweetTabId) {
  const record = pendingImageStore.get(tweetTabId);
  const port = tweetPorts.get(tweetTabId);
  if (!record || !port) return false;
  try {
    const { buffer, mime, imageTabId, shareId } = record;
    port.postMessage({ type: 'image', mime, buffer });
    pendingImageStore.delete(tweetTabId);
    if (shareId && shareById.has(shareId)) {
      const share = shareById.get(shareId);
      upsertShare({
        ...share,
        status: 'completed',
        imageSent: true,
        sentAt: Date.now()
      });
      clearShare(shareId, 'binary_port_sent');
    }
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
    startShareMaintenance();
    
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
    pruneStaleShares();
    const requestId = typeof request?._id === 'string' ? request._id : null;
    const tweetText = typeof request?.tweetText === 'string' ? request.tweetText : '';
    if (requestId) {
      pruneShareRequestCache();
      const cached = shareRequestCache.get(requestId);
      if (cached?.promise) {
        console.warn('shareToXWithImage duplicate request detected; reusing prior result', { requestId });
        return await cached.promise;
      }
    }

    if (shareCreationInFlightPromise) {
      if (requestId) {
        shareRequestCache.set(requestId, {
          createdAt: Date.now(),
          promise: shareCreationInFlightPromise
        });
      }
      console.warn('shareToXWithImage in-flight guard: reusing existing creation promise');
      return await shareCreationInFlightPromise;
    }

    const executeShare = (async () => {
      try {
        console.log('🎯 Handling shareToXWithImage with SocialMediaService');
        const result = await socialMediaService.shareToXWithImage(request.data, request.tweetUrl, tweetText);

        if (!result?.success) {
          const failedReason = result?.failedReason || 'share_setup_failed';
          console.warn('shareToXWithImage returned unsuccessful result:', failedReason);
          return {
            ...result,
            policy: 'strict_affinity'
          };
        }

        const shareId = typeof result?.shareId === 'string' && result.shareId
          ? result.shareId
          : generateShareId();
        const tweetTabId = Number(result?.tweetTabId);
        const imageTabId = Number(result?.imageTabId);

        if (!Number.isInteger(tweetTabId) || !Number.isInteger(imageTabId)) {
          throw new Error('shareToXWithImage did not return required tab IDs');
        }

        const share = upsertShare({
          shareId,
          tweetTabId,
          imageTabId,
          tweetText,
          dataUrl: null,
          imageSent: false,
          status: 'awaiting_image',
          failureReason: null,
          policy: 'strict_affinity',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        logShareEvent('created', share, { requestId });

        return {
          ...result,
          shareId,
          policy: 'strict_affinity'
        };
      } catch (error) {
        console.error('❌ shareToXWithImage failed:', error);
        throw error;
      }
    })();
    shareCreationInFlightPromise = executeShare;

    if (requestId) {
      shareRequestCache.set(requestId, { createdAt: Date.now(), promise: executeShare });
    }

    try {
      const result = await executeShare;
      if (requestId) {
        const entry = shareRequestCache.get(requestId);
        if (entry) entry.createdAt = Date.now();
      }
      return result;
    } catch (error) {
      if (requestId) shareRequestCache.delete(requestId);
      throw error;
    } finally {
      if (shareCreationInFlightPromise === executeShare) {
        shareCreationInFlightPromise = null;
      }
    }
  });
  
  // Image generation completion
  messageRouter.registerHandler('imageGenerated', async (request, sender) => {
    try {
      pruneStaleShares();
      console.log('🖼️ Handling imageGenerated (strict affinity)');
      if (!request?.dataUrl) throw new Error('No image data');

      const requestedShareId = typeof request?.shareId === 'string' ? request.shareId : null;
      const requestedTweetTabId = Number(request?.tweetTabId) || null;
      const requestedImageTabId = Number(request?.imageTabId) || null;
      const requestedTweetText = typeof request?.tweetText === 'string' ? request.tweetText : '';
      const senderImageTabId = sender?.tab?.id || null;
      const sourceImageTabId = senderImageTabId || requestedImageTabId;

      let share = null;
      let resolution = null;

      if (requestedShareId) {
        share = shareById.get(requestedShareId) || null;
        resolution = 'share_id';
      }

      if (!share) {
        // Restore strict share affinity when SW was restarted and in-memory maps were lost.
        if (requestedShareId && requestedTweetTabId) {
          const composeTab = await new Promise((resolve) => {
            chrome.tabs.get(requestedTweetTabId, (tab) => {
              if (chrome.runtime.lastError || !tab) return resolve(null);
              resolve(tab);
            });
          });
          if (composeTab && isComposeTweetUrl(composeTab.url)) {
            share = upsertShare({
              shareId: requestedShareId,
              tweetTabId: requestedTweetTabId,
              imageTabId: Number.isInteger(sourceImageTabId) ? sourceImageTabId : null,
              tweetText: requestedTweetText,
              dataUrl: null,
              imageSent: false,
              status: 'awaiting_image',
              failureReason: null,
              policy: 'strict_affinity',
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
            resolution = 'reconstructed_from_request';
            logShareEvent('reconstructed', share, {
              requestedTweetTabId,
              senderImageTabId,
              requestedImageTabId
            });
          }
        }
      }

      if (!share) {
        // Backward-compatible path: require BOTH tweetTabId + sender imageTabId and exact same share mapping.
        if (requestedTweetTabId && sourceImageTabId) {
          const shareIdByTweet = shareIdByTweetTabId.get(requestedTweetTabId) || null;
          const shareIdByImage = shareIdByImageTabId.get(sourceImageTabId) || null;
          if (shareIdByTweet && shareIdByTweet === shareIdByImage) {
            share = shareById.get(shareIdByTweet) || null;
            resolution = 'tweet_image_exact';
          }
        }
      }

      if (!share) {
        throw new Error('No strict share match for imageGenerated');
      }

      if (requestedTweetTabId && share.tweetTabId !== requestedTweetTabId) {
        const failed = markShareFailed(share.shareId, 'tweet_tab_mismatch', {
          requestedTweetTabId,
          actualTweetTabId: share.tweetTabId
        });
        await notifyStrictFailure(failed, 'tweet_tab_mismatch');
        clearShare(share.shareId, 'tweet_tab_mismatch');
        throw new Error('Strict affinity mismatch: tweetTabId');
      }

      if (sourceImageTabId && Number.isInteger(share.imageTabId) && share.imageTabId !== sourceImageTabId) {
        const failed = markShareFailed(share.shareId, 'image_tab_mismatch', {
          senderImageTabId: sourceImageTabId,
          expectedImageTabId: share.imageTabId
        });
        await notifyStrictFailure(failed, 'image_tab_mismatch');
        clearShare(share.shareId, 'image_tab_mismatch');
        throw new Error('Strict affinity mismatch: imageTabId');
      }

      if (share.status === 'completed') {
        return {
          queued: false,
          alreadyCompleted: true,
          shareId: share.shareId,
          tweetTabId: share.tweetTabId,
          policy: 'strict_affinity'
        };
      }

      if (share.status === 'failed') {
        throw new Error(`Share already failed: ${share.failureReason || 'unknown'}`);
      }

      const next = upsertShare({
        ...share,
        tweetText: requestedTweetText || share.tweetText || '',
        dataUrl: request.dataUrl,
        status: 'image_ready',
        failureReason: null
      });

      scheduleShareSend(next.shareId, 'imageGenerated').catch((e) => {
        console.warn('scheduleShareSend failed:', e?.message || e);
      });

      return {
        queued: true,
        shareId: next.shareId,
        tweetTabId: next.tweetTabId,
        policy: 'strict_affinity',
        resolution
      };
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
      pruneStaleShares();
      const tabId = sender.tab?.id || null;
      const share = tabId ? getShareByTweetTabId(tabId) : null;
      console.log('✅ xTweetPageReady acknowledged', {
        tabId,
        shareId: share?.shareId || null
      });

      if (share?.dataUrl && !share?.imageSent && share?.status !== 'failed' && share?.status !== 'completed') {
        scheduleShareSend(share.shareId, 'xTweetPageReady').catch((e) => {
          console.warn('scheduleShareSend from xTweetPageReady failed:', e?.message || e);
        });
      }

      return {
        ready: true,
        tabId,
        shareId: share?.shareId || null,
        policy: 'strict_affinity'
      };
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
  const createOrUpdateContextMenu = () => {
    if (!chrome.contextMenus) return;
    const createMenu = () => {
      try {
        chrome.contextMenus.create({
          id: 'kindle-review-meter',
          title: 'Kindleレビューメーターで分析',
          contexts: ['link', 'page', 'selection']
        });
      } catch (e) {
        console.warn('Failed to (re)create context menu:', e?.message || e);
      }
    };

    try {
      if (typeof chrome.contextMenus.removeAll === 'function') {
        // Safely remove all existing items for this extension, then recreate
        chrome.contextMenus.removeAll(() => {
          // Ignore lastError if any and proceed to create
          createMenu();
        });
      } else if (typeof chrome.contextMenus.remove === 'function') {
        // Fallback: remove by id with callback to avoid unhandled promise rejection
        chrome.contextMenus.remove('kindle-review-meter', () => {
          // Ignore lastError if any and proceed to create
          createMenu();
        });
      } else {
        createMenu();
      }
    } catch (_) {
      // If anything goes wrong during removal, still try to create the menu
      createMenu();
    }
  };
  // Installation handler
  chrome.runtime.onInstalled.addListener((details) => {
    try {
      if (details.reason === 'install') {
        console.log('🎉 Kindle Review Meter installed');
        extensionStateManager.updateLastActivity();
        
        // Create context menu for Amazon links
        createOrUpdateContextMenu();
      }
    } catch (error) {
      errorHandler.handle(error, 'INSTALLATION', {
        operation: 'extension_install',
        reason: details.reason
      });
    }
  });

  // Ensure context menu exists on each startup/sw wake
  try { createOrUpdateContextMenu(); } catch {}
  
  // Context menu click handler
  if (chrome.contextMenus) {
    const isAmazonProductUrl = (url) => {
      try {
        const u = new URL(url);
        const host = u.hostname;
        if (!/amazon\.(co\.jp|com)$/i.test(host) && !/\.amazon\.(co\.jp|com)$/i.test(host)) return false;
        
        // Enhanced URL patterns to support more Amazon product page formats
        const productPatterns = [
          /\/dp\//, /\/-\/dp\//, /\/gp\/product\//, /\/gp\/aw\/d\//, // Original patterns
          /\/e\//, /\/kindle-dbs\//, /\/b\//, /\/stores\//, // Kindle/Author/Brand pages
          /\/exec\/obidos\/ASIN\//, /\/o\/ASIN\//, // Legacy ASIN formats
          /\/products\//, /\/detail\//, // Alternative product paths
          /\/audiobooks\//, /\/kindle\//, // Media-specific paths
        ];
        
        return productPatterns.some(pattern => pattern.test(u.pathname));
      } catch (_) { return false; }
    };

    const extractAmazonUrlFromText = (text) => {
      if (!text) return null;
      try {
        // Find first URL-like substring
        const matches = text.match(/https?:\/\/[\w.-]*amazon\.(?:co\.jp|com)[^\s)"']+/i);
        if (matches && matches[0] && isAmazonProductUrl(matches[0])) {
          return matches[0];
        }
      } catch (_) {}
      return null;
    };

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      try {
        if (info.menuItemId === 'kindle-review-meter') {
          let candidateUrl = info.linkUrl || extractAmazonUrlFromText(info.selectionText) || tab?.url || '';
          let hasValidAmazon = candidateUrl && isAmazonProductUrl(candidateUrl);

          (async () => {
            let extractionMethod = 'none';
            let extractionSuccess = false;
            
            try {
              // Log initial URL extraction method
              if (info.linkUrl) {
                extractionMethod = 'link';
              } else if (info.selectionText) {
                extractionMethod = 'selection';
              } else if (tab?.url) {
                extractionMethod = 'tab_url';
              }
              
              console.log('Context menu clicked:', {
                extractionMethod,
                initialUrl: candidateUrl,
                hasValidAmazon,
                tabId: tab?.id
              });

              // If not valid yet, try to extract canonical/og:url from the page DOM with retry mechanism
              if (!hasValidAmazon && tab?.id && chrome?.scripting?.executeScript) {
                const extractWithRetry = async (tabId, maxRetries = 3) => {
                  for (let attempt = 0; attempt < maxRetries; attempt++) {
                    try {
                      // Add delay between retries to allow page content to load
                      if (attempt > 0) {
                        await new Promise(resolve => setTimeout(resolve, attempt * 500));
                      }
                      
                      const [{ result: domUrl } = {}] = await chrome.scripting.executeScript({
                        target: { tabId },
                        func: () => {
                          try {
                            const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
                            const og = document.querySelector('meta[property="og:url"]')?.content || '';
                            const currentUrl = location.href;
                            
                            // Return the most reliable URL found
                            return canonical || og || currentUrl;
                          } catch (_) {
                            return location.href;
                          }
                        }
                      });
                      
                      if (domUrl && typeof domUrl === 'string' && isAmazonProductUrl(domUrl)) {
                        return domUrl;
                      }
                    } catch (extractError) {
                      console.warn(`DOM extraction attempt ${attempt + 1} failed:`, extractError?.message);
                      if (attempt === maxRetries - 1) {
                        errorHandler.handle(extractError, 'CONTEXT_MENU', {
                          operation: 'dom_extraction',
                          attempt: attempt + 1,
                          tabId: tabId,
                          extractionMethod
                        });
                      }
                    }
                  }
                  return null;
                };

                try {
                  const extractedUrl = await extractWithRetry(tab.id);
                  if (extractedUrl) {
                    candidateUrl = extractedUrl;
                    hasValidAmazon = true;
                    extractionMethod = 'dom';
                    console.log('Successfully extracted URL from DOM:', extractedUrl);
                  }
                } catch (domError) {
                  errorHandler.handle(domError, 'CONTEXT_MENU', {
                    operation: 'dom_extraction_wrapper',
                    extractionMethod,
                    tabId: tab?.id
                  });
                }
              }

              if (hasValidAmazon) {
                try {
                  if (chrome.storage?.session && chrome.storage.session.set) {
                    await chrome.storage.session.set({ pendingAmazonUrl: candidateUrl });
                  } else if (chrome.storage?.local && chrome.storage.local.set) {
                    await chrome.storage.local.set({ pendingAmazonUrl: candidateUrl });
                  }
                  extractionSuccess = true;
                } catch (storageError) {
                  errorHandler.handleStorageError(storageError, {
                    operation: 'store_pending_url',
                    key: 'pendingAmazonUrl',
                    extractionMethod
                  });
                }
              }
            } catch (overallError) {
              errorHandler.handle(overallError, 'CONTEXT_MENU', {
                operation: 'context_menu_processing',
                extractionMethod,
                hasValidAmazon,
                tabId: tab?.id
              });
            } finally {
              // Safely open popup with active window detection
              const openPopupSafely = async () => {
                const openPopupPageFallback = async (baseError = null) => {
                  try {
                    const popupUrl = chrome.runtime.getURL('popup/popup.html');
                    await chrome.tabs.create({ url: popupUrl, active: true });
                    console.warn('openPopup failed; opened popup page in a new tab as fallback', {
                      reason: baseError?.message || null
                    });
                    return true;
                  } catch (fallbackError) {
                    console.error('Fallback popup tab opening failed:', fallbackError?.message || fallbackError);
                    errorHandler.handle(fallbackError, 'CONTEXT_MENU', {
                      operation: 'open_popup_fallback_tab',
                      extractionMethod,
                      hasValidAmazon,
                      originalPopupError: baseError?.message || null
                    });
                    return false;
                  }
                };

                try {
                  // First check if there are any active windows
                  const windows = await chrome.windows.getAll({ populate: false });
                  const currentWindow = await chrome.windows.getCurrent().catch(() => null);
                  
                  if (windows.length === 0 || !currentWindow) {
                    console.warn('No active browser windows found, cannot open popup');
                    // Fall back to opening popup page in a new tab
                    return await openPopupPageFallback();
                  }
                  
                  await chrome.action.openPopup();
                  return true;
                } catch (popupError) {
                  // Open extension page fallback when action popup cannot be opened
                  console.warn('Failed to open popup:', popupError?.message);
                  const fallbackOpened = await openPopupPageFallback(popupError);
                  if (!fallbackOpened) {
                    errorHandler.handle(popupError, 'CONTEXT_MENU', {
                      operation: 'open_popup',
                      extractionMethod,
                      hasValidAmazon,
                      error: popupError?.message
                    });
                  }
                  return fallbackOpened;
                }
              };
              
              const popupOpened = await openPopupSafely();
              
              // Enhanced logging with success/failure details
              console.log('Context menu processing completed:', {
                extractionMethod,
                extractionSuccess,
                hasValidAmazon,
                popupOpened,
                finalUrl: hasValidAmazon ? candidateUrl : '(none)',
                tabId: tab?.id
              });
            }
          })();
        }
      } catch (error) {
        errorHandler.handle(error, 'CONTEXT_MENU', {
          operation: 'context_menu_click',
          linkUrl: info.linkUrl,
          pageUrl: tab?.url
        });
      }
    });
  }

  if (!lifecycleTabListenersAttached && chrome.tabs?.onRemoved) {
    lifecycleTabListenersAttached = true;
    chrome.tabs.onRemoved.addListener(async (tabId) => {
      try {
        const numericTabId = Number(tabId);
        if (!Number.isInteger(numericTabId)) return;

        pendingImageStore.delete(numericTabId);
        tweetPorts.delete(numericTabId);

        const byTweet = shareIdByTweetTabId.get(numericTabId) || null;
        const byImage = shareIdByImageTabId.get(numericTabId) || null;
        const impacted = new Set([byTweet, byImage].filter(Boolean));

        for (const shareId of impacted) {
          const share = shareById.get(shareId);
          if (!share) continue;
          const reason = share.tweetTabId === numericTabId ? 'tweet_tab_closed' : 'image_tab_closed';
          markShareFailed(shareId, reason, { removedTabId: numericTabId });
          await notifyStrictFailure(share, reason);
          clearShare(shareId, reason);
        }
      } catch (e) {
        console.warn('tab.onRemoved strict cleanup failed:', e?.message || e);
      }
    });
  }

  if (!lifecycleRuntimeListenersAttached && chrome.runtime?.onSuspend) {
    lifecycleRuntimeListenersAttached = true;
    chrome.runtime.onSuspend.addListener(() => {
      stopShareMaintenance();
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
          pruneStaleShares();
          let share = null;
          const requestedShareId = typeof msg.shareId === 'string' ? msg.shareId : null;
          const requestedTweetTabId = Number(msg.tweetTabId) || null;

          if (requestedShareId) {
            share = shareById.get(requestedShareId) || null;
          } else if (requestedTweetTabId && imageTabId) {
            const sidFromTweet = shareIdByTweetTabId.get(requestedTweetTabId) || null;
            const sidFromImage = shareIdByImageTabId.get(imageTabId) || null;
            if (sidFromTweet && sidFromTweet === sidFromImage) {
              share = shareById.get(sidFromTweet) || null;
            }
          }

          if (!share) {
            console.warn('Strict binary store failed: no matching share', {
              requestedShareId,
              requestedTweetTabId,
              imageTabId
            });
            return;
          }

          if (requestedTweetTabId && share.tweetTabId !== requestedTweetTabId) {
            markShareFailed(share.shareId, 'binary_tweet_tab_mismatch', {
              expectedTweetTabId: share.tweetTabId,
              requestedTweetTabId
            });
            await notifyStrictFailure(share, 'binary_tweet_tab_mismatch');
            clearShare(share.shareId, 'binary_tweet_tab_mismatch');
            return;
          }

          if (imageTabId && Number.isInteger(share.imageTabId) && share.imageTabId !== imageTabId) {
            markShareFailed(share.shareId, 'binary_image_tab_mismatch', {
              expectedImageTabId: share.imageTabId,
              senderImageTabId: imageTabId
            });
            await notifyStrictFailure(share, 'binary_image_tab_mismatch');
            clearShare(share.shareId, 'binary_image_tab_mismatch');
            return;
          }

          pendingImageStore.set(share.tweetTabId, {
            buffer: msg.buffer,
            mime: msg.mime || 'image/jpeg',
            imageTabId,
            shareId: share.shareId,
            receivedAt: Date.now()
          });
          logShareEvent('binary_stored', share);
          try { port.postMessage({ type: 'stored', tweetTabId: share.tweetTabId, imageTabId, shareId: share.shareId }); } catch {}
          // If the tweet port is already connected, push immediately
          tryPushToTweetPort(share.tweetTabId);
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
          const { buffer, mime, imageTabId, shareId } = record;
          port.postMessage({ type: 'image', mime, buffer });
          pendingImageStore.delete(tweetTabId);
          if (shareId && shareById.has(shareId)) {
            const share = shareById.get(shareId);
            upsertShare({
              ...share,
              status: 'completed',
              imageSent: true,
              sentAt: Date.now()
            });
            clearShare(shareId, 'binary_pull_sent');
          }
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
// Strict share sender (fail-closed)
// ----------------------------------------------------------------------------
async function scheduleShareSend(shareId, trigger = 'unknown') {
  if (typeof shareId !== 'string' || !shareId) return false;
  const existing = sendLockByShareId.get(shareId);
  if (existing) return existing;

  const runner = (async () => {
    try {
      logShareEvent('send_scheduled', shareById.get(shareId) || { shareId }, { trigger });
      return await trySendImageToTweetTab(shareId);
    } finally {
      if (sendLockByShareId.get(shareId) === runner) {
        sendLockByShareId.delete(shareId);
      }
    }
  })();

  sendLockByShareId.set(shareId, runner);
  return runner;
}

async function trySendImageToTweetTab(shareId, maxAttempts = 12) {
  pruneStaleShares();
  const initial = shareById.get(shareId);
  if (!initial) {
    console.warn('trySendImageToTweetTab skipped: share not found', { shareId });
    return false;
  }
  if (initial.status === 'completed') return true;
  if (initial.status === 'failed') return false;
  if (!initial.dataUrl) return false;

  let lastError = null;
  upsertShare({ ...initial, status: 'sending' });

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const share = shareById.get(shareId);
      if (!share) return false;
      if (share.status === 'completed') return true;
      if (share.status === 'failed') return false;

      const targetTweetTabId = Number(share.tweetTabId) || null;
      if (!targetTweetTabId) {
        throw new Error('missing_tweet_tab_id');
      }

      const delay = i === 0 ? 0 : Math.min(600 + (i * 150), 1500);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));

      const tab = await new Promise((resolve) => {
        chrome.tabs.get(targetTweetTabId, (t) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(t);
        });
      });

      if (!tab) {
        markShareFailed(shareId, 'tweet_tab_closed');
        await notifyStrictFailure(share, 'tweet_tab_closed');
        clearShare(shareId, 'tweet_tab_closed');
        return false;
      }

      if (tab.status === 'loading') continue;

      if (!isComposeTweetUrl(tab.url)) {
        markShareFailed(shareId, 'invalid_compose_url', { tabUrl: tab.url });
        await notifyStrictFailure(share, 'invalid_compose_url');
        clearShare(shareId, 'invalid_compose_url');
        return false;
      }

      for (let pingAttempt = 0; pingAttempt < 3; pingAttempt++) {
        try {
          if (chrome?.scripting?.executeScript) {
            await chrome.scripting.executeScript({
              target: { tabId: targetTweetTabId },
              files: ['content-scripts/x-tweet-auto-attach.js']
            });
            const initWait = Math.min(500 + (pingAttempt * 300), 1500);
            await new Promise((r) => setTimeout(r, initWait));
          }
        } catch {}

        const ping = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(false), 2000);
          chrome.tabs.sendMessage(targetTweetTabId, { action: 'krmPing' }, (resp) => {
            clearTimeout(timeout);
            resolve(!chrome.runtime.lastError && resp?.pong);
          });
        });
        if (ping) break;
        if (pingAttempt < 2) {
          await new Promise((r) => setTimeout(r, Math.min(300 + (pingAttempt * 200), 1000)));
        }
      }

      const ok = await new Promise((resolve, reject) => {
        let responseReceived = false;
        let timeoutDuration;
        if (i === 0) timeoutDuration = 7000;
        else if (i <= 2) timeoutDuration = 10000;
        else timeoutDuration = 12000;
        const to = setTimeout(() => {
          if (!responseReceived) reject(new Error('timeout'));
        }, timeoutDuration);
        try {
          chrome.tabs.get(targetTweetTabId, () => {
            if (chrome.runtime.lastError) {
              clearTimeout(to);
              return reject(new Error('tab closed'));
            }
            chrome.tabs.sendMessage(
              targetTweetTabId,
              {
                action: 'attachImageDataUrl',
                dataUrl: share.dataUrl,
                tweetText: share.tweetText || ''
              },
              (resp) => {
                responseReceived = true;
                clearTimeout(to);
                if (chrome.runtime.lastError || !resp) {
                  return reject(new Error(chrome.runtime.lastError?.message || 'no response'));
                }
                if (resp.ok) return resolve(true);
                return reject(new Error(resp.error || 'attach failed'));
              }
            );
          });
        } catch (e) {
          clearTimeout(to);
          reject(e);
        }
      });

      if (ok) {
        upsertShare({
          ...share,
          status: 'completed',
          imageSent: true,
          failureReason: null,
          sentAt: Date.now()
        });

        if (Number.isInteger(share.imageTabId)) {
          try {
            chrome.tabs.get(share.imageTabId, (t) => {
              if (!chrome.runtime.lastError && t) {
                try { chrome.tabs.remove(share.imageTabId); } catch {}
              }
            });
          } catch {}
        }

        logShareEvent('attached', share, { attempts: i + 1 });
        clearShare(shareId, 'completed');
        return true;
      }
    } catch (e) {
      lastError = e;
      console.warn(`Attempt ${i + 1} failed for share ${shareId}:`, e?.message || e);
      continue;
    }
  }

  const failed = markShareFailed(shareId, 'attach_failed', {
    message: lastError?.message || null
  });
  await notifyStrictFailure(failed, 'attach_failed');
  clearShare(shareId, 'attach_failed');
  console.error('❌ Failed to attach image after attempts', {
    shareId,
    error: lastError?.message || null
  });
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
