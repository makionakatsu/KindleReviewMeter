/**
 * Background Script (Service Worker) for Kindle Review Meter Chrome Extension
 * 
 * Architecture Overview:
 * This service worker acts as the central coordinator for the Chrome extension,
 * handling cross-origin requests, data processing, and inter-tab communication.
 * 
 * Key Responsibilities:
 * - Amazon Data Fetching: Scrape book information from Amazon pages via CORS proxies
 * - Image Generation: Coordinate progress image creation for social media sharing
 * - X/Twitter Integration: Manage cross-tab image attachment for tweet composition
 * - Extension Lifecycle: Handle installation, updates, and context menu creation
 * 
 * Service Architecture:
 * 1. Amazon Scraping Service: Multi-proxy fallback system for reliable data extraction
 * 2. Image Generation Service: Tab-based image creation with data passing
 * 3. Social Media Service: Cross-tab communication for automatic image attachment
 * 4. Context Menu Service: Right-click integration for Amazon links
 * 
 * Communication Flow:
 * Popup → Background → Content Scripts → Background → Popup
 */

// ============================================================================
// MESSAGE ROUTING SYSTEM
// ============================================================================

/**
 * Central Message Router
 * 
 * Handles all communication between popup, content scripts, and background.
 * Routes messages to appropriate service handlers based on action type.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchAmazonData') {
    handleAmazonDataFetch(request.url)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'exportProgressImage') {
    handleImageExport(request.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }

  if (request.action === 'shareToXWithImage') {
    console.log('🎯 Background script received shareToXWithImage request:', {
      hasData: !!request.data,
      hasTweetUrl: !!request.tweetUrl,
      tweetUrl: request.tweetUrl
    });
    
    handleShareToXWithImage(request.data, request.tweetUrl)
      .then((result) => {
        console.log('✅ shareToXWithImage completed successfully:', result);
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('❌ shareToXWithImage failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }

  // Receive generated image (as data URL) from image-generator tab in quickMode
  if (request.action === 'imageGenerated') {
    try {
      console.log('imageGenerated received:', {
        hasPendingXShare: !!pendingXShare,
        hasDataUrl: !!request.dataUrl,
        dataUrlLength: request.dataUrl?.length,
        senderTabId: sender?.tab?.id
      });
      
      if (pendingXShare && request.dataUrl) {
        pendingXShare.dataUrl = request.dataUrl;
        console.log('Updated pendingXShare with dataUrl, attempting to send to tweet tab');
        // Try to forward now; the content script may not yet be ready, so retries happen elsewhere
        trySendImageToTweetTab();
      } else {
        console.warn('Cannot process imageGenerated:', {
          pendingXShare: !!pendingXShare,
          dataUrl: !!request.dataUrl
        });
      }
      
      // Try closing the image tab (sender.tab.id), if available
      if (sender?.tab?.id) {
        try { 
          console.log('Closing image generation tab:', sender.tab.id);
          chrome.tabs.remove(sender.tab.id); 
        } catch(e) {
          console.warn('Failed to close image tab:', e);
        }
      }
      sendResponse({ success: true });
    } catch (err) {
      console.error('imageGenerated handling failed:', err);
      sendResponse({ success: false, error: err?.message || String(err) });
    }
    return true;
  }

  // Content script from X tweet page signals readiness
  if (request.action === 'xTweetPageReady') {
    console.log('X tweet page ready signal received');
    // Only try to send if we have pending data and haven't sent yet
    if (pendingXShare && pendingXShare.dataUrl && !pendingXShare.imageSent) {
      console.log('Tweet page ready and we have pending image data, attempting send');
      trySendImageToTweetTab();
    } else {
      console.log('Tweet page ready but no pending image or already sent:', {
        hasPendingXShare: !!pendingXShare,
        hasDataUrl: !!pendingXShare?.dataUrl,
        imageSent: !!pendingXShare?.imageSent
      });
    }
    sendResponse({ ok: true });
    return true;
  }

});

// ============================================================================
// AMAZON SCRAPING SERVICE
// ============================================================================

/**
 * Intelligent Caching System for Amazon Data
 * 
 * Features:
 * - In-memory cache with TTL (Time To Live)
 * - Smart cache invalidation based on content age
 * - Automatic cleanup of expired entries
 * - Cache hit/miss tracking for optimization
 */
class AmazonDataCache {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes for fresh data
    this.maxSize = 100; // Limit memory usage
    this.stats = { hits: 0, misses: 0 };
    
    // Clean up expired entries every 2 minutes
    setInterval(() => this.cleanup(), 2 * 60 * 1000);
  }
  
  generateKey(url) {
    // Use normalized URL as cache key
    return normalizeAmazonUrl(url) || url;
  }
  
  get(url) {
    const key = this.generateKey(url);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if entry is still valid
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    console.log(`📦 Cache HIT for ${key.substring(0, 50)}...`);
    return entry.data;
  }
  
  set(url, data, ttl = this.defaultTTL) {
    const key = this.generateKey(url);
    
    // Implement LRU-like behavior: remove oldest if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    const entry = {
      data: data,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
      accessCount: 1
    };
    
    this.cache.set(key, entry);
    console.log(`💾 Cache SET for ${key.substring(0, 50)}... (TTL: ${ttl/1000}s)`);
  }
  
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cache cleanup: removed ${cleanedCount} expired entries`);
    }
  }
  
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1)
      : 0;
    
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`
    };
  }
  
  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
    console.log('🗑️ Cache cleared');
  }
}

// Global cache instance
const amazonDataCache = new AmazonDataCache();

/**
 * Dynamic Proxy Performance Tracker
 * 
 * Features:
 * - Track success rates and response times per proxy
 * - Dynamic reordering based on performance metrics
 * - Automatic proxy health monitoring
 * - Performance-based timeout adjustments
 */
class ProxyPerformanceTracker {
  constructor() {
    this.stats = new Map();
    this.defaultProxies = [
      'https://api.allorigins.win/get?url=',
      'https://corsproxy.io/?',
      'https://api.codetabs.com/v1/proxy?quest=',
      'https://thingproxy.freeboard.io/fetch/',
      'https://cors-anywhere.herokuapp.com/'
    ];
    
    // Initialize stats for each proxy
    this.defaultProxies.forEach(proxy => {
      this.stats.set(proxy, {
        attempts: 0,
        successes: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        successRate: 0,
        lastUsed: 0,
        consecutiveFailures: 0
      });
    });
  }
  
  recordAttempt(proxy, success, responseTime) {
    const stat = this.stats.get(proxy);
    if (!stat) return;
    
    stat.attempts++;
    stat.lastUsed = Date.now();
    
    if (success) {
      stat.successes++;
      stat.consecutiveFailures = 0;
      stat.totalResponseTime += responseTime;
      stat.averageResponseTime = stat.totalResponseTime / stat.successes;
    } else {
      stat.consecutiveFailures++;
    }
    
    stat.successRate = (stat.successes / stat.attempts) * 100;
    
    console.log(`📈 Proxy stats updated: ${proxy.split('/')[2]} - ${stat.successRate.toFixed(1)}% success, ${stat.averageResponseTime.toFixed(0)}ms avg`);
  }
  
  getOptimizedProxyList() {
    // Create array of [proxy, score] pairs
    const scoredProxies = Array.from(this.stats.entries()).map(([proxy, stat]) => {
      let score = 0;
      
      // Base score from success rate (0-100)
      score += stat.successRate * 1.0;
      
      // Bonus for fast response times (faster = higher score)
      if (stat.averageResponseTime > 0) {
        const speedBonus = Math.max(0, 50 - (stat.averageResponseTime / 100));
        score += speedBonus;
      }
      
      // Penalty for consecutive failures
      score -= stat.consecutiveFailures * 20;
      
      // Slight bonus for recent usage (helps with load balancing)
      const hoursSinceLastUse = (Date.now() - stat.lastUsed) / (1000 * 60 * 60);
      if (hoursSinceLastUse < 1) {
        score += 5;
      }
      
      // Ensure non-negative score
      score = Math.max(0, score);
      
      return { proxy, score, stat };
    });
    
    // Sort by score (highest first) and extract proxies
    const optimizedList = scoredProxies
      .sort((a, b) => b.score - a.score)
      .map(item => item.proxy);
    
    console.log('🎯 Optimized proxy order:', optimizedList.map(p => `${p.split('/')[2]}(${this.stats.get(p).successRate.toFixed(0)}%)`));
    
    return optimizedList;
  }
  
  getRecommendedTimeout(proxy) {
    const stat = this.stats.get(proxy);
    if (!stat || stat.averageResponseTime === 0) {
      return 6000; // Reduced default timeout from 4000 to 6000ms
    }
    
    // Dynamic timeout: average response time + buffer
    // But keep within tighter bounds (2-8 seconds)
    const dynamicTimeout = Math.min(8000, Math.max(2000, stat.averageResponseTime * 2));
    return dynamicTimeout;
  }
  
  getStats() {
    const stats = {};
    for (const [proxy, stat] of this.stats.entries()) {
      stats[proxy.split('/')[2]] = {
        successRate: `${stat.successRate.toFixed(1)}%`,
        avgResponseTime: `${stat.averageResponseTime.toFixed(0)}ms`,
        attempts: stat.attempts,
        consecutiveFailures: stat.consecutiveFailures
      };
    }
    return stats;
  }
  
  reset() {
    this.stats.forEach(stat => {
      stat.attempts = 0;
      stat.successes = 0;
      stat.totalResponseTime = 0;
      stat.averageResponseTime = 0;
      stat.successRate = 0;
      stat.lastUsed = 0;
      stat.consecutiveFailures = 0;
    });
    console.log('🔄 Proxy performance stats reset');
  }
}

// Global proxy tracker instance
const proxyTracker = new ProxyPerformanceTracker();

/**
 * Amazon Data Fetching Service - Speed Optimized
 * 
 * Responsibilities:
 * - Extract book information from Amazon product pages
 * - Handle CORS restrictions via parallel proxy attempts
 * - Parse HTML content to extract title, author, image, and review count
 * - Provide fallback mechanisms for reliable data extraction
 * 
 * Speed Optimizations:
 * - Parallel proxy processing with Promise.race() for first-success
 * - Reduced timeout to 4 seconds per proxy
 * - Intelligent proxy prioritization based on past performance
 * - Streamlined error handling and reduced logging
 */
async function handleAmazonDataFetch(url) {
  const fetchStartTime = Date.now();
  
  // Normalize URL first
  const normalizedUrl = normalizeAmazonUrl(url);
  if (!normalizedUrl) {
    throw new Error('Invalid Amazon URL - could not normalize');
  }
  
  console.log('⚡ Speed-optimized fetch for:', normalizedUrl);
  
  // Check cache first - this could save significant time
  const cachedData = amazonDataCache.get(normalizedUrl);
  if (cachedData) {
    const totalDuration = Date.now() - fetchStartTime;
    console.log(`🚀 Cache hit! Returned in ${totalDuration}ms`);
    return cachedData;
  }

  try {
    // Use dynamically optimized proxy list based on performance
    const proxies = proxyTracker.getOptimizedProxyList();
    
    console.log(`🚀 Starting Amazon fetch with ${proxies.length} proxies:`, proxies.map(p => p.split('/')[2]));
    
    // Create parallel fetch promises with dynamic timeouts
    const createProxyFetch = (proxy, index) => {
      return new Promise(async (resolve, reject) => {
        const proxyStartTime = Date.now();
        const controller = new AbortController();
        
        // Use shorter timeout for faster failure detection
        const dynamicTimeout = Math.min(8000, proxyTracker.getRecommendedTimeout(proxy));
        const timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error(`Timeout after ${dynamicTimeout}ms`));
        }, dynamicTimeout);
        
        try {
          const proxyUrl = proxy + encodeURIComponent(normalizedUrl);
          
          const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
              'Cache-Control': 'no-cache'
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          // Handle different proxy response formats
          let data, htmlContent;
          const contentType = response.headers.get('content-type');
          
          if (contentType && contentType.includes('application/json')) {
            data = await response.json();
            htmlContent = data.contents || data.response || data.data || data;
          } else {
            htmlContent = await response.text();
          }
          
          // Quick validation
          if (htmlContent && typeof htmlContent === 'string' && htmlContent.length > 1000) {
            const isAmazonPage = htmlContent.includes('productTitle') || 
                                htmlContent.includes('amazon') || 
                                htmlContent.includes('<title>');
            
            if (isAmazonPage) {
              const duration = Date.now() - proxyStartTime;
              console.log(`✅ Proxy ${index + 1} succeeded in ${duration}ms`);
              
              // Record successful proxy performance
              proxyTracker.recordAttempt(proxy, true, duration);
              
              resolve({ htmlContent, proxy, duration, index });
            } else {
              reject(new Error('Not Amazon page'));
            }
          } else {
            reject(new Error('Insufficient content'));
          }
        } catch (error) {
          clearTimeout(timeoutId);
          
          // Record failed proxy performance
          const duration = Date.now() - proxyStartTime;
          
          // Enhanced error context for main proxy attempts
          const proxyErrorContext = {
            proxy: proxy.split('/')[2],
            index,
            duration,
            errorType: error?.name || typeof error,
            errorMessage: error?.message || String(error),
            isTimeout: error?.name === 'AbortError',
            timestamp: Date.now()
          };
          
          console.warn('Main proxy attempt failed:', JSON.stringify(proxyErrorContext, null, 2));
          proxyTracker.recordAttempt(proxy, false, duration);
          
          reject(new Error(`${proxy.split('/')[2]}: ${error?.message || String(error)}`));
        }
      });
    };
    
    // Launch all proxy attempts in parallel
    const proxyPromises = proxies.map(createProxyFetch);
    
    // Strategy 1: Race for the first successful response with timeout
    let result = null;
    try {
      console.log(`🚀 Racing ${proxies.length} proxies in parallel...`);
      
      // Add overall race timeout of 15 seconds
      const raceWithTimeout = Promise.race([
        Promise.race(proxyPromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Overall race timeout')), 15000)
        )
      ]);
      
      result = await raceWithTimeout;
      console.log(`🏆 First success: Proxy ${result.index + 1} in ${result.duration}ms`);
    } catch (raceError) {
      console.log('⚠️ Race failed, trying quick fallback...');
      
      // Log race error details
      const raceErrorContext = {
        raceError: raceError?.message || String(raceError),
        raceErrorType: raceError?.name || typeof raceError,
        duration: Date.now() - fetchStartTime,
        proxiesInRace: proxies.length,
        timestamp: new Date().toISOString()
      };
      console.warn('Race error details:', JSON.stringify(raceErrorContext, null, 2));
      
      // Strategy 2: Quick fallback - try first 3 proxies with shorter timeout
      const quickPromises = proxies.slice(0, 3).map((proxy, index) => {
        return new Promise(async (resolve, reject) => {
          const proxyStartTime = Date.now();
          const controller = new AbortController();
          
          // Very short timeout for quick fallback
          const timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error('Quick fallback timeout'));
          }, 5000);
          
          try {
            const proxyUrl = proxy + encodeURIComponent(normalizedUrl);
            const response = await fetch(proxyUrl, {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
                'Cache-Control': 'no-cache'
              },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
              let htmlContent;
              const contentType = response.headers.get('content-type');
              
              if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                htmlContent = data.contents || data.response || data.data || data;
              } else {
                htmlContent = await response.text();
              }
              
              if (htmlContent && typeof htmlContent === 'string' && htmlContent.length > 1000) {
                const duration = Date.now() - proxyStartTime;
                proxyTracker.recordAttempt(proxy, true, duration);
                resolve({ htmlContent, proxy, duration, index });
              } else {
                reject(new Error('Invalid content'));
              }
            } else {
              reject(new Error(`HTTP ${response.status}`));
            }
          } catch (error) {
            clearTimeout(timeoutId);
            const duration = Date.now() - proxyStartTime;
            
            // Enhanced error logging with context and better serialization
            const errorContext = {
              proxy: proxy.split('/')[2], // Just domain for logging
              proxyIndex: index,
              duration,
              errorType: error?.name || typeof error,
              errorMessage: error?.message?.substring(0, 100) || error?.toString?.() || String(error),
              isTimeout: error?.name === 'AbortError' || error?.message?.includes('timeout'),
              isNetworkError: error?.message?.includes('fetch') || error?.message?.includes('network'),
              statusCode: error?.status || null,
              timestamp: Date.now()
            };
            
            console.warn('Proxy request failed:', JSON.stringify(errorContext, null, 2));
            proxyTracker.recordAttempt(proxy, false, duration);
            reject(error);
          }
        });
      });
      
      try {
        result = await Promise.race(quickPromises);
        console.log(`🎯 Quick fallback success: Proxy ${result.index + 1}`);
      } catch (quickError) {
        // Enhanced error context for quick fallback failure
        const quickErrorContext = {
          quickError: quickError?.message || String(quickError),
          quickErrorType: quickError?.name || typeof quickError,
          totalDuration: Date.now() - fetchStartTime,
          proxiesAttempted: proxies.length,
          timestamp: new Date().toISOString()
        };
        console.error('Quick fallback failed with context:', JSON.stringify(quickErrorContext, null, 2));
        throw new Error(`All proxy attempts failed: ${quickError?.message || String(quickError)}`);
      }
    }
    
    if (!result?.htmlContent) {
      throw new Error('No valid content retrieved from any proxy');
    }
    
    const totalDuration = Date.now() - fetchStartTime;
    console.log(`⚡ Speed improvement: Total fetch completed in ${totalDuration}ms`);
    
    const bookData = parseAmazonHTML(result.htmlContent, normalizedUrl);
    bookData.normalizedUrl = normalizedUrl;
    bookData.fetchDurationMs = totalDuration;
    bookData.winningProxy = result.proxy;
    
    // Cache the successful result for future requests
    amazonDataCache.set(normalizedUrl, bookData);
    
    // Enhanced performance stats logging
    const cacheStats = amazonDataCache.getStats();
    const proxyStats = proxyTracker.getStats();
    console.log(`📊 Performance stats:`);
    console.log(`   Cache: ${cacheStats.size} entries, ${cacheStats.hitRate} hit rate`);
    console.log(`   Winning proxy: ${result.proxy.split('/')[2]} (${result.duration}ms)`);
    console.log(`   All proxy stats:`, JSON.stringify(proxyStats, null, 2));
    
    return bookData;
    
  } catch (error) {
    const totalDuration = Date.now() - fetchStartTime;
    
    // Enhanced error context for debugging with proper serialization
    const errorContext = {
      url: normalizedUrl?.substring(0, 50) + '...' || 'unknown',
      duration: totalDuration,
      errorType: error?.name || (typeof error),
      errorMessage: error?.message || error?.toString?.() || String(error),
      errorString: String(error),
      proxyStats: proxyTracker.getStats(),
      timestamp: new Date().toISOString(),
      stack: error?.stack?.substring(0, 300) || 'No stack trace'
    };
    
    // Better error logging with proper stringification
    console.error(`❌ Amazon scraping failed after ${totalDuration}ms:`, JSON.stringify(errorContext, null, 2));
    console.error('Raw error object:', error);
    
    // Create user-friendly error message based on error type
    let userMessage = 'Amazon商品ページからのデータ取得に失敗しました。手動でデータを入力してください。';
    
    if (totalDuration > 30000) {
      userMessage = 'タイムアウト: サーバーの応答が遅いため処理を中断しました。しばらく待ってから再試行してください。';
    } else if (error.message?.includes('proxy') || error.message?.includes('CORS')) {
      userMessage = 'ネットワークエラー: プロキシサーバーに接続できません。インターネット接続を確認してください。';
    } else if (error.message?.includes('parse') || error.message?.includes('extract')) {
      userMessage = 'データ解析エラー: Amazonページの構造が変更されている可能性があります。手動でデータを入力してください。';
    }
    
    throw new Error(userMessage + `\n技術詳細: ${error.message}`);
  }
}

/**
 * Parse Amazon HTML to extract book data - Speed Optimized
 * 
 * Optimizations:
 * - Reduced logging for faster execution
 * - Streamlined regex patterns with early returns
 * - Optimized text extraction with fewer replacements
 * - Pattern matching stops on first valid result
 */
function parseAmazonHTML(html, url) {
  const parseStartTime = Date.now();
  
  try {
    // Optimized helper function to extract text content
    function extractTextContent(htmlString) {
      if (!htmlString) return '';
      
      // Single-pass optimization: combine multiple replacements
      return htmlString
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&(?:nbsp|#160);/g, ' ') // Non-breaking spaces
        .replace(/&(?:quot|#34);/g, '"') // Quotes
        .replace(/&(?:amp|#38);/g, '&') // Ampersands  
        .replace(/&(?:lt|#60);/g, '<') // Less than
        .replace(/&(?:gt|#62);/g, '>') // Greater than
        .replace(/&(?:#39|#x27);/g, "'") // Apostrophes
        .replace(/&(?:mdash|#8212);/g, '—') // Em dash
        .replace(/&(?:ndash|#8211);/g, '–') // En dash
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    }
    
    // Enhanced pattern matcher with detailed debugging for author extraction
    function findBySelector(html, selectorPatterns, contentType = 'general') {
      for (let i = 0; i < selectorPatterns.length; i++) {
        const pattern = selectorPatterns[i];
        const match = html.match(pattern);
        
        if (match && match[1]) {
          const rawContent = match[1];
          let content = extractTextContent(rawContent)
            .replace(/\s*[-–|:]\s*Amazon.*$/i, '') // Remove Amazon suffix
            .trim();
          
          // Debug logging for author extraction
          if (contentType === 'author') {
            console.log(`🔍 Author pattern ${i + 1} matched:`, {
              patternSource: pattern.source.substring(0, 100) + '...',
              rawMatch: rawContent.substring(0, 100),
              extractedText: content.substring(0, 100),
              textLength: content.length
            });
            
            const originalContent = content;
            content = cleanAuthorName(content);
            
            console.log(`🧹 Author cleaning result:`, {
              before: originalContent,
              after: content,
              isValid: !!content && content.length >= 2
            });
            
            // Basic filtering only for obvious non-author content
            if (!content || content.length < 2 || 
                /^(follow|フォロー|amazon|kindle|error|not found)$/i.test(content)) {
              console.log(`❌ Skipping invalid author content: "${content}"`);
              continue;
            }
          }
          
          // Quick validation
          if (content.length >= 2 && content.length <= 300 && 
              !/^(amazon|kindle|book|title|error|not found)$/i.test(content)) {
            if (contentType === 'author') {
              console.log(`✅ Selected author: "${content}"`);
            }
            return content;
          }
        }
      }
      
      if (contentType === 'author') {
        console.log('❌ No valid author found with any pattern');
      }
      
      return null;
    }
    
    // Enhanced author name cleaning function with Japanese follow pattern handling
    function cleanAuthorName(authorText) {
      if (!authorText) return '';
      
      console.log(`🧹 Cleaning author text: "${authorText}"`);
      
      // Handle Japanese "をフォロー" patterns - extract author name before "をフォロー"
      if (authorText.includes('をフォロー')) {
        console.log('📝 Found "をフォロー" pattern, extracting author name');
        const beforeFollow = authorText.split('をフォロー')[0].trim();
        if (beforeFollow && beforeFollow.length > 1) {
          console.log(`📝 Extracted before "をフォロー": "${beforeFollow}"`);
          authorText = beforeFollow;
        } else {
          console.log('❌ No valid author name found before "をフォロー"');
          return '';
        }
      }
      
      let cleaned = authorText
        // Remove common prefixes/suffixes
        .replace(/^(by\s+|著者[：:]?\s*|作者[：:]?\s*|著[：:]?\s*)/i, '')
        .replace(/(\s*\(.*?\)\s*|\s*【.*?】\s*)$/, '') // Remove parenthetical info
        .replace(/\s*,.*$/, '') // Remove anything after comma
        .replace(/\s*\|\s*.*$/, '') // Remove anything after pipe
        .replace(/\s+/g, ' ') // Normalize spaces
        .replace(/^["''""]|["''""]$/g, '') // Remove quotes
        // Remove any remaining follow-related suffixes
        .replace(/\s*(をフォロー|をフォロー中|フォロー|follow|following)\s*$/i, '')
        .trim();
      
      console.log(`🧹 After basic cleaning: "${cleaned}"`);
      
      // Keep basic filtering but remove overly strict patterns
      const invalidPatterns = [
        /^(follow|フォロー|をフォロー|see all|すべて見る|more|もっと見る|visit|amazon|kindle)$/i,
        /^[0-9\s\+\-\(\)]+$/, // Only numbers and symbols
        /^[a-z]{1,3}$/i, // Very short single words like "by", "to", etc.
        /^(see|click|read|view|visit|follow|buy|shop)(\s|$)/i, // Action verbs
        // Only filter out obvious sentence fragments, not all Japanese patterns
        /[。？！]/, // Contains Japanese punctuation (obvious sentences)
        /^.*(という学問|時間を費やして|勉強してきた|わかったこと).*$/i // Very specific sentence patterns only
      ];
      
      for (const pattern of invalidPatterns) {
        if (pattern.test(cleaned)) {
          console.log(`❌ Rejected by invalid pattern: ${pattern}`);
          return ''; // Return empty string to indicate invalid author name
        }
      }
      
      console.log(`✅ Final cleaned author: "${cleaned}"`);
      return cleaned;
    }
    
    // Extract title - prioritized patterns for speed
    const titlePatterns = [
      /<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/i,
      /<h1[^>]*class="[^"]*a-size-large[^"]*"[^>]*>([^<]+)<\/h1>/i,
      /<title>\s*([^<]+?)\s*[-–|:]\s*Amazon/i,
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<h1[^>]*>([^<]+)<\/h1>/i
    ];
    
    const title = findBySelector(html, titlePatterns, 3); // Limit to first 3 attempts
    
    // Extract authors - collect multiple names and join with '、'
    function extractAuthors(allHtml) {
      const authors = [];
      const pushAuthor = (name) => {
        if (!name) return;
        const parts = String(name)
          .split(/\s*[、,，&＆／\/]|\s*・\s*/)
          .map(s => s && s.trim())
          .filter(Boolean);
        const tokens = parts.length ? parts : [String(name).trim()];
        for (const t of tokens) {
          const cleaned = cleanAuthorName(t);
          if (!cleaned || cleaned.length < 2) continue;
          const key = cleaned.replace(/\s+/g, '').toLowerCase();
          if (!authors.some(a => a.key === key)) authors.push({ key, name: cleaned });
        }
      };

      // 1) Build a bounded byline region around id="bylineInfo" (avoid global false positives)
      let region = '';
      const idxByline = allHtml.indexOf('id="bylineInfo"');
      if (idxByline !== -1) {
        region = allHtml.slice(Math.max(0, idxByline - 200), idxByline + 2000);
      } else {
        const idxFeature = allHtml.indexOf('bylineInfo_feature_div');
        if (idxFeature !== -1) region = allHtml.slice(Math.max(0, idxFeature - 200), idxFeature + 3000);
        else region = allHtml; // last resort only
      }
      // Optimize HTML cleaning - use single regex with alternation to reduce string operations
      const cleanRegex = /<[^>]*data-action="follow"[^>]*>[\s\S]*?<\/[^>]*>|<a[^>]*aria-label="[^"]*(?:フォロー|follow)[^"]*"[^>]*>[\s\S]*?<\/a>|<a[^>]*>[\s\S]*?(?:をフォロー|フォロー|follow)[\s\S]*?<\/a>/ig;
      const workHtml = region.replace(cleanRegex, '');

      // 2) Anchors that are likely author names - safe iteration to prevent infinite loops
      const anchorRegexes = [
        /<a[^>]*class="[^"]*contributorNameID[^"]*"[^>]*>([\s\S]*?)<\/a>/ig,
        /<a[^>]*class="[^"]*(?:by-author|author)[^"]*"[^>]*>([\s\S]*?)<\/a>/ig
      ];
      for (const rx of anchorRegexes) {
        // Use matchAll instead of exec() loop to prevent infinite loop issues
        try {
          const matches = [...workHtml.matchAll(rx)];
          for (const match of matches) {
            if (match && match[1]) {
              pushAuthor(extractTextContent(match[1]));
            }
          }
        } catch (e) {
          console.warn('Regex matching failed for anchor patterns:', e);
        }
      }

      // 3) Span wrappers around anchors (author notFaded etc.) - safe iteration
      const spanBlockRegexes = [
        /<span[^>]*class="[^"]*author[^"]*"[^>]*>([\s\S]*?)<\/span>/ig
      ];
      for (const rx of spanBlockRegexes) {
        try {
          const spanMatches = [...workHtml.matchAll(rx)];
          for (const spanMatch of spanMatches) {
            if (spanMatch && spanMatch[1]) {
              const inner = spanMatch[1];
              const innerAnchor = /<a[^>]*>([\s\S]*?)<\/a>/ig;
              try {
                const anchorMatches = [...inner.matchAll(innerAnchor)];
                for (const anchorMatch of anchorMatches) {
                  if (anchorMatch && anchorMatch[1]) {
                    pushAuthor(extractTextContent(anchorMatch[1]));
                  }
                }
              } catch (e) {
                console.warn('Inner anchor matching failed:', e);
              }
            }
          }
        } catch (e) {
          console.warn('Span block regex matching failed:', e);
        }
      }

      // 3b) Last-resort within byline: any anchors not containing follow text - safe iteration
      if (authors.length === 0 && region.includes('id="bylineInfo"')) {
        try {
          const bylineMatch = region.match(/id="bylineInfo"[^>]*>([\s\S]{0,1500})/);
          const bylineHtml = bylineMatch ? bylineMatch[1] : '';
          if (bylineHtml) {
            const anyAnchor = /<a[^>]*>([\s\S]*?)<\/a>/ig;
            const anchorMatches = [...bylineHtml.matchAll(anyAnchor)];
            for (const match of anchorMatches) {
              if (match && match[1]) {
                const text = extractTextContent(match[1]);
                if (!text) continue;
                if (/フォロー|follow/i.test(text)) continue;
                pushAuthor(text);
              }
            }
          }
        } catch (e) {
          console.warn('Byline anchor extraction failed:', e);
        }
      }

      // Debug logging when nothing found
      if (authors.length === 0) {
        try { console.log('Author debug: no author anchors in bounded byline region. snippet:', region.substring(0, 160)); } catch {}
      }

      // 4) Meta tag fallback
      const metaMatch = allHtml.match(/<meta[^>]*name="author"[^>]*content="([^"]+)"[^>]*>/i);
      if (metaMatch && metaMatch[1]) pushAuthor(metaMatch[1]);

      // 5) JSON-LD fallback - safe iteration and improved error handling
      try {
        const scriptRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/ig;
        const scriptMatches = [...allHtml.matchAll(scriptRegex)];
        for (const scriptMatch of scriptMatches) {
          if (!scriptMatch || !scriptMatch[1]) continue;
          const jsonText = scriptMatch[1].trim();
          if (!jsonText) continue;
          
          try {
            const data = JSON.parse(jsonText);
            const nodes = Array.isArray(data) ? data : [data];
            for (const node of nodes) {
              if (!node || typeof node !== 'object') continue;
              const a = node.author || node.authors;
              if (!a) continue;
              
              if (typeof a === 'string') {
                pushAuthor(a);
              } else if (Array.isArray(a)) {
                for (const entry of a) {
                  if (!entry) continue;
                  if (typeof entry === 'string') {
                    pushAuthor(entry);
                  } else if (entry && typeof entry === 'object' && entry.name) {
                    pushAuthor(entry.name);
                  }
                }
              } else if (typeof a === 'object' && a.name) {
                pushAuthor(a.name);
              }
            }
          } catch (parseError) {
            console.warn('JSON-LD parsing failed:', parseError.message.substring(0, 100));
          }
        }
      } catch (e) {
        console.warn('JSON-LD extraction failed:', e.message);
      }

      const authorNames = authors.map(a => a.name);
      
      // Clear references for memory efficiency
      authors.length = 0;
      
      return authorNames;
    }

    let authors = extractAuthors(html);
    let author = authors.length ? authors.join('、') : null;
    
    // Clear authors array after use
    authors = null;
    
    // Extract image URL - robust and precise for product images
    let imageUrl = null;

    // 0) Limit search to product image region to avoid ads/banners
    const imageRegionCandidates = [
      'id="imgTagWrapperId"',
      'id="ebooksImageBlock"',
      'id="imageBlock"',
      'id="main-image-container"',
      'imageGallery'
    ];
    let imageRegion = '';
    for (const marker of imageRegionCandidates) {
      const idx = html.indexOf(marker);
      if (idx !== -1) { imageRegion = html.slice(Math.max(0, idx - 500), idx + 5000); break; }
    }
    if (!imageRegion) imageRegion = html; // fallback

    const isLikelyCover = (url) => {
      if (!url) return false;
      const u = url.replace(/&amp;/g, '&');
      if (!/\.(jpg|jpeg|png)(?:[?#].*)?$/i.test(u)) return false;
      if (!/\/images\/I\//.test(u)) return false; // prefer product images path
      if (/Digital_Video|svod|PrimeVideo|\/images\/G\//i.test(u)) return false; // likely banner
      return true;
    };

    // 1) data-a-dynamic-image JSON on product image
    if (!imageUrl) {
      const dynImgMatch = imageRegion.match(/data-a-dynamic-image\s*=\s*'([^']+)'/i) ||
                          imageRegion.match(/data-a-dynamic-image\s*=\s*"([^"]+)"/i);
      if (dynImgMatch && dynImgMatch[1]) {
        try {
          const jsonText = dynImgMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
          const obj = JSON.parse(jsonText);
          let best = null, bestArea = 0;
          for (const [urlStr, size] of Object.entries(obj)) {
            const area = Array.isArray(size) && size.length >= 2 ? (Number(size[0]) * Number(size[1])) : 0;
            if (isLikelyCover(urlStr) && area >= bestArea) { bestArea = area; best = urlStr; }
          }
          if (best) imageUrl = String(best).replace(/&amp;/g, '&');
        } catch {}
      }
    }

    // 2) High-res attribute
    if (!imageUrl) {
      const hiresMatch = imageRegion.match(/data-old-hires=\"([^\"]+)\"/i);
      if (hiresMatch && isLikelyCover(hiresMatch[1])) imageUrl = hiresMatch[1].replace(/&amp;/g, '&');
    }

    // 3) Common ids/classes
    if (!imageUrl) {
      const idMatch = imageRegion.match(/<img[^>]*id=\"(?:landingImage|imgBlkFront|ebooksImgBlkFront)\"[^>]*(?:src|data-src)=\"([^\"]+)\"/i);
      if (idMatch && isLikelyCover(idMatch[1])) imageUrl = idMatch[1].replace(/&amp;/g, '&');
    }
    if (!imageUrl) {
      const clsMatch = imageRegion.match(/<img[^>]*class=\"[^\"]*(?:a-dynamic-image|frontImage)\"[^>]*src=\"([^\"]+)\"/i);
      if (clsMatch && isLikelyCover(clsMatch[1])) imageUrl = clsMatch[1].replace(/&amp;/g, '&');
    }

    // 4) og:image
    if (!imageUrl) {
      const ogMatch = html.match(/<meta[^>]*property=\"og:image\"[^>]*content=\"([^\"]+)\"[^>]*>/i);
      if (ogMatch && isLikelyCover(ogMatch[1])) imageUrl = ogMatch[1].replace(/&amp;/g, '&');
    }

    // 5) Conservative generic fallback restricted to /images/I/
    if (!imageUrl) {
      const anyMatch = imageRegion.match(/src=\"([^\"]*\/images\/I\/[^\"]*\.(?:jpg|jpeg|png)[^\"]*)\"/i);
      if (anyMatch && isLikelyCover(anyMatch[1])) imageUrl = anyMatch[1].replace(/&amp;/g, '&');
    }
    
    // Extract review count - streamlined for speed
    const reviewPatterns = [
      /<[^>]*data-hook="total-review-count"[^>]*>([^<]*)<\/[^>]*>/i,
      /<a[^>]*href="[^"]*#customerReviews[^"]*"[^>]*>([^<]*\d[^<]*)<\/a>/i,
      /([0-9,\d]+)[\s]*(?:個の評価|件のレビュー)/i,
      /<[^>]*class="[^"]*cr-widget-ACR[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*a-size-base[^"]*"[^>]*>([^<]*)<\/[^>]*>/i
    ];
    
    let reviewCount = 0;
    
    // Quick search for review count
    for (const pattern of reviewPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const text = extractTextContent(match[1]);
        const numberMatch = text.match(/(\d{1,3}(?:,\d{3})*|\d+)/);
        if (numberMatch) {
          reviewCount = parseInt(numberMatch[1].replace(/,/g, ''));
          if (reviewCount > 0) break; // Take first valid number found
        }
      }
    }
    
    // Final validation
    if (!title || title.length < 2) {
      throw new Error('Amazon商品ページからタイトルを抽出できませんでした。');
    }
    
    const parseDuration = Date.now() - parseStartTime;
    console.log(`🔍 HTML parsing completed in ${parseDuration}ms`);
    
    return {
      title: title,
      author: author || '著者不明',
      imageUrl: imageUrl,
      currentReviews: reviewCount,
      extractedFrom: url,
      extractionTime: new Date().toISOString(),
      parseDurationMs: parseDuration
    };
    
  } catch (error) {
    console.error('❌ HTML parsing failed:', error.message);
    throw error;
  }
}


/**
 * URL normalization - Extract ASIN and create clean URL (enhanced error handling)
 */
function normalizeAmazonUrl(url) {
  try {
    console.log('Background: Attempting to normalize URL:', url, 'Type:', typeof url, 'Length:', url?.length);
    
    // Input validation
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      console.error('Background: Invalid URL input:', url);
      return null;
    }
    
    const trimmedUrl = url.trim();
    
    // Add protocol if missing
    let fullUrl = trimmedUrl;
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      fullUrl = 'https://' + trimmedUrl;
      console.log('Background: Added https protocol:', fullUrl);
    }
    
    const urlObj = new URL(fullUrl);
    
    // Amazon hostname validation
    const amazonHosts = [
      'amazon.co.jp', 'amazon.com', 'amazon.ca', 'amazon.co.uk',
      'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es',
      'www.amazon.co.jp', 'www.amazon.com', 'www.amazon.ca', 'www.amazon.co.uk',
      'www.amazon.de', 'www.amazon.fr', 'www.amazon.it', 'www.amazon.es'
    ];
    
    const isAmazonHost = amazonHosts.some(host => 
      urlObj.hostname === host || urlObj.hostname.endsWith('.' + host)
    );
    
    if (!isAmazonHost) {
      console.log('Background: Invalid Amazon host:', urlObj.hostname);
      return null;
    }
    
    // Extract ASIN from various URL patterns
    const asinPatterns = [
      /\/dp\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,           // /dp/XXXXXXXXXX
      /\/product\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,      // /product/XXXXXXXXXX
      /\/gp\/product\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,  // /gp/product/XXXXXXXXXX
      /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:\/|$|\?|#)/i, // /exec/obidos/ASIN/XXXXXXXXXX
      /\/o\/ASIN\/([A-Z0-9]{10})(?:\/|$|\?|#)/i       // /o/ASIN/XXXXXXXXXX
    ];
    
    let asin = null;
    for (const pattern of asinPatterns) {
      const match = fullUrl.match(pattern);
      if (match) {
        asin = match[1];
        console.log('Background: Found ASIN:', asin, 'with pattern:', pattern.source);
        break;
      }
    }
    
    if (!asin) {
      console.log('Background: No valid ASIN found in URL:', fullUrl);
      return null;
    }
    
    // Construct clean Amazon URL
    const cleanUrl = `https://${urlObj.hostname}/dp/${asin}`;
    
    console.log('Background URL normalization successful:', {
      original: url,
      processed: fullUrl,
      normalized: cleanUrl,
      asin: asin,
      hostname: urlObj.hostname
    });
    
    return cleanUrl;
    
  } catch (error) {
    console.error('Background URL normalization error:', error);
    console.error('Background failed URL details:', {
      input: url,
      type: typeof url,
      length: url?.length,
      charCodes: url ? Array.from(url).map(c => c.charCodeAt(0)).slice(0, 20) : null
    });
    return null;
  }
}


// ============================================================================
// IMAGE GENERATION SERVICE
// ============================================================================

/**
 * Image Export Service
 * 
 * Responsibilities:
 * - Create progress visualization images for social media sharing
 * - Manage tab-based image generation process
 * - Handle data transfer between popup and image generator
 * - Coordinate with social media sharing workflows
 * 
 * Process:
 * 1. Receive image generation request from popup
 * 2. Store data in Chrome storage for image generator access
 * 3. Create image generation tab with encoded data
 * 4. Return success status to popup
 */
async function handleImageExport(data) {
  try {
    console.log('Starting image export with data:', data);
    
    // Method 1: Store data in chrome.storage for the image page to access
    await chrome.storage.local.set({ 'pendingImageData': data });
    console.log('Stored data in chrome.storage');
    
    // Method 2: Create URL with encoded data as backup
    const encodedData = encodeURIComponent(JSON.stringify(data));
    const imagePageUrl = chrome.runtime.getURL(`popup/image-generator.html?data=${encodedData}`);
    
    // Create a new tab with the image generation page
    const imageTab = await chrome.tabs.create({
      url: imagePageUrl,
      active: true // Make it active so user can see the generation process
    });

    console.log('Created image generation tab:', imageTab.id);

    // No need to send messages to the tab.
    // Image page reads data from query param and/or chrome.storage.local ('pendingImageData').
    return { success: true, tabId: imageTab.id };
  } catch (error) {
    console.error('Image export failed:', error);
    throw new Error(`画像生成に失敗しました: ${error.message}`);
  }
}

// ============================================================================
// SOCIAL MEDIA INTEGRATION SERVICE
// ============================================================================

/**
 * X (Twitter) Share with Image Service
 * 
 * Responsibilities:
 * - Coordinate image generation and X tweet composition
 * - Manage cross-tab communication for image attachment
 * - Handle automatic image transfer to X compose interface
 * - Provide fallback mechanisms for manual image attachment
 * 
 * Architecture:
 * - Dual-tab system (X compose + image generation)
 * - Direct data URL transfer bypassing clipboard restrictions
 * - Content script injection for robust image attachment
 * - Retry mechanism with multiple attachment methods
 * 
 * Process Flow:
 * 1. Create X compose tab with tweet text
 * 2. Generate image in background tab
 * 3. Transfer image data to X tab via content script
 * 4. Attempt automatic image attachment
 * 5. Cleanup temporary resources
 */

// Global variable to track pending X share requests
let pendingXShare = null;

async function trySendImageToTweetTab(maxAttempts = 20, delayMs = 1000) {
  const snapshot = pendingXShare ? {
    tweetTabId: pendingXShare.tweetTabId,
    dataUrl: pendingXShare.dataUrl,
    imageTabId: pendingXShare.imageTabId,
    imageSent: !!pendingXShare.imageSent,
  } : null;
  
  console.log('trySendImageToTweetTab called:', {
    hasPendingXShare: !!pendingXShare,
    tweetTabId: snapshot?.tweetTabId,
    hasDataUrl: !!snapshot?.dataUrl,
    dataUrlLength: snapshot?.dataUrl?.length,
    imageSent: !!snapshot?.imageSent
  });

  if (!snapshot?.tweetTabId || !snapshot?.dataUrl) {
    console.warn('Cannot send image to tweet tab - missing required data');
    return false;
  }
  
  if (snapshot.imageSent) {
    console.log('Image already sent, skipping duplicate send attempt');
    return true;
  }
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      console.log(`Attempt ${i + 1}/${maxAttempts} to send image to tweet tab ${snapshot.tweetTabId}`);
      
      // Progressive delay: start quickly, then increase delay
      const currentDelay = i === 0 ? 0 : Math.min(delayMs + (i * 200), 2000);
      if (currentDelay > 0) {
        await new Promise(r => setTimeout(r, currentDelay));
      }
      
      // Get current tab info for debugging
      const tabInfo = await new Promise((resolve) => {
        chrome.tabs.get(snapshot.tweetTabId, (tab) => {
          if (chrome.runtime.lastError) {
            console.warn('Tab query failed:', chrome.runtime.lastError.message);
            return resolve(null);
          }
          resolve(tab);
        });
      });
      
      if (!tabInfo) {
        console.warn('Tweet tab no longer exists');
        continue;
      }
      
      console.log(`Attempt ${i + 1}: Tab status - URL: ${tabInfo.url}, Loading: ${tabInfo.status}`);
      
      // Check if tab is still loading
      if (tabInfo.status === 'loading') {
        console.log('Tab still loading, will retry');
        continue;
      }
      
      // Validate URL
      const isValidUrl = /^https:\/\/(?:mobile\.)?(?:x|twitter)\.com\//.test(tabInfo.url);
      if (!isValidUrl) {
        console.warn('Tweet tab URL not valid for attachment:', tabInfo.url);
        continue;
      }
      
      // Enhanced content script injection with multiple attempts and better timing
      let contentScriptReady = false;
      for (let pingAttempt = 0; pingAttempt < 5; pingAttempt++) {
        console.log(`Ping/inject attempt ${pingAttempt + 1}/5`);
        
        // Always try injection first (idempotent operation)
        if (chrome?.scripting?.executeScript) {
          try {
            console.log(`Injecting content script (attempt ${pingAttempt + 1})`);
            await chrome.scripting.executeScript({
              target: { tabId: snapshot.tweetTabId },
              files: ['content-scripts/x-tweet-auto-attach.js']
            });
            
            // Wait progressively longer for script initialization
            const initWait = Math.min(1000 + (pingAttempt * 500), 3000);
            console.log(`Waiting ${initWait}ms for content script initialization`);
            await new Promise(r => setTimeout(r, initWait));
          } catch (injectionError) {
            console.warn(`Content script injection failed (attempt ${pingAttempt + 1}):`, injectionError.message);
            
            // If tab doesn't exist, abort immediately
            if (injectionError.message.includes('No tab with id')) {
              console.error('Tweet tab no longer exists, aborting');
              throw new Error('Tweet tab was closed');
            }
            
            // Continue with ping even if injection failed
          }
        }
        
        // Test if content script is responsive with longer timeout
        const pingResult = await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            console.log(`Ping timeout after 5 seconds (attempt ${pingAttempt + 1})`);
            resolve(false);
          }, 5000);
          
          chrome.tabs.sendMessage(snapshot.tweetTabId, { action: 'krmPing' }, (resp) => {
            clearTimeout(timeout);
            const success = !chrome.runtime.lastError && resp?.pong;
            console.log(`Ping attempt ${pingAttempt + 1}:`, { 
              success, 
              response: resp, 
              error: chrome.runtime.lastError?.message 
            });
            resolve(success);
          });
        });
        
        if (pingResult) {
          console.log('✅ Content script is ready and responding');
          contentScriptReady = true;
          break;
        }
        
        // Exponential backoff between attempts
        if (pingAttempt < 4) { // Don't wait after last attempt
          const waitTime = Math.min(1000 * Math.pow(2, pingAttempt), 4000);
          console.log(`❌ Ping failed, waiting ${waitTime}ms before retry`);
          await new Promise(r => setTimeout(r, waitTime));
        }
      }
      
      if (!contentScriptReady) {
        console.warn(`⚠️ Content script not ready after 5 ping attempts, will try attachment anyway`);
      }

      // Attempt image attachment with enhanced error handling and connection check
      console.log('🎯 Attempting image attachment...');
      const attachResult = await new Promise((resolve, reject) => {
        let responseReceived = false;
        
        const timeout = setTimeout(() => {
          if (!responseReceived) {
            console.error('🔥 Image attachment timed out after 45 seconds');
            reject(new Error('Image attachment timeout after 45 seconds'));
          }
        }, 45000); // Reduced to 45 seconds for faster failure detection
        
        try {
          // Check if tab still exists before sending message
          chrome.tabs.get(snapshot.tweetTabId, (tab) => {
            if (chrome.runtime.lastError) {
              clearTimeout(timeout);
              console.error('❌ Tweet tab no longer exists:', chrome.runtime.lastError.message);
              return reject(new Error('Tweet tab was closed or inaccessible'));
            }
            
            console.log('📤 Sending attachment message to tab:', tab.url);
            
            chrome.tabs.sendMessage(snapshot.tweetTabId, {
              action: 'attachImageDataUrl',
              dataUrl: snapshot.dataUrl
            }, (resp) => {
              responseReceived = true;
              clearTimeout(timeout);
              
              const lastError = chrome.runtime.lastError;
              console.log('📨 Attachment response received:', {
                response: resp,
                lastError: lastError?.message,
                timestamp: new Date().toISOString(),
                responseTime: Date.now()
              });
              
              if (lastError) {
                console.error('💥 Chrome runtime error during attachment:', lastError.message);
                
                // Handle specific error cases
                if (lastError.message.includes('message channel closed') || 
                    lastError.message.includes('receiving end does not exist')) {
                  return reject(new Error('Content script connection lost - tab may have navigated or refreshed'));
                }
                
                return reject(new Error(`Chrome runtime error: ${lastError.message}`));
              }
              
              // Handle null/undefined response (content script may have crashed)
              if (!resp) {
                console.warn('⚠️ Received null response from content script');
                return reject(new Error('Content script did not respond (may have crashed or been unloaded)'));
              }
              
              if (resp.ok) {
                console.log('✅ Content script confirmed successful image attachment');
                return resolve(true);
              }
              
              const errorMsg = resp.error || 'Unknown attachment error';
              console.error('❌ Content script attachment failed:', errorMsg);
              reject(new Error(`Content script attachment failed: ${errorMsg}`));
            });
          });
        } catch (sendError) {
          clearTimeout(timeout);
          console.error('💥 Failed to send attachment message:', sendError.message);
          reject(new Error(`Message send failed: ${sendError.message}`));
        }
      });

      if (attachResult) {
        console.log('🎉 Successfully sent image to tweet tab');
        
        // Cleanup image generation tab
        if (snapshot.imageTabId) {
          try { 
            console.log('🧹 Cleaning up image generation tab:', snapshot.imageTabId);
            await chrome.tabs.remove(snapshot.imageTabId); 
          } catch (cleanupError) {
            console.warn('⚠️ Failed to cleanup image tab:', cleanupError.message);
          }
        }
        
        // Mark as sent and clear state
        if (pendingXShare && pendingXShare.tweetTabId === snapshot.tweetTabId) {
          pendingXShare.imageSent = true;
          pendingXShare = null;
        }
        return true;
      }
    } catch (e) {
      console.error(`💥 Send attempt ${i+1} failed:`, {
        error: e.message,
        stack: e.stack,
        attempt: i + 1,
        maxAttempts
      });
      
      // Check if this is a fatal error that shouldn't be retried
      const fatalErrors = [
        'Tweet tab was closed',
        'No tab with id',
        'Cannot access'
      ];
      
      if (fatalErrors.some(fatal => e.message.includes(fatal))) {
        console.error('🛑 Fatal error detected, aborting all retry attempts');
        break;
      }
      
      // Wait before retry with exponential backoff
      if (i < maxAttempts - 1) {
        const retryDelay = Math.min(2000 * Math.pow(1.5, i), 10000);
        console.log(`⏳ Waiting ${retryDelay}ms before retry attempt ${i + 2}...`);
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }
  }
  
  console.error('💀 All attempts to send image to tweet tab failed after', maxAttempts, 'attempts');
  
  // Show user a helpful message about manual attachment
  if (typeof chrome !== 'undefined' && chrome.notifications) {
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Kindle Review Meter',
        message: '画像の自動添付に失敗しました。手動で画像をX投稿に添付してください。'
      });
    } catch (notifError) {
      console.warn('Failed to show notification:', notifError.message);
    }
  }
  
  if (pendingXShare) {
    pendingXShare.imageSent = false;
  }
  return false;
}

async function handleShareToXWithImage(data, tweetUrl) {
  try {
    console.log('🚀 Starting X share with image process');
    console.log('📊 Data:', data);
    console.log('🔗 Tweet URL:', tweetUrl);
    
    // Validate inputs
    if (!tweetUrl) {
      throw new Error('Tweet URL is required but not provided');
    }
    
    if (!data) {
      throw new Error('Data is required but not provided');
    }
    
    // First, open X tweet page immediately
    console.log('🌐 Creating X tweet tab...');
    const tweetTab = await chrome.tabs.create({
      url: tweetUrl,
      active: true
    });

    console.log('✅ Opened X tweet tab:', tweetTab.id, 'URL:', tweetTab.url);
    pendingXShare = { tweetTabId: tweetTab.id };
    
    // Then generate image in background and copy to clipboard
    await chrome.storage.local.set({ 'pendingImageData': data });
    console.log('Stored data in chrome.storage for image generation');
    
    // Create image generation page (will auto-close after generating)
    const encodedData = encodeURIComponent(JSON.stringify(data));
    const imagePageUrl = chrome.runtime.getURL(`popup/image-generator.html?data=${encodedData}&quickMode=true`);
    
    // Create image generation tab briefly in background
    const backgroundTab = await chrome.tabs.create({
      url: imagePageUrl,
      active: false // No need to focus; we'll relay the image directly
    });

    console.log('Created image generation tab:', backgroundTab.id);
    // Store image tab id for potential cleanup
    pendingXShare.imageTabId = backgroundTab.id;
    
    return { success: true, tweetTabId: tweetTab.id, imageTabId: backgroundTab.id };
  } catch (error) {
    console.error('X share with image failed:', error);
    throw new Error(`X投稿準備に失敗しました: ${error.message}`);
  }
}

// ============================================================================
// EXTENSION LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Extension Installation and Update Handler
 * 
 * Responsibilities:
 * - Initialize extension on first install
 * - Handle extension updates and migrations
 * - Create context menu items for Amazon links
 * - Set up right-click integration workflows
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Kindle Review Meter installed');
    
    // Create context menu for Amazon links
    if (chrome.contextMenus) {
      try {
        chrome.contextMenus.create({
          id: 'kindle-review-meter',
          title: 'Kindle Review Meter で分析',
          contexts: ['link'],
          targetUrlPatterns: ['*://*.amazon.co.jp/dp/*', '*://*.amazon.co.jp/gp/product/*']
        });
      } catch (error) {
        console.error('Context menu creation failed:', error);
      }
    }
  } else if (details.reason === 'update') {
    console.log('Kindle Review Meter updated to', chrome.runtime.getManifest().version);
  }
});

// Context menu click handler
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'kindle-review-meter') {
      // Context menus don't directly open popups, but we can store the URL
      chrome.storage.local.set({ 'pendingUrl': info.linkUrl });
    }
  });
}

// Debug helper functions for console testing (Development only)
if (typeof window !== 'undefined') {
  window.debugAmazonFetch = function(url) {
    console.log('🔍 Debug: Starting manual Amazon fetch for:', url);
    return handleAmazonDataFetch(url)
      .then(result => {
        console.log('✅ Debug: Fetch succeeded:', result);
        return result;
      })
      .catch(error => {
        console.error('❌ Debug: Fetch failed:', error);
        throw error;
      });
  };

  window.debugProxyStats = function() {
    const stats = proxyTracker.getStats();
    console.log('📊 Current proxy statistics:', JSON.stringify(stats, null, 2));
    return stats;
  };

  window.debugCacheStats = function() {
    const stats = amazonDataCache.getStats();
    console.log('💾 Current cache statistics:', stats);
    return stats;
  };

  console.log('🛠️ Debug functions loaded: debugAmazonFetch(), debugProxyStats(), debugCacheStats()');
}
