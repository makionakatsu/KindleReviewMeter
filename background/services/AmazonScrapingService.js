/**
 * AmazonScrapingService - Amazon Data Fetching Service
 * 
 * Responsibilities:
 * - Orchestrate Amazon book data fetching with multiple proxy fallback
 * - Manage caching and performance optimization
 * - Handle URL normalization and validation
 * - Coordinate HTML parsing through AmazonHTMLParser
 * - Track proxy performance and optimize selection
 * 
 * Extracted from: handleAmazonDataFetch function (292 lines → organized service class)
 */

import AmazonHTMLParser from '../parsers/AmazonHTMLParser.js';
import MetadataExtractor from '../parsers/MetadataExtractor.js';

export default class AmazonScrapingService {
  constructor(cache, proxyTracker, errorHandler) {
    this.cache = cache;
    this.proxyTracker = proxyTracker;
    this.errorHandler = errorHandler;
    this.htmlParser = new AmazonHTMLParser();
    this.metadataExtractor = new MetadataExtractor();
    
    // Performance tracking
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      successfulFetches: 0,
      failedFetches: 0,
      averageResponseTime: 0
    };
  }

  /**
   * Main entry point - fetch Amazon book data with full optimization
   * @param {string} url - Amazon book URL
   * @returns {Promise<Object>} Parsed book data
   */
  async fetchBookData(url) {
    const fetchStartTime = Date.now();
    this.stats.totalRequests++;

    try {
      // 1. URL Normalization and Validation
      const normalizedUrl = this.normalizeUrl(url);
      if (!normalizedUrl) {
        throw new Error('Invalid Amazon URL - could not normalize');
      }

      console.log('⚡ Speed-optimized fetch for:', normalizedUrl);

      // 2. Cache Check
      const cachedData = this.cache.get(normalizedUrl);
      if (cachedData) {
        this.stats.cacheHits++;
        const totalDuration = Date.now() - fetchStartTime;
        console.log(`🚀 Cache hit! Returned in ${totalDuration}ms`);
        return cachedData;
      }

      // 3. Proxy-based HTML Fetching
      const html = await this.fetchHtmlWithProxies(normalizedUrl);

      // 4. HTML Parsing
      const bookData = this.htmlParser.parse(html, normalizedUrl);

      // 5. Metadata Extraction
      const metadata = this.metadataExtractor.extractAll(html, normalizedUrl);

      // 6. Combine Results
      const result = {
        ...bookData,
        metadata,
        fetchTime: Date.now() - fetchStartTime,
        source: 'amazon_scraping_service'
      };

      // 7. Cache Result
      this.cache.set(normalizedUrl, result);

      // 8. Update Statistics
      this.stats.successfulFetches++;
      this.updateAverageResponseTime(Date.now() - fetchStartTime);

      console.log(`✅ Amazon data fetched successfully in ${result.fetchTime}ms`);
      return result;

    } catch (error) {
      this.stats.failedFetches++;
      const errorInfo = this.errorHandler.handleAmazonFetchError(error, {
        url,
        normalizedUrl: this.normalizeUrl(url),
        fetchTime: Date.now() - fetchStartTime
      });
      throw error;
    }
  }

  /**
   * Fetch HTML content using optimized proxy system
   * @private
   * @param {string} url - Normalized Amazon URL
   * @returns {Promise<string>} HTML content
   */
  async fetchHtmlWithProxies(url) {
    // Get dynamically optimized proxy list
    const proxies = this.proxyTracker.getOptimizedProxyList();
    console.log(`🚀 Starting Amazon fetch with ${proxies.length} proxies:`, 
      proxies.map(p => p.split('/')[2]));

    // Create parallel fetch promises with dynamic timeouts
    const proxyPromises = proxies.map((proxy, index) => 
      this.createProxyFetch(proxy, url, index));

    try {
      // Race all proxies and return first successful result
      const result = await Promise.race(proxyPromises);
      console.log(`🎯 Fetch completed successfully with proxy: ${result.proxyUsed}`);
      return result.html;

    } catch (error) {
      console.error('❌ All proxy attempts failed');
      throw new Error(`Failed to fetch Amazon data after trying ${proxies.length} proxies: ${error.message}`);
    }
  }

  /**
   * Create individual proxy fetch promise
   * @private
   * @param {string} proxy - Proxy URL
   * @param {string} url - Target URL  
   * @param {number} index - Proxy index for tracking
   * @returns {Promise<Object>} Fetch result with HTML and metadata
   */
  createProxyFetch(proxy, url, index) {
    return new Promise(async (resolve, reject) => {
      const proxyStartTime = Date.now();
      const controller = new AbortController();
      
      try {
        // Dynamic timeout based on proxy performance history
        const baseTimeout = 8000;
        const proxyPerformance = this.proxyTracker.getProxyPerformance(proxy);
        const timeout = proxyPerformance.averageResponseTime > 0 
          ? Math.min(proxyPerformance.averageResponseTime * 2, baseTimeout)
          : baseTimeout;

        // Set timeout
        const timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error(`Proxy ${index + 1} timed out after ${timeout}ms`));
        }, timeout);

        console.log(`🌐 Proxy ${index + 1} starting (timeout: ${timeout}ms):`, proxy.split('/')[2]);

        // Construct proxy request
        const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
        
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        const responseTime = Date.now() - proxyStartTime;

        // Update proxy performance
        this.proxyTracker.recordSuccess(proxy, responseTime);

        // Basic validation of HTML content
        if (html.length < 1000 || !this.isValidAmazonHtml(html)) {
          throw new Error('Invalid or incomplete HTML response');
        }

        console.log(`✅ Proxy ${index + 1} succeeded in ${responseTime}ms`);

        resolve({
          html,
          proxyUsed: proxy,
          responseTime,
          htmlLength: html.length
        });

      } catch (error) {
        const responseTime = Date.now() - proxyStartTime;
        this.proxyTracker.recordFailure(proxy, error.message);
        
        console.log(`❌ Proxy ${index + 1} failed after ${responseTime}ms:`, error.message);
        reject(error);
      }
    });
  }

  /**
   * Normalize Amazon URL to standard format
   * @param {string} url - Raw URL
   * @returns {string|null} Normalized URL or null if invalid
   */
  normalizeUrl(url) {
    try {
      if (!url || typeof url !== 'string') return null;
      
      let normalizedUrl = url.trim();
      
      // Add protocol if missing
      if (!normalizedUrl.startsWith('http')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      
      // Parse URL
      const urlObj = new URL(normalizedUrl);
      
      // Validate Amazon domain
      const validDomains = ['amazon.co.jp', 'amazon.com', 'amazon.jp'];
      if (!validDomains.some(domain => urlObj.hostname.includes(domain))) {
        return null;
      }
      
      // Extract product ID (ASIN/ISBN)
      const pathMatch = urlObj.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
      if (!pathMatch) return null;
      
      const productId = pathMatch[1];
      
      // Construct clean URL
      return `${urlObj.protocol}//${urlObj.hostname}/dp/${productId}`;
      
    } catch (error) {
      console.warn('URL normalization failed:', error);
      return null;
    }
  }

  /**
   * Validate that HTML is from Amazon and contains expected content
   * @private
   * @param {string} html - HTML content
   * @returns {boolean} Whether HTML appears to be valid Amazon page
   */
  isValidAmazonHtml(html) {
    const requiredPatterns = [
      /amazon/i,
      /<title/i,
      /<body/i
    ];
    
    const suspiciousPatterns = [
      /error/i,
      /not found/i,
      /access denied/i,
      /blocked/i
    ];
    
    // Check for required content
    const hasRequired = requiredPatterns.every(pattern => pattern.test(html));
    
    // Check for suspicious content in title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].toLowerCase();
      const hasSuspicious = suspiciousPatterns.some(pattern => pattern.test(title));
      if (hasSuspicious) return false;
    }
    
    return hasRequired;
  }

  /**
   * Get random user agent for requests
   * @private
   * @returns {string} User agent string
   */
  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'
    ];
    
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Update average response time statistics
   * @private
   * @param {number} responseTime - Response time in milliseconds
   */
  updateAverageResponseTime(responseTime) {
    const totalResponseTime = this.stats.averageResponseTime * (this.stats.successfulFetches - 1);
    this.stats.averageResponseTime = (totalResponseTime + responseTime) / this.stats.successfulFetches;
  }

  // ============================================================================
  // UTILITY AND CONFIGURATION METHODS
  // ============================================================================

  /**
   * Get service statistics
   * @returns {Object} Performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheHitRate: this.stats.totalRequests > 0 ? 
        (this.stats.cacheHits / this.stats.totalRequests * 100).toFixed(2) + '%' : '0%',
      successRate: this.stats.totalRequests > 0 ? 
        (this.stats.successfulFetches / this.stats.totalRequests * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Clear statistics
   */
  clearStats() {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      successfulFetches: 0,
      failedFetches: 0,
      averageResponseTime: 0
    };
  }

  /**
   * Set debug mode for all components
   * @param {boolean} enabled - Whether to enable debug mode
   */
  setDebugMode(enabled) {
    this.htmlParser.setDebugMode(enabled);
    this.metadataExtractor.setDebugMode(enabled);
  }

  /**
   * Force cache refresh for a URL
   * @param {string} url - URL to refresh
   */
  refreshCache(url) {
    const normalizedUrl = this.normalizeUrl(url);
    if (normalizedUrl) {
      this.cache.delete(normalizedUrl);
      console.log('🗑️ Cache cleared for:', normalizedUrl);
    }
  }
}