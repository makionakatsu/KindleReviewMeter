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
import HtmlFetcher from './amazon/HtmlFetcher.js';
import DataProcessor from './amazon/DataProcessor.js';
import PerformanceTracker from './amazon/PerformanceTracker.js';
import FetchCoordinator from './amazon/FetchCoordinator.js';
import { normalizeUrl as normalizeAmazonUrl } from './amazon/UrlUtils.js';

export default class AmazonScrapingService {
  constructor(cache, proxyManager, errorHandler) {
    this.cache = cache;
    this.proxyManager = proxyManager;
    this.errorHandler = errorHandler;

    // Initialize specialized services
    this.htmlParser = new AmazonHTMLParser();
    this.metadataExtractor = new MetadataExtractor();
    this.htmlFetcher = new HtmlFetcher(proxyManager);
    this.dataProcessor = new DataProcessor();
    this.performanceTracker = new PerformanceTracker();
    
    // Create URL normalizer with simple interface
    this.urlNormalizer = { normalizeUrl: normalizeAmazonUrl };
    
    // Initialize fetch coordinator
    this.fetchCoordinator = new FetchCoordinator(
      this.cache,
      this.urlNormalizer,
      this.htmlFetcher,
      this.htmlParser,
      this.metadataExtractor,
      this.dataProcessor,
      this.performanceTracker
    );
  }

  /**
   * Main entry point - fetch Amazon book data with full optimization
   * @param {string} url - Amazon book URL
   * @returns {Promise<Object>} Parsed book data
   */
  async fetchBookData(url) {
    return this.fetchCoordinator.fetchBookData(url);
  }


  /**
   * Fallback: Open Amazon page in a background tab and extract HTML via scripting
   */
  async fetchHtmlViaTab(url) {
    return this.htmlFetcher.fetchHtmlViaTab(url);
  }

  /**
   * Normalize Amazon URL to standard format
   */
  normalizeUrl(url) {
    return normalizeAmazonUrl(url);
  }

  /**
   * Fetch HTML content using proxy services (parallel race, fast-first)
   */
  async fetchHtmlWithProxies(url) {
    return this.htmlFetcher.fetchHtmlWithProxies(url);
  }

  /**
   * Build proxy URL depending on proxy style
   */
  buildProxyUrl(proxy, url) {
    return this.htmlFetcher.buildProxyUrl(proxy, url);
  }

  /**
   * Get service statistics
   */
  getStats() {
    return this.fetchCoordinator.getStats();
  }

  /**
   * Validate that HTML is from Amazon and contains expected content
   */
  isValidAmazonHtml(html) {
    return this.htmlFetcher.isValidAmazonHtml(html);
  }

  /**
   * Get random user agent for requests
   */
  getRandomUserAgent() {
    return this.htmlFetcher.getRandomUserAgent();
  }

  /**
   * Clear statistics
   */
  clearStats() {
    this.fetchCoordinator.resetStats();
  }

  /**
   * Set debug mode for all components
   */
  setDebugMode(enabled) {
    if (this.htmlParser?.setDebugMode) this.htmlParser.setDebugMode(enabled);
    if (this.metadataExtractor?.setDebugMode) this.metadataExtractor.setDebugMode(enabled);
  }

  /**
   * Force cache refresh for a URL
   */
  refreshCache(url) {
    const normalizedUrl = this.normalizeUrl(url);
    if (normalizedUrl) {
      this.cache.delete(normalizedUrl);
      console.log('🗑️ Cache cleared for:', normalizedUrl);
    }
  }

  /**
   * Get performance insights
   */
  getPerformanceInsights() {
    return this.fetchCoordinator.getPerformanceInsights();
  }
}
