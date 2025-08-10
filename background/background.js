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
    handleShareToXWithImage(request.data, request.tweetUrl)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
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
      return 4000; // Default timeout
    }
    
    // Dynamic timeout: average response time + buffer
    // But keep within reasonable bounds (2-8 seconds)
    const dynamicTimeout = Math.min(8000, Math.max(2000, stat.averageResponseTime * 3));
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
    
    // Create parallel fetch promises with dynamic timeouts
    const createProxyFetch = (proxy, index) => {
      return new Promise(async (resolve, reject) => {
        const proxyStartTime = Date.now();
        const controller = new AbortController();
        
        // Use dynamic timeout based on proxy's historical performance
        const dynamicTimeout = proxyTracker.getRecommendedTimeout(proxy);
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
          proxyTracker.recordAttempt(proxy, false, duration);
          
          reject(new Error(`${proxy.split('/')[2]}: ${error.message}`));
        }
      });
    };
    
    // Launch all proxy attempts in parallel
    const proxyPromises = proxies.map(createProxyFetch);
    
    // Strategy 1: Race for the first successful response
    let result = null;
    try {
      console.log(`🚀 Racing ${proxies.length} proxies in parallel...`);
      result = await Promise.race(proxyPromises);
      console.log(`🏆 First success: Proxy ${result.index + 1} in ${result.duration}ms`);
    } catch (raceError) {
      console.log('⚠️ Race failed, trying Promise.allSettled fallback...');
      
      // Strategy 2: If race fails, wait for any successful completion
      const settled = await Promise.allSettled(proxyPromises);
      const successful = settled.find(p => p.status === 'fulfilled');
      
      if (successful) {
        result = successful.value;
        console.log(`🎯 Fallback success: Proxy ${result.index + 1}`);
      } else {
        const errors = settled
          .filter(p => p.status === 'rejected')
          .map((p, i) => `${i + 1}: ${p.reason.message}`)
          .join(', ');
        throw new Error(`All proxies failed: ${errors}`);
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
    
    // Log performance stats periodically
    const cacheStats = amazonDataCache.getStats();
    const proxyStats = proxyTracker.getStats();
    console.log(`📊 Performance stats:`);
    console.log(`   Cache: ${cacheStats.size} entries, ${cacheStats.hitRate} hit rate`);
    console.log(`   Top proxies:`, Object.entries(proxyStats).slice(0, 2).map(([name, stat]) => `${name}(${stat.successRate})`));
    
    return bookData;
    
  } catch (error) {
    const totalDuration = Date.now() - fetchStartTime;
    console.error(`❌ Amazon scraping failed after ${totalDuration}ms:`, error.message);
    
    throw new Error(`Amazon商品ページからのデータ取得に失敗しました。手動でデータを入力してください。: ${error.message}`);
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
            
            // Skip if it's clearly not an author name
            if (!content || content.length < 2 || 
                /^(follow|フォロー|amazon|kindle|book|title|error|not found|see all|すべて見る|をフォロー)$/i.test(content)) {
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
      
      // Additional filtering for common false positives
      const invalidPatterns = [
        /^(follow|フォロー|をフォロー|see all|すべて見る|more|もっと見る|visit|amazon|kindle)$/i,
        /^[0-9\s\+\-\(\)]+$/, // Only numbers and symbols
        /^[a-z]{1,3}$/i, // Very short single words like "by", "to", etc.
        /^(see|click|read|view|visit|follow|buy|shop)(\s|$)/i // Action verbs
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
    
    // Extract author - simplified and fast patterns (no global flags for speed)
    const authorPatterns = [
      // Most reliable: contributorNameID - this should catch most cases
      /<[^>]*class="[^"]*contributorNameID[^"]*"[^>]*>([^<]+)<\/[^>]*>/i,
      
      // [data-automation-id="byline"] a - reliable for many Amazon pages
      /<[^>]*data-automation-id="byline"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i,
      
      // .author .contributorNameID - full path pattern
      /<[^>]*class="[^"]*author[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*contributorNameID[^"]*"[^>]*>([^<]+)<\/[^>]*>/i,
      
      // .by-author a - common pattern
      /<[^>]*class="[^"]*by-author[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i,
      
      // .author a - general author link
      /<[^>]*class="[^"]*author[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i
    ];
    
    let author = findBySelector(html, authorPatterns, 'author');
    
    // Additional author extraction for Japanese pages (if first attempt failed)
    if (!author) {
      const japaneseAuthorPatterns = [
        /著[\s]*者[：:]?[\s]*([^<\n\r]{2,50})(?=<|\n|\r|$)/i,
        /作[\s]*者[：:]?[\s]*([^<\n\r]{2,50})(?=<|\n|\r|$)/i,
        /著[：:]?[\s]*([^<\n\r]{2,50})(?=<|\n|\r|$)/i
      ];
      author = findBySelector(html, japaneseAuthorPatterns, 'author');
    }
    
    // Extract image URL - optimized patterns
    const imagePatterns = [
      /<img[^>]*id="(?:landingImage|imgBlkFront|ebooksImgBlkFront)"[^>]*(?:src|data-src)="([^"]+)"/i,
      /<img[^>]*class="[^"]*(?:a-dynamic-image|frontImage)"[^>]*src="([^"]+)"/i,
      /src="([^"]*(?:images-amazon|ssl-images-amazon|media-amazon)[^"]*\.jpg[^"]*)"/i,
      /"(?:image|hiRes|large)":\s*"([^"]*amazon[^"]*\.jpg[^"]*)"/i
    ];
    
    let imageUrl = null;
    for (const pattern of imagePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let candidateUrl = match[1].replace(/&amp;/g, '&');
        
        // Quick validation
        if (candidateUrl.includes('amazon') && 
            !candidateUrl.includes('._SS') && 
            !candidateUrl.includes('._SX40') && 
            !candidateUrl.includes('favicon')) {
          imageUrl = candidateUrl;
          break;
        }
      }
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

async function trySendImageToTweetTab(maxAttempts = 12, delayMs = 800) {
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
      
      // Enhanced content script injection with multiple attempts
      let contentScriptReady = false;
      for (let pingAttempt = 0; pingAttempt < 3; pingAttempt++) {
        // Test if content script is responsive
        const pingResult = await new Promise((resolve) => {
          chrome.tabs.sendMessage(snapshot.tweetTabId, { action: 'krmPing' }, (resp) => {
            const success = !chrome.runtime.lastError && resp?.pong;
            console.log(`Ping attempt ${pingAttempt + 1}:`, { success, resp, error: chrome.runtime.lastError?.message });
            resolve(success);
          });
        });
        
        if (pingResult) {
          contentScriptReady = true;
          break;
        }
        
        // Inject content script if ping failed
        if (chrome?.scripting?.executeScript) {
          try {
            console.log(`Injecting content script (attempt ${pingAttempt + 1})`);
            await chrome.scripting.executeScript({
              target: { tabId: snapshot.tweetTabId },
              files: ['content-scripts/x-tweet-auto-attach.js']
            });
            await new Promise(r => setTimeout(r, 500)); // Give more time for initialization
          } catch (e) {
            console.warn(`Content script injection failed (attempt ${pingAttempt + 1}):`, e.message);
          }
        }
      }
      
      if (!contentScriptReady) {
        console.warn(`Content script not ready after 3 ping attempts, continuing anyway`);
      }

      // Attempt image attachment
      const attachResult = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Message timeout after 5 seconds'));
        }, 5000);
        
        chrome.tabs.sendMessage(snapshot.tweetTabId, {
          action: 'attachImageDataUrl',
          dataUrl: snapshot.dataUrl
        }, (resp) => {
          clearTimeout(timeout);
          console.log('Attachment response:', resp, 'lastError:', chrome.runtime.lastError?.message);
          
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          
          if (resp && resp.ok) {
            console.log('Content script confirmed successful attachment');
            return resolve(true);
          }
          
          reject(new Error(`Content script attachment failed: ${resp?.error || 'Unknown error'}`));
        });
      });

      if (attachResult) {
        console.log('Successfully sent image to tweet tab');
        
        // Cleanup image generation tab
        if (snapshot.imageTabId) {
          try { 
            console.log('Cleaning up image generation tab:', snapshot.imageTabId);
            await chrome.tabs.remove(snapshot.imageTabId); 
          } catch (e) {
            console.warn('Failed to cleanup image tab:', e);
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
      console.warn(`Send attempt ${i+1} failed:`, e.message);
    }
  }
  
  console.error('All attempts to send image to tweet tab failed');
  if (pendingXShare) {
    pendingXShare.imageSent = false;
  }
  return false;
}

async function handleShareToXWithImage(data, tweetUrl) {
  try {
    console.log('Starting X share with image, data:', data);
    
    // First, open X tweet page immediately
    const tweetTab = await chrome.tabs.create({
      url: tweetUrl,
      active: true
    });

    console.log('Opened X tweet tab:', tweetTab.id);
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
