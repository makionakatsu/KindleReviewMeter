/**
 * ProxyService - CORS Proxy Management Service
 * 
 * Responsibilities:
 * - Manage multiple CORS proxy services for Amazon data fetching
 * - Track proxy performance and reliability metrics
 * - Provide optimized proxy selection based on historical performance
 * - Handle proxy rotation and fallback strategies
 * - Monitor proxy health and availability
 * 
 * Extracted from: proxyTracker and related proxy management functionality
 */

export default class ProxyService {
  constructor(errorHandler) {
    this.errorHandler = errorHandler;
    
    // Available CORS proxy services
    this.proxies = [
      'https://api.allorigins.win/get?url=',
      'https://corsproxy.io/?',
      'https://cors-anywhere.herokuapp.com/',
      'https://api.codetabs.com/v1/proxy?quest='
    ];
    
    // Performance tracking for each proxy
    this.proxyStats = new Map();
    
    // Configuration
    this.maxFailuresBeforeDisable = 5;
    this.healthCheckInterval = 300000; // 5 minutes
    this.performanceWindowSize = 50; // Track last 50 requests per proxy
    
    // Initialize proxy statistics
    this.initializeProxyStats();
    
    // Start periodic health checks
    this.startHealthChecking();
  }

  /**
   * Initialize statistics for all proxies
   * @private
   */
  initializeProxyStats() {
    this.proxies.forEach(proxy => {
      if (!this.proxyStats.has(proxy)) {
        this.proxyStats.set(proxy, {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          consecutiveFailures: 0,
          averageResponseTime: 0,
          lastSuccessTime: null,
          lastFailureTime: null,
          isDisabled: false,
          recentResponseTimes: [],
          errorHistory: []
        });
      }
    });
  }

  /**
   * Get optimized proxy list based on performance
   * @returns {string[]} Array of proxy URLs ordered by performance
   */
  getOptimizedProxyList() {
    // Filter out disabled proxies
    const availableProxies = this.proxies.filter(proxy => {
      const stats = this.proxyStats.get(proxy);
      return !stats.isDisabled;
    });
    
    if (availableProxies.length === 0) {
      console.warn('All proxies are disabled, re-enabling all for emergency fallback');
      this.enableAllProxies();
      return [...this.proxies];
    }
    
    // Sort by performance score
    const sortedProxies = availableProxies.sort((a, b) => {
      const scoreA = this.calculateProxyScore(a);
      const scoreB = this.calculateProxyScore(b);
      return scoreB - scoreA; // Higher score = better performance
    });
    
    console.log('📊 Optimized proxy order:', sortedProxies.map(proxy => ({
      proxy: proxy.split('/')[2],
      score: this.calculateProxyScore(proxy).toFixed(2),
      successRate: this.getSuccessRate(proxy).toFixed(2) + '%',
      avgResponseTime: this.proxyStats.get(proxy).averageResponseTime.toFixed(0) + 'ms'
    })));
    
    return sortedProxies;
  }

  /**
   * Calculate performance score for a proxy
   * @private
   * @param {string} proxy - Proxy URL
   * @returns {number} Performance score (higher is better)
   */
  calculateProxyScore(proxy) {
    const stats = this.proxyStats.get(proxy);
    if (!stats || stats.totalRequests === 0) {
      return 50; // Neutral score for untested proxies
    }
    
    const successRate = (stats.successfulRequests / stats.totalRequests) * 100;
    const speedScore = stats.averageResponseTime > 0 ? 
      Math.max(0, 100 - (stats.averageResponseTime / 100)) : 50;
    
    // Penalty for consecutive failures
    const failurePenalty = Math.min(stats.consecutiveFailures * 10, 50);
    
    // Recent activity bonus
    const recentActivityBonus = stats.lastSuccessTime && 
      (Date.now() - stats.lastSuccessTime) < 600000 ? 10 : 0; // 10 minutes
    
    const totalScore = Math.max(0, Math.min(100, 
      (successRate * 0.6) + (speedScore * 0.3) + recentActivityBonus - failurePenalty
    ));
    
    return totalScore;
  }

  /**
   * Get recommended timeout for a specific proxy
   * @param {string} proxy - Proxy URL
   * @returns {number} Recommended timeout in milliseconds
   */
  getRecommendedTimeout(proxy) {
    const stats = this.proxyStats.get(proxy);
    if (!stats || stats.averageResponseTime === 0) {
      return 8000; // Default timeout
    }
    
    // Set timeout to 2.5x average response time, with min/max bounds
    const recommendedTimeout = Math.max(3000, Math.min(15000, stats.averageResponseTime * 2.5));
    return recommendedTimeout;
  }

