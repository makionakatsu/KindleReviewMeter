/**
 * PerformanceTracker - Statistics and performance monitoring for Amazon scraping
 * Extracted from AmazonScrapingService.js
 * 
 * Responsibilities:
 * - Track request counts and success/failure rates
 * - Monitor average response times
 * - Provide performance insights and debugging info
 * - Cache hit rate optimization metrics
 */

export default class PerformanceTracker {
  constructor() {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      successfulFetches: 0,
      failedFetches: 0,
      averageResponseTime: 0,
      fastestResponse: null,
      slowestResponse: null,
      startTime: Date.now()
    };
  }

  /**
   * Record the start of a new request
   */
  recordRequestStart() {
    this.stats.totalRequests++;
  }

  /**
   * Record a cache hit
   * @param {number} responseTime - Time to retrieve from cache
   */
  recordCacheHit(responseTime) {
    this.stats.cacheHits++;
    this.updateResponseTimes(responseTime);
  }

  /**
   * Record a successful fetch
   * @param {number} responseTime - Time taken for the fetch
   */
  recordSuccessfulFetch(responseTime) {
    this.stats.successfulFetches++;
    this.updateAverageResponseTime(responseTime);
    this.updateResponseTimes(responseTime);
  }

  /**
   * Record a failed fetch
   */
  recordFailedFetch() {
    this.stats.failedFetches++;
  }

  /**
   * Update average response time statistics
   * @param {number} duration - Duration of the request
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
   * Update fastest/slowest response tracking
   * @param {number} responseTime - Response time to track
   */
  updateResponseTimes(responseTime) {
    if (this.stats.fastestResponse === null || responseTime < this.stats.fastestResponse) {
      this.stats.fastestResponse = responseTime;
    }
    if (this.stats.slowestResponse === null || responseTime > this.stats.slowestResponse) {
      this.stats.slowestResponse = responseTime;
    }
  }

  /**
   * Get comprehensive performance statistics
   * @returns {Object} Performance statistics
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const successRate = this.stats.totalRequests > 0 ? 
      (this.stats.successfulFetches / this.stats.totalRequests * 100).toFixed(1) : 0;
    const cacheHitRate = this.stats.totalRequests > 0 ? 
      (this.stats.cacheHits / this.stats.totalRequests * 100).toFixed(1) : 0;

    return {
      // Request counts
      totalRequests: this.stats.totalRequests,
      successfulFetches: this.stats.successfulFetches,
      failedFetches: this.stats.failedFetches,
      cacheHits: this.stats.cacheHits,
      
      // Performance metrics
      averageResponseTime: Math.round(this.stats.averageResponseTime),
      fastestResponse: this.stats.fastestResponse,
      slowestResponse: this.stats.slowestResponse,
      
      // Rates and efficiency
      successRate: `${successRate}%`,
      cacheHitRate: `${cacheHitRate}%`,
      requestsPerMinute: uptime > 0 ? 
        Math.round(this.stats.totalRequests / (uptime / 60000)) : 0,
      
      // Operational status
      uptime: this.formatUptime(uptime),
      isHealthy: this.isServiceHealthy()
    };
  }

  /**
   * Format uptime in human-readable format
   * @param {number} uptime - Uptime in milliseconds
   * @returns {string} Formatted uptime
   */
  formatUptime(uptime) {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Determine if service is performing within healthy parameters
   * @returns {boolean} Whether service is healthy
   */
  isServiceHealthy() {
    if (this.stats.totalRequests === 0) return true;
    
    const successRate = this.stats.successfulFetches / this.stats.totalRequests;
    const avgResponseTime = this.stats.averageResponseTime;
    
    // Healthy if success rate > 70% and avg response time < 10 seconds
    return successRate > 0.7 && avgResponseTime < 10000;
  }

  /**
   * Get performance insights and recommendations
   * @returns {Array} Array of insight strings
   */
  getPerformanceInsights() {
    const insights = [];
    const stats = this.getStats();
    
    if (stats.cacheHitRate > 50) {
      insights.push(`✅ High cache efficiency: ${stats.cacheHitRate} hit rate`);
    } else if (stats.cacheHits > 0) {
      insights.push(`⚠️ Low cache efficiency: ${stats.cacheHitRate} hit rate`);
    }
    
    if (stats.averageResponseTime < 2000) {
      insights.push(`🚀 Fast response times: ${stats.averageResponseTime}ms average`);
    } else if (stats.averageResponseTime > 5000) {
      insights.push(`🐌 Slow response times: ${stats.averageResponseTime}ms average`);
    }
    
    if (stats.successRate > 90) {
      insights.push(`💪 High reliability: ${stats.successRate} success rate`);
    } else if (stats.successRate < 70) {
      insights.push(`⚠️ Reliability concerns: ${stats.successRate} success rate`);
    }
    
    if (this.stats.totalRequests > 100) {
      insights.push(`📊 High volume: ${this.stats.totalRequests} total requests processed`);
    }
    
    return insights.length > 0 ? insights : ['📈 Gathering performance data...'];
  }

  /**
   * Reset all statistics (useful for testing or service restart)
   */
  reset() {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      successfulFetches: 0,
      failedFetches: 0,
      averageResponseTime: 0,
      fastestResponse: null,
      slowestResponse: null,
      startTime: Date.now()
    };
  }

  /**
   * Export statistics for external analysis
   * @returns {Object} Raw statistics data
   */
  exportStats() {
    return { ...this.stats };
  }
}