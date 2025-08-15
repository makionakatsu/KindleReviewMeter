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
 * 
 * Notes:
 * - Parsing responsibilities live in AmazonHTMLParser/MetadataExtractor. This
 *   service focuses on transport (proxies/race/fallback) and DTO assembly.
 * - Do not embed page-structure-specific regex here when possible.
 */

import AmazonHTMLParser from '../parsers/AmazonHTMLParser.js';
import MetadataExtractor from '../parsers/MetadataExtractor.js';

export default class AmazonScrapingService {
  constructor(cache, proxyManager, errorHandler) {
    this.cache = cache;
    this.proxyManager = proxyManager;
    this.errorHandler = errorHandler;

    // Parsers
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

      // 3. HTML Fetching (Proxies → Fallback: direct tab)
      let html;
      try {
        html = await this.fetchHtmlWithProxies(normalizedUrl);
      } catch (proxyError) {
        console.warn('Proxy fetching failed, trying direct tab fallback:', proxyError?.message || proxyError);
        html = await this.fetchHtmlViaTab(normalizedUrl);
      }

      // 4. HTML Parsing (combine HTML parser + metadata extractor)
      const basic = this.htmlParser.parse(html, normalizedUrl) || {};
      const meta = this.metadataExtractor.extractAll(html, normalizedUrl) || {};

      // 5. Combine Results (unified DTO)
      const result = {
        title: (basic.title || '').slice(0, 200) || 'Unknown Title',
        author: (basic.author || '').slice(0, 100) || 'Unknown Author',
        imageUrl: basic.imageUrl || null,
        reviewCount: typeof meta.reviewCount === 'number' ? meta.reviewCount : (basic.reviewCount || 0),
        currentReviews: typeof meta.reviewCount === 'number' ? meta.reviewCount : (basic.reviewCount || 0), // compatibility
        averageRating: typeof meta.averageRating === 'number' ? meta.averageRating : (basic.averageRating || 0),
        price: meta.price ? parseInt(String(meta.price).replace(/[^0-9]/g, ''), 10) || 0 : (basic.price || 0),
        asin: meta.asin || null,
        amazonUrl: normalizedUrl,
        normalizedUrl,
        timestamp: Date.now(),
        fetchTime: Date.now() - fetchStartTime,
        source: 'amazon_scraping_service',
        extraction: {}
      };

      // 6. Robust overrides (align with origin/main behavior)
      // Image URL
      const robustImage = this.extractImageUrlRobust(html);
      if (robustImage) {
        result.imageUrl = robustImage;
        result.extraction.imageSource = 'robust';
      }
      // Review count
      const { count: robustReviews, source: reviewSource } = this.extractReviewCountRobust(html) || {};
      if (typeof robustReviews === 'number' && robustReviews >= 0) {
        result.reviewCount = robustReviews;
        result.currentReviews = robustReviews;
        result.extraction.reviewCountSource = reviewSource || 'robust';
      } else if (typeof meta.reviewCount === 'number') {
        result.extraction.reviewCountSource = 'json-ld';
      } else {
        result.extraction.reviewCountSource = 'none';
      }

      // 7. Cache Result
      this.cache.set(normalizedUrl, result);

      // 8. Update Statistics
      this.stats.successfulFetches++;
      this.updateAverageResponseTime(Date.now() - fetchStartTime);

      console.log(`✅ Amazon data fetched successfully in ${result.fetchTime}ms`);
      return result;

    } catch (error) {
      this.stats.failedFetches++;
      console.error('❌ Amazon fetch failed:', error);
      throw error;
    }
  }

  // ==========================================================================
  // ROBUST PARSERS (ported from origin/main simplified)
  // ==========================================================================
  extractImageUrlRobust(html) {
    try {
      const markers = [
        'id="imgTagWrapperId"',
        'id="ebooksImageBlock"',
        'id="imageBlock"',
        'id="main-image-container"',
        'imageGallery'
      ];
      let region = '';
      for (const m of markers) {
        const idx = html.indexOf(m);
        if (idx !== -1) { region = html.slice(Math.max(0, idx - 500), idx + 5000); break; }
      }
      if (!region) region = html;

      const isLikelyCover = (u) => {
        if (!u) return false;
        const s = String(u).replace(/&amp;/g, '&');
        if (!/\.(jpg|jpeg|png)(?:[?#].*)?$/i.test(s)) return false;
        if (!/\/images\/I\//.test(s)) return false; // prefer product images path
        if (/Digital_Video|svod|PrimeVideo|\/images\/G\//i.test(s)) return false; // likely banner
        return true;
      };

      // 1) data-a-dynamic-image JSON
      const dyn = region.match(/data-a-dynamic-image\s*=\s*'([^']+)'/i) || region.match(/data-a-dynamic-image\s*=\s*"([^"]+)"/i);
      if (dyn && dyn[1]) {
        try {
          const jsonText = dyn[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
          const obj = JSON.parse(jsonText);
          let best = null, bestArea = 0;
          for (const [urlStr, size] of Object.entries(obj)) {
            const area = Array.isArray(size) && size.length >= 2 ? (Number(size[0]) * Number(size[1])) : 0;
            if (isLikelyCover(urlStr) && area >= bestArea) { bestArea = area; best = urlStr; }
          }
          if (best) return String(best).replace(/&amp;/g, '&');
        } catch {}
      }

      // 2) data-old-hires
      const hires = region.match(/data-old-hires=\"([^\"]+)\"/i);
      if (hires && isLikelyCover(hires[1])) return hires[1].replace(/&amp;/g, '&');

      // 3) common ids/classes
      const idMatch = region.match(/<img[^>]*id=\"(?:landingImage|imgBlkFront|ebooksImgBlkFront)\"[^>]*(?:src|data-src)=\"([^\"]+)\"/i);
      if (idMatch && isLikelyCover(idMatch[1])) return idMatch[1].replace(/&amp;/g, '&');
      const clsMatch = region.match(/<img[^>]*class=\"[^\"]*(?:a-dynamic-image|frontImage)\"[^>]*src=\"([^\"]+)\"/i);
      if (clsMatch && isLikelyCover(clsMatch[1])) return clsMatch[1].replace(/&amp;/g, '&');

      // 4) og:image
      const og = html.match(/<meta[^>]*property=\"og:image\"[^>]*content=\"([^\"]+)\"[^>]*>/i);
      if (og && isLikelyCover(og[1])) return og[1].replace(/&amp;/g, '&');

      // 5) conservative fallback restricted to /images/I/
      const any = region.match(/src=\"([^\"]*\/images\/I\/[^\"]*\.(?:jpg|jpeg|png)[^\"]*)\"/i);
      if (any && isLikelyCover(any[1])) return any[1].replace(/&amp;/g, '&');

      return null;
    } catch {
      return null;
    }
  }

  extractReviewCountRobust(html) {
    try {
      // 1) Direct patterns commonly used by Amazon
      const patterns = [
        /<[^>]*data-hook=\"total-review-count\"[^>]*>([^<]*)<\/[^>]*>/i,
        /<span[^>]*id=\"acrCustomerReviewText\"[^>]*>([^<]*)<\/span>/i,
        /<a[^>]*href=\"[^\"]*#customerReviews[^\"]*\"[^>]*>([^<]*\d[^<]*)<\/a>/i,
        /([0-9,\d]+)[\s]*(?:個の評価|件のレビュー|件のカスタマーレビュー|ratings?)/i,
        /<[^>]*class=\"[^\"]*cr-widget-ACR[^\"]*\"[^>]*>[\s\S]*?<[^>]*class=\"[^\"]*a-size-base[^\"]*\"[^>]*>([^<]*)<\/[^>]*>/i
      ];
      for (const rx of patterns) {
        const m = html.match(rx);
        if (m && m[1]) {
          const text = String(m[1]).replace(/<[^>]*>/g, ' ');
          const num = text.match(/(\d{1,3}(?:,\d{3})*|\d+)/);
          if (num) {
            const val = parseInt(num[1].replace(/,/g, ''), 10);
            if (!Number.isNaN(val)) return { count: val, source: 'html' };
          }
        }
      }

      // 2) JSON-LD aggregateRating fallback
      try {
        const scriptRegex = /<script[^>]*type=\"application\/ld\+json\"[^>]*>([\s\S]*?)<\/script>/ig;
        let match;
        while ((match = scriptRegex.exec(html)) !== null) {
          const jsonText = match[1];
          try {
            const data = JSON.parse(jsonText);
            const nodes = Array.isArray(data) ? data : [data];
            for (const node of nodes) {
              const agg = node?.aggregateRating || node;
              const rc = agg?.reviewCount || agg?.ratingCount;
              if (typeof rc === 'number' && rc >= 0) {
                return { count: rc, source: 'json-ld' };
              }
              if (typeof rc === 'string') {
                const val = parseInt(rc.replace(/,/g, ''), 10);
                if (!Number.isNaN(val)) return { count: val, source: 'json-ld' };
              }
            }
          } catch {}
        }
      } catch {}

      // 3) Contextual scan near keywords
      const keywordRegex = /(レビュー|評価|customer reviews|global ratings|ratings?)/i;
      let best = -1;
      const numberRegex = /(\d{1,3}(?:,\d{3})*|\d+)/g;
      let nm;
      while ((nm = numberRegex.exec(html)) !== null) {
        const numText = nm[1];
        const val = parseInt(numText.replace(/,/g, ''), 10);
        if (Number.isNaN(val)) continue;
        const start = Math.max(0, nm.index - 40);
        const end = Math.min(html.length, nm.index + numText.length + 40);
        const around = html.slice(start, end);
        if (keywordRegex.test(around)) {
          if (val > best) best = val;
        }
      }
      if (best >= 0) return { count: best, source: 'context' };

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fallback: Open Amazon page in a background tab and extract HTML via scripting
   */
  async fetchHtmlViaTab(url) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.create({ url, active: false }, (tab) => {
          if (chrome.runtime.lastError || !tab?.id) {
            return reject(new Error(chrome.runtime.lastError?.message || 'Failed to create tab'));
          }

          const tabId = tab.id;
          const timeoutMs = 15000;
          let done = false;

          const cleanup = () => {
            try { chrome.tabs.remove(tabId); } catch {}
            chrome.tabs.onUpdated.removeListener(onUpdated);
          };

          const onTimeout = setTimeout(() => {
            if (!done) {
              done = true;
              cleanup();
              reject(new Error('Direct tab fetch timeout'));
            }
          }, timeoutMs);

          const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
              try {
                chrome.scripting.executeScript(
                  { target: { tabId }, func: () => document.documentElement.outerHTML },
                  (results) => {
                    if (done) return;
                    done = true;
                    clearTimeout(onTimeout);
                    cleanup();
                    if (chrome.runtime.lastError || !results || !results[0]?.result) {
                      return reject(new Error(chrome.runtime.lastError?.message || 'Failed to extract HTML'));
                    }
                    resolve(String(results[0].result));
                  }
                );
              } catch (e) {
                if (!done) {
                  done = true;
                  clearTimeout(onTimeout);
                  cleanup();
                  reject(e);
                }
              }
            }
          };

          chrome.tabs.onUpdated.addListener(onUpdated);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Normalize Amazon URL to standard format
   */
  normalizeUrl(url) {
    try {
      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        return null;
      }

      const trimmed = url.trim();
      const withProtocol = (/^https?:\/\//i.test(trimmed)) ? trimmed : ('https://' + trimmed);
      const u = new URL(withProtocol);

      // Accept broad Amazon hosts (same as origin/main behavior)
      const amazonHosts = [
        'amazon.co.jp', 'amazon.com', 'amazon.ca', 'amazon.co.uk',
        'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es',
        'www.amazon.co.jp', 'www.amazon.com', 'www.amazon.ca', 'www.amazon.co.uk',
        'www.amazon.de', 'www.amazon.fr', 'www.amazon.it', 'www.amazon.es'
      ];
      const isAmazon = amazonHosts.some(host => u.hostname === host || u.hostname.endsWith('.' + host));
      if (!isAmazon) return null;

      // Extract ASIN from multiple patterns
      const patterns = [
        /\/dp\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,
        /\/product\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,
        /\/gp\/product\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,
        /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,
        /\/o\/ASIN\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,
        /ASIN[=/]([A-Z0-9]{10})/i
      ];
      let asin = null;
      for (const rx of patterns) {
        const m = withProtocol.match(rx);
        if (m) { asin = m[1]; break; }
      }
      if (!asin) return null;

      return `${u.protocol}//${u.hostname}/dp/${asin}`;
    } catch (e) {
      return null;
    }
  }

  /**
   * Fetch HTML content using proxy services (parallel race, fast-first)
   */
  async fetchHtmlWithProxies(url) {
    const proxies = this.proxyManager.getOptimizedProxyList();
    const createProxyFetch = (proxy, index) => {
      return new Promise(async (resolve, reject) => {
        const start = Date.now();
        const controller = new AbortController();
        try {
          const timeout = this.proxyManager.getRecommendedTimeout
            ? this.proxyManager.getRecommendedTimeout(proxy)
            : 8000;
          const timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error(`Timeout after ${timeout}ms`));
          }, timeout);

          const proxyUrl = this.buildProxyUrl(proxy, url);
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
          const took = Date.now() - start;
          if (!response.ok) {
            this.proxyManager.recordAttempt(proxy, false, took);
            return reject(new Error(`HTTP ${response.status}`));
          }

          let htmlContent;
          const ct = response.headers.get('content-type');
          if (ct && ct.includes('application/json')) {
            const data = await response.json();
            htmlContent = data.contents || data.response || data.data || data;
          } else {
            htmlContent = await response.text();
          }

          if (htmlContent && typeof htmlContent === 'string' && htmlContent.length > 1000 && this.isValidAmazonHtml(htmlContent)) {
            this.proxyManager.recordAttempt(proxy, true, took);
            return resolve({ html: htmlContent, proxy, took, index });
          } else {
            this.proxyManager.recordAttempt(proxy, false, took);
            return reject(new Error('Invalid content'));
          }
        } catch (error) {
          const took = Date.now() - start;
          this.proxyManager.recordAttempt(proxy, false, took);
          return reject(error);
        }
      });
    };

    const attempts = proxies.map(createProxyFetch);
    // Resolve on first success, ignore rejections
    const anySuccess = Promise.any(attempts).catch(() => null);
    // Overall timeout
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Overall race timeout')), 15000));
    const result = await Promise.race([anySuccess, timeout]);
    if (!result) throw new Error('All proxy attempts failed');
    return result.html;
  }

  /**
   * Build proxy URL depending on proxy style
   * - Query param style: append encodeURIComponent(url)
   * - Path prefix style: append raw url (e.g., cors-anywhere, isomorphic-git, thingproxy)
   */
  buildProxyUrl(proxy, url) {
    const lower = proxy.toLowerCase();
    const pathStyleHosts = [
      'cors-anywhere.herokuapp.com/',
      'cors.isomorphic-git.org/',
      'thingproxy.freeboard.io/fetch/'
    ];
    if (pathStyleHosts.some(h => lower.includes(h))) {
      return proxy + url; // raw URL after prefix
    }
    return proxy + encodeURIComponent(url);
  }

  // Parsing handled by dedicated parser classes in fetchBookData

  /**
   * Update average response time statistics
   */
  updateAverageResponseTime(duration) {
    const total = this.stats.successfulFetches;
    if (total === 1) {
      this.stats.averageResponseTime = duration;
    } else {
      this.stats.averageResponseTime = ((this.stats.averageResponseTime * (total - 1)) + duration) / total;
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRequests > 0 
        ? `${((this.stats.successfulFetches / this.stats.totalRequests) * 100).toFixed(1)}%`
        : '0%'
    };
  }

  // (duplicate, removed)

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

  // (duplicate, removed)

  // ============================================================================
  // UTILITY AND CONFIGURATION METHODS
  // ============================================================================

  // (duplicate, removed)

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
    if (this.htmlParser?.setDebugMode) this.htmlParser.setDebugMode(enabled);
    if (this.metadataExtractor?.setDebugMode) this.metadataExtractor.setDebugMode(enabled);
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