  /**
   * Record successful proxy request
   * @param {string} proxy - Proxy URL
   * @param {number} responseTime - Response time in milliseconds
   */
  recordSuccess(proxy, responseTime) {
    const stats = this.proxyStats.get(proxy);
    if (!stats) return;
    
    stats.totalRequests++;
    stats.successfulRequests++;
    stats.consecutiveFailures = 0;
    stats.lastSuccessTime = Date.now();
    
    // Update average response time
    if (stats.recentResponseTimes.length >= this.performanceWindowSize) {
      stats.recentResponseTimes.shift();
    }
    stats.recentResponseTimes.push(responseTime);
    
    stats.averageResponseTime = stats.recentResponseTimes.reduce((a, b) => a + b, 0) / 
      stats.recentResponseTimes.length;
    
    // Re-enable proxy if it was disabled due to failures
    if (stats.isDisabled && stats.consecutiveFailures === 0) {
      stats.isDisabled = false;
      console.log(`✅ Re-enabled proxy due to successful request: ${proxy.split('/')[2]}`);
    }
    
    console.log(`📈 Proxy success recorded: ${proxy.split('/')[2]} (${responseTime}ms, success rate: ${this.getSuccessRate(proxy).toFixed(1)}%)`);
  }

  /**
   * Record failed proxy request
   * @param {string} proxy - Proxy URL
   * @param {string} errorMessage - Error message
   */
  recordFailure(proxy, errorMessage) {
    const stats = this.proxyStats.get(proxy);
    if (!stats) return;
    
    stats.totalRequests++;
    stats.failedRequests++;
    stats.consecutiveFailures++;
    stats.lastFailureTime = Date.now();
    
    // Store recent error history
    if (stats.errorHistory.length >= 10) {
      stats.errorHistory.shift();
    }
    stats.errorHistory.push({
      timestamp: Date.now(),
      error: errorMessage.substring(0, 100) // Truncate long errors
    });
    
    // Disable proxy if too many consecutive failures
    if (stats.consecutiveFailures >= this.maxFailuresBeforeDisable) {
      stats.isDisabled = true;
      console.warn(`⚠️ Disabled proxy due to consecutive failures: ${proxy.split('/')[2]} (${stats.consecutiveFailures} failures)`);
    }
    
    console.log(`📉 Proxy failure recorded: ${proxy.split('/')[2]} (consecutive failures: ${stats.consecutiveFailures}, success rate: ${this.getSuccessRate(proxy).toFixed(1)}%)`);
  }

  /**
   * Get success rate for a proxy
   * @private
   * @param {string} proxy - Proxy URL
   * @returns {number} Success rate as percentage
   */
  getSuccessRate(proxy) {
    const stats = this.proxyStats.get(proxy);
    if (!stats || stats.totalRequests === 0) {
      return 0;
    }
    return (stats.successfulRequests / stats.totalRequests) * 100;
  }

  /**
   * Get proxy performance data
   * @param {string} proxy - Proxy URL
   * @returns {Object} Performance data
   */
  getProxyPerformance(proxy) {
    const stats = this.proxyStats.get(proxy);
    if (!stats) {
      return { averageResponseTime: 0, successRate: 0 };
    }
    
    return {
      averageResponseTime: stats.averageResponseTime,
      successRate: this.getSuccessRate(proxy),
      totalRequests: stats.totalRequests,
      consecutiveFailures: stats.consecutiveFailures,
      isDisabled: stats.isDisabled,
      lastSuccessTime: stats.lastSuccessTime,
      lastFailureTime: stats.lastFailureTime
    };
  }

  /**
   * Enable all proxies (emergency fallback)
   * @private
   */
  enableAllProxies() {
    this.proxyStats.forEach((stats, proxy) => {
      if (stats.isDisabled) {
        stats.isDisabled = false;
        stats.consecutiveFailures = 0;
        console.log(`🔄 Re-enabled proxy for emergency fallback: ${proxy.split('/')[2]}`);
      }
    });
  }

  /**
   * Start periodic health checking
   * @private
   */
  startHealthChecking() {
    setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
    
    console.log(`🏥 Started proxy health checking (interval: ${this.healthCheckInterval}ms)`);
  }

  /**
   * Perform health check on all proxies
   * @private
   */
  async performHealthCheck() {
    console.log('🏥 Performing proxy health check...');
    
    const testUrl = 'https://amazon.co.jp/dp/B01N3TKJQZ'; // Sample Amazon URL
    const healthPromises = this.proxies.map(proxy => this.checkProxyHealth(proxy, testUrl));
    
    try {
      const results = await Promise.allSettled(healthPromises);
      const healthyCount = results.filter(result => result.status === 'fulfilled' && result.value).length;
      
      console.log(`🏥 Health check completed: ${healthyCount}/${this.proxies.length} proxies healthy`);
    } catch (error) {
      console.warn('Health check failed:', error.message);
    }
  }

  /**
   * Check health of individual proxy
   * @private
   * @param {string} proxy - Proxy URL
   * @param {string} testUrl - URL to test with
   * @returns {Promise<boolean>} Whether proxy is healthy
   */
  async checkProxyHealth(proxy, testUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(proxy + encodeURIComponent(testUrl), {
        method: 'HEAD', // Use HEAD to minimize data transfer
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      const isHealthy = response.ok;
      if (isHealthy) {
        // Reset consecutive failures on successful health check
        const stats = this.proxyStats.get(proxy);
        if (stats && stats.consecutiveFailures > 0) {
          stats.consecutiveFailures = Math.max(0, stats.consecutiveFailures - 1);
          if (stats.isDisabled && stats.consecutiveFailures < this.maxFailuresBeforeDisable) {
            stats.isDisabled = false;
            console.log(`✅ Re-enabled proxy after health check: ${proxy.split('/')[2]}`);
          }
        }
      }
      
      return isHealthy;
    } catch (error) {
      console.warn(`Health check failed for ${proxy.split('/')[2]}:`, error.message);
      return false;
    }
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  /**
   * Get comprehensive proxy statistics
   * @returns {Object} Proxy statistics
   */
  getStats() {
    const stats = {
      totalProxies: this.proxies.length,
      enabledProxies: 0,
      disabledProxies: 0,
      proxies: {}
    };
    
    this.proxyStats.forEach((proxyStats, proxy) => {
      const proxyName = proxy.split('/')[2];
      
      if (proxyStats.isDisabled) {
        stats.disabledProxies++;
      } else {
        stats.enabledProxies++;
      }
      
      stats.proxies[proxyName] = {
        url: proxy,
        totalRequests: proxyStats.totalRequests,
        successRate: proxyStats.totalRequests > 0 ? 
          (proxyStats.successfulRequests / proxyStats.totalRequests * 100).toFixed(2) + '%' : '0%',
        averageResponseTime: proxyStats.averageResponseTime.toFixed(0) + 'ms',
        consecutiveFailures: proxyStats.consecutiveFailures,
        isDisabled: proxyStats.isDisabled,
        performanceScore: this.calculateProxyScore(proxy).toFixed(2),
        lastSuccessTime: proxyStats.lastSuccessTime ? 
          new Date(proxyStats.lastSuccessTime).toISOString() : null,
        lastFailureTime: proxyStats.lastFailureTime ? 
          new Date(proxyStats.lastFailureTime).toISOString() : null
      };
    });
    
    return stats;
  }

  /**
   * Reset statistics for all proxies
   */
  resetStats() {
    this.proxyStats.clear();
    this.initializeProxyStats();
    console.log('🔄 Reset all proxy statistics');
  }

  /**
   * Add new proxy to the service
   * @param {string} proxyUrl - New proxy URL
   */
  addProxy(proxyUrl) {
    if (!this.proxies.includes(proxyUrl)) {
      this.proxies.push(proxyUrl);
      this.proxyStats.set(proxyUrl, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        consecutiveFailures: 0,
        averageResponseTime: 0,
        lastSuccessTime: null,
        lastFailureTime: null,
        isDisabled: false,
        recentResponseTimes: [],
        errorHistory: []
      });
      console.log(`➕ Added new proxy: ${proxyUrl.split('/')[2]}`);
    }
  }

  /**
   * Remove proxy from the service
   * @param {string} proxyUrl - Proxy URL to remove
   */
  removeProxy(proxyUrl) {
    const index = this.proxies.indexOf(proxyUrl);
    if (index !== -1) {
      this.proxies.splice(index, 1);
      this.proxyStats.delete(proxyUrl);
      console.log(`➖ Removed proxy: ${proxyUrl.split('/')[2]}`);
    }
  }

  /**
   * Manually enable/disable a proxy
   * @param {string} proxyUrl - Proxy URL
   * @param {boolean} enabled - Whether to enable the proxy
   */
  setProxyEnabled(proxyUrl, enabled) {
    const stats = this.proxyStats.get(proxyUrl);
    if (stats) {
      stats.isDisabled = !enabled;
      if (enabled) {
        stats.consecutiveFailures = 0;
      }
      console.log(`🔧 Proxy ${enabled ? 'enabled' : 'disabled'}: ${proxyUrl.split('/')[2]}`);
    }
  }
}