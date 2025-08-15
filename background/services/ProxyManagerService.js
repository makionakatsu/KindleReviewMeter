/**
 * Proxy Manager Service
 * 
 * Responsibilities:
 * - Manage CORS proxy endpoints for Amazon data fetching
 * - Track proxy performance and optimize selection
 * - Handle proxy failures and retry strategies
 * - Provide dynamic timeout recommendations
 * 
 * Features:
 * - Performance-based proxy reordering
 * - Dynamic timeout adjustments
 * - Automatic proxy health monitoring
 * - Load balancing and failover
 */

import { PROXIES } from '../config.js';

export class ProxyManagerService {
  constructor() {
    this.defaultProxies = (Array.isArray(PROXIES) && PROXIES.length > 0) ? PROXIES.slice() : [
      // Prefer fast, generally reliable proxies first
      'https://corsproxy.io/?',
      'https://cors.isomorphic-git.org/',
      'https://api.allorigins.win/raw?url=',
      'https://api.allorigins.win/get?url=',
      'https://api.codetabs.com/v1/proxy?quest=',
      'https://thingproxy.freeboard.io/fetch/',
      // Keep cors-anywhere last as it often requires manual enablement
      'https://cors-anywhere.herokuapp.com/'
      // Add more proxies here if needed
    ];
    
    // Performance statistics for each proxy
    this.stats = new Map();
    
    // Initialize stats for each proxy
    this.defaultProxies.forEach(proxy => {
      this.stats.set(proxy, {
        attempts: 0,
        successes: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        successRate: 0,
        lastUsed: 0,
        consecutiveFailures: 0,
        status: 'unknown' // unknown, healthy, degraded, failed
      });
    });
  }

  /**
   * Record a proxy attempt result
   * @param {string} proxy - Proxy URL
   * @param {boolean} success - Whether the attempt was successful
   * @param {number} responseTime - Response time in milliseconds
   */
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
      
      // Update status based on performance
      if (stat.successRate >= 80 && stat.averageResponseTime < 5000) {
        stat.status = 'healthy';
      } else if (stat.successRate >= 50) {
        stat.status = 'degraded';
      }
    } else {
      stat.consecutiveFailures++;
      
      // Update status based on failures
      if (stat.consecutiveFailures >= 5) {
        stat.status = 'failed';
      } else if (stat.consecutiveFailures >= 3) {
        stat.status = 'degraded';
      }
    }
    
    stat.successRate = (stat.successes / stat.attempts) * 100;
    
    console.log(`📈 Proxy stats updated: ${proxy.split('/')[2]} - ${stat.successRate.toFixed(1)}% success, ${stat.averageResponseTime.toFixed(0)}ms avg, status: ${stat.status}`);
  }

  /**
   * Get optimized proxy list based on performance
   * @returns {Array<string>} Proxies ordered by performance score
   */
  getOptimizedProxyList() {
    // Create array of [proxy, score] pairs
    const scoredProxies = Array.from(this.stats.entries()).map(([proxy, stat]) => {
      let score = 0;
      
      // Base score from success rate (0-100)
      score += stat.successRate * 1.0;
      
      // Speed bonus (faster = higher score)
      if (stat.averageResponseTime > 0) {
        const speedBonus = Math.max(0, 50 - (stat.averageResponseTime / 100));
        score += speedBonus;
      }
      
      // Status penalties/bonuses
      switch (stat.status) {
        case 'healthy':
          score += 20;
          break;
        case 'degraded':
          score -= 10;
          break;
        case 'failed':
          score -= 50;
          break;
        default:
          // Unknown status gets neutral treatment
          break;
      }
      
      // Penalty for consecutive failures
      score -= stat.consecutiveFailures * 15;
      
      // Recent usage bonus (helps with load balancing)
      const hoursSinceLastUse = (Date.now() - stat.lastUsed) / (1000 * 60 * 60);
      if (hoursSinceLastUse < 0.5) {
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
    
    console.log('🎯 Optimized proxy order:', 
      optimizedList.map(p => {
        const stat = this.stats.get(p);
        return `${p.split('/')[2]}(${stat.successRate.toFixed(0)}%,${stat.status})`;
      })
    );
    
    return optimizedList;
  }

  /**
   * Get recommended timeout for a specific proxy
   * @param {string} proxy - Proxy URL
   * @returns {number} Recommended timeout in milliseconds
   */
  getRecommendedTimeout(proxy) {
    const stat = this.stats.get(proxy);
    if (!stat || stat.averageResponseTime === 0) {
      return 6000; // Default timeout
    }
    
    // Dynamic timeout based on historical performance
    let timeout = stat.averageResponseTime * 2;
    
    // Adjust based on status
    switch (stat.status) {
      case 'healthy':
        timeout = Math.min(timeout, 8000); // Cap at 8 seconds for healthy proxies
        break;
      case 'degraded':
        timeout = Math.min(timeout * 1.5, 12000); // Longer timeout for degraded
        break;
      case 'failed':
        timeout = 3000; // Short timeout for failed proxies
        break;
      default:
        timeout = Math.min(timeout, 10000); // Default cap
        break;
    }
    
    // Ensure minimum timeout
    return Math.max(2000, timeout);
  }

  /**
   * Get proxy performance statistics
   * @param {string} proxy - Specific proxy URL (optional)
   * @returns {Object} Performance statistics
   */
  getStats(proxy = null) {
    if (proxy) {
      const stat = this.stats.get(proxy);
      return stat ? {
        proxy: proxy.split('/')[2],
        successRate: `${stat.successRate.toFixed(1)}%`,
        avgResponseTime: `${stat.averageResponseTime.toFixed(0)}ms`,
        attempts: stat.attempts,
        consecutiveFailures: stat.consecutiveFailures,
        status: stat.status,
        lastUsed: new Date(stat.lastUsed).toISOString()
      } : null;
    }
    
    // Return all proxy stats
    const allStats = {};
    for (const [proxyUrl, stat] of this.stats.entries()) {
      allStats[proxyUrl.split('/')[2]] = {
        successRate: `${stat.successRate.toFixed(1)}%`,
        avgResponseTime: `${stat.averageResponseTime.toFixed(0)}ms`,
        attempts: stat.attempts,
        consecutiveFailures: stat.consecutiveFailures,
        status: stat.status,
        lastUsed: stat.lastUsed > 0 ? new Date(stat.lastUsed).toISOString() : 'never'
      };
    }
    return allStats;
  }

  /**
   * Reset all proxy statistics
   */
  reset() {
    this.stats.forEach(stat => {
      stat.attempts = 0;
      stat.successes = 0;
      stat.totalResponseTime = 0;
      stat.averageResponseTime = 0;
      stat.successRate = 0;
      stat.lastUsed = 0;
      stat.consecutiveFailures = 0;
      stat.status = 'unknown';
    });
    console.log('🔄 Proxy performance stats reset');
  }

  /**
   * Add a new proxy to the pool
   * @param {string} proxyUrl - New proxy URL
   */
  addProxy(proxyUrl) {
    if (!this.stats.has(proxyUrl)) {
      this.stats.set(proxyUrl, {
        attempts: 0,
        successes: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        successRate: 0,
        lastUsed: 0,
        consecutiveFailures: 0,
        status: 'unknown'
      });
      console.log('➕ Added new proxy:', proxyUrl);
    }
  }

  /**
   * Remove a proxy from the pool
   * @param {string} proxyUrl - Proxy URL to remove
   */
  removeProxy(proxyUrl) {
    if (this.stats.has(proxyUrl)) {
      this.stats.delete(proxyUrl);
      console.log('➖ Removed proxy:', proxyUrl);
    }
  }

  /**
   * Get proxy status summary
   * @returns {Object} Status summary
   */
  getStatusSummary() {
    const summary = {
      total: this.stats.size,
      healthy: 0,
      degraded: 0,
      failed: 0,
      unknown: 0
    };
    
    for (const [proxy, stat] of this.stats.entries()) {
      summary[stat.status]++;
    }
    
    return summary;
  }

  /**
   * Get the best performing proxy
   * @returns {string|null} Best proxy URL or null if none available
   */
  getBestProxy() {
    const optimizedList = this.getOptimizedProxyList();
    return optimizedList.length > 0 ? optimizedList[0] : null;
  }

  /**
   * Check if any proxies are available
   * @returns {boolean} Whether any healthy proxies are available
   */
  hasHealthyProxies() {
    for (const [proxy, stat] of this.stats.entries()) {
      if (stat.status === 'healthy' || stat.status === 'unknown') {
        return true;
      }
    }
    return false;
  }

  /**
   * Get configuration for debugging
   * @returns {Object} Current configuration
   */
  getConfiguration() {
    return {
      defaultProxies: this.defaultProxies,
      totalProxies: this.stats.size,
      statusSummary: this.getStatusSummary(),
      bestProxy: this.getBestProxy()
    };
  }

  /**
   * Force refresh status of all proxies
   * (Reset consecutive failures and status for testing)
   */
  refreshAllProxies() {
    this.stats.forEach(stat => {
      stat.consecutiveFailures = 0;
      if (stat.status === 'failed') {
        stat.status = 'unknown';
      }
    });
    console.log('🔄 All proxy statuses refreshed');
  }
}
