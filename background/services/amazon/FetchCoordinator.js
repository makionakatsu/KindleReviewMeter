/**
 * FetchCoordinator - Orchestrates the complete Amazon data fetching workflow
 * Extracted from AmazonScrapingService.js
 * 
 * Responsibilities:
 * - Coordinate URL normalization, caching, and fetching
 * - Manage proxy fallback to direct tab fetching
 * - Orchestrate parsing through multiple parsers
 * - Handle error recovery and performance optimization
 */

export default class FetchCoordinator {
  constructor(cache, urlNormalizer, htmlFetcher, htmlParser, metadataExtractor, dataProcessor, performanceTracker) {
    this.cache = cache;
    this.urlNormalizer = urlNormalizer;
    this.htmlFetcher = htmlFetcher;
    this.htmlParser = htmlParser;
    this.metadataExtractor = metadataExtractor;
    this.dataProcessor = dataProcessor;
    this.performanceTracker = performanceTracker;
  }

  /**
   * Execute complete fetch workflow with optimization and fallback
   * @param {string} url - Amazon book URL
   * @returns {Promise<Object>} Parsed book data
   */
  async fetchBookData(url) {
    const fetchStartTime = Date.now();
    this.performanceTracker.recordRequestStart();

    try {
      // 1. URL Normalization and Validation
      const normalizedUrl = this.urlNormalizer.normalizeUrl(url);
      if (!normalizedUrl) {
        throw new Error('Invalid Amazon URL - could not normalize');
      }

      console.log('⚡ Speed-optimized fetch for:', normalizedUrl);

      // 2. Cache Check
      const cachedData = this.cache.get(normalizedUrl);
      if (cachedData) {
        const totalDuration = Date.now() - fetchStartTime;
        this.performanceTracker.recordCacheHit(totalDuration);
        console.log(`🚀 Cache hit! Returned in ${totalDuration}ms`);
        return cachedData;
      }

      // 3. HTML Fetching (Proxies → Fallback: direct tab)
      const html = await this.fetchHtmlWithFallback(normalizedUrl);

      // 4. Parse HTML through multiple parsers
      const parseResults = await this.parseHtmlContent(html, normalizedUrl);

      // 5. Process and combine results
      const result = this.dataProcessor.processBookData(
        parseResults.basic,
        parseResults.meta,
        html,
        normalizedUrl,
        fetchStartTime
      );

      // 6. Validate processed data
      if (!this.dataProcessor.validateProcessedData(result)) {
        throw new Error('Data validation failed after processing');
      }

      // 7. Cache successful result
      this.cache.set(normalizedUrl, result);

      // 8. Record success metrics
      const totalDuration = Date.now() - fetchStartTime;
      this.performanceTracker.recordSuccessfulFetch(totalDuration);

      console.log(`✅ Amazon data fetched successfully in ${result.fetchTime}ms`);
      return result;

    } catch (error) {
      this.performanceTracker.recordFailedFetch();
      console.error('❌ Amazon fetch failed:', error);
      throw error;
    }
  }

  /**
   * Fetch HTML with proxy fallback to direct tab
   * @param {string} normalizedUrl - Normalized Amazon URL
   * @returns {Promise<string>} HTML content
   */
  async fetchHtmlWithFallback(normalizedUrl) {
    try {
      // Primary: Try proxy-based fetching
      return await this.htmlFetcher.fetchHtmlWithProxies(normalizedUrl);
    } catch (proxyError) {
      console.warn('Proxy fetching failed, trying direct tab fallback:', proxyError?.message || proxyError);
      
      // Fallback: Direct tab fetching
      return await this.htmlFetcher.fetchHtmlViaTab(normalizedUrl);
    }
  }

  /**
   * Parse HTML content through multiple parsers
   * @param {string} html - HTML content
   * @param {string} normalizedUrl - Normalized URL
   * @returns {Promise<Object>} Parse results from multiple parsers
   */
  async parseHtmlContent(html, normalizedUrl) {
    try {
      // Run parsers in parallel for speed
      const [basic, meta] = await Promise.all([
        this.parseWithBasicParser(html, normalizedUrl),
        this.parseWithMetadataExtractor(html, normalizedUrl)
      ]);

      return { basic, meta };
    } catch (parseError) {
      console.warn('Parallel parsing failed, trying sequential:', parseError.message);
      
      // Fallback to sequential parsing
      const basic = await this.parseWithBasicParser(html, normalizedUrl);
      const meta = await this.parseWithMetadataExtractor(html, normalizedUrl);
      
      return { basic, meta };
    }
  }

  /**
   * Parse with basic HTML parser
   * @param {string} html - HTML content
   * @param {string} normalizedUrl - Normalized URL
   * @returns {Promise<Object>} Basic parse results
   */
  async parseWithBasicParser(html, normalizedUrl) {
    try {
      return this.htmlParser.parse(html, normalizedUrl) || {};
    } catch (error) {
      console.warn('Basic parser failed:', error.message);
      return {};
    }
  }

  /**
   * Parse with metadata extractor
   * @param {string} html - HTML content
   * @param {string} normalizedUrl - Normalized URL
   * @returns {Promise<Object>} Metadata extraction results
   */
  async parseWithMetadataExtractor(html, normalizedUrl) {
    try {
      return this.metadataExtractor.extractAll(html, normalizedUrl) || {};
    } catch (error) {
      console.warn('Metadata extractor failed:', error.message);
      return {};
    }
  }

  /**
   * Create fallback result when all parsing fails
   * @param {string} normalizedUrl - Normalized URL
   * @param {Error} error - Original error
   * @returns {Object} Fallback result
   */
  createFallbackResult(normalizedUrl, error) {
    return this.dataProcessor.createErrorResult(error, normalizedUrl);
  }

  /**
   * Get coordinator performance statistics
   * @returns {Object} Performance stats
   */
  getStats() {
    return this.performanceTracker.getStats();
  }

  /**
   * Get performance insights
   * @returns {Array} Performance insights
   */
  getPerformanceInsights() {
    return this.performanceTracker.getPerformanceInsights();
  }

  /**
   * Reset performance tracking (useful for testing)
   */
  resetStats() {
    this.performanceTracker.reset();
  }
}