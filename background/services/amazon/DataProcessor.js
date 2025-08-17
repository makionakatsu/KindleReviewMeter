/**
 * DataProcessor - Amazon data processing and DTO assembly
 * Extracted from AmazonScrapingService.js
 * 
 * Responsibilities:
 * - Combine results from multiple parsers
 * - Apply robust overrides and extraction logic
 * - Format data into standardized DTO structure
 * - Handle data validation and sanitization
 */

import { extractImageUrlRobust as robustImageExtractor, extractReviewCountRobust as robustReviewExtractor } from './Extractors.js';

export default class DataProcessor {
  constructor() {
    // No dependencies needed for pure data processing
  }

  /**
   * Process and combine parsing results into standardized DTO
   * @param {Object} basic - Basic parser results
   * @param {Object} meta - Metadata extractor results  
   * @param {string} html - Raw HTML for robust extraction
   * @param {string} normalizedUrl - Normalized Amazon URL
   * @param {number} fetchStartTime - Fetch start timestamp
   * @returns {Object} Processed book data DTO
   */
  processBookData(basic, meta, html, normalizedUrl, fetchStartTime) {
    // 1. Combine base results (unified DTO)
    const result = {
      title: this.sanitizeTitle(basic.title),
      author: this.sanitizeAuthor(basic.author),
      imageUrl: basic.imageUrl || null,
      reviewCount: this.extractBestReviewCount(meta, basic),
      currentReviews: this.extractBestReviewCount(meta, basic), // compatibility
      averageRating: this.extractBestRating(meta, basic),
      price: this.extractBestPrice(meta, basic),
      asin: meta.asin || null,
      amazonUrl: normalizedUrl,
      normalizedUrl,
      timestamp: Date.now(),
      fetchTime: Date.now() - fetchStartTime,
      source: 'amazon_scraping_service',
      extraction: {}
    };

    // 2. Apply robust overrides (align with origin/main behavior)
    this.applyRobustOverrides(result, html);

    return result;
  }

  /**
   * Apply robust extraction overrides to improve data quality
   * @param {Object} result - Current result object (modified in place)
   * @param {string} html - Raw HTML for robust extraction
   */
  applyRobustOverrides(result, html) {
    // Image URL robust override
    const robustImage = robustImageExtractor(html);
    if (robustImage) {
      result.imageUrl = robustImage;
      result.extraction.imageSource = 'robust';
    }

    // Review count robust override
    const { count: robustReviews, source: reviewSource } = robustReviewExtractor(html) || {};
    if (typeof robustReviews === 'number' && robustReviews >= 0) {
      result.reviewCount = robustReviews;
      result.currentReviews = robustReviews;
      result.extraction.reviewCountSource = reviewSource || 'robust';
    } else if (typeof result.reviewCount === 'number') {
      result.extraction.reviewCountSource = 'json-ld';
    } else {
      result.extraction.reviewCountSource = 'none';
    }
  }

  /**
   * Sanitize and validate title field
   * @param {string} title - Raw title
   * @returns {string} Sanitized title
   */
  sanitizeTitle(title) {
    return (title || '').slice(0, 200) || 'Unknown Title';
  }

  /**
   * Sanitize and validate author field
   * @param {string} author - Raw author
   * @returns {string} Sanitized author
   */
  sanitizeAuthor(author) {
    return (author || '').slice(0, 100) || 'Unknown Author';
  }

  /**
   * Extract best available review count from multiple sources
   * @param {Object} meta - Metadata results
   * @param {Object} basic - Basic parser results
   * @returns {number} Best review count
   */
  extractBestReviewCount(meta, basic) {
    if (typeof meta.reviewCount === 'number') {
      return meta.reviewCount;
    }
    return basic.reviewCount || 0;
  }

  /**
   * Extract best available rating from multiple sources
   * @param {Object} meta - Metadata results
   * @param {Object} basic - Basic parser results
   * @returns {number} Best rating
   */
  extractBestRating(meta, basic) {
    if (typeof meta.averageRating === 'number') {
      return meta.averageRating;
    }
    return basic.averageRating || 0;
  }

  /**
   * Extract best available price from multiple sources
   * @param {Object} meta - Metadata results
   * @param {Object} basic - Basic parser results
   * @returns {number} Best price
   */
  extractBestPrice(meta, basic) {
    if (meta.price) {
      return parseInt(String(meta.price).replace(/[^0-9]/g, ''), 10) || 0;
    }
    return basic.price || 0;
  }

  /**
   * Validate processed data before returning
   * @param {Object} data - Processed data
   * @returns {boolean} Whether data is valid
   */
  validateProcessedData(data) {
    return !!(
      data.title && 
      data.author && 
      typeof data.reviewCount === 'number' &&
      data.normalizedUrl
    );
  }

  /**
   * Create error result for failed processing
   * @param {Error} error - Processing error
   * @param {string} url - Original URL
   * @returns {Object} Error result DTO
   */
  createErrorResult(error, url) {
    return {
      title: 'Processing Error',
      author: 'Unknown',
      imageUrl: null,
      reviewCount: 0,
      currentReviews: 0,
      averageRating: 0,
      price: 0,
      asin: null,
      amazonUrl: url,
      normalizedUrl: url,
      timestamp: Date.now(),
      fetchTime: 0,
      source: 'amazon_scraping_service',
      error: error.message,
      extraction: {
        reviewCountSource: 'none',
        processingFailed: true
      }
    };
  }
}