/**
 * Cache Service
 * 
 * Responsibilities:
 * - Intelligent caching of Amazon book data
 * - TTL (Time To Live) management
 * - Automatic cleanup of expired entries
 * - LRU (Least Recently Used) eviction policy
 * - Cache hit/miss tracking and optimization
 * 
 * Features:
 * - In-memory cache with configurable size limits
 * - Smart cache invalidation based on content age
 * - Performance statistics and monitoring
 * - Cache persistence support (future enhancement)
 */

export class CacheService {
  constructor(options = {}) {
    this.cache = new Map();
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 5 minutes
    this.maxSize = options.maxSize || 100; // Limit memory usage
    this.maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours absolute max
    
    // Statistics tracking
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      cleanups: 0,
      evictions: 0
    };
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 2 * 60 * 1000); // Every 2 minutes
    
    console.log('🗃️ CacheService initialized:', {
      defaultTTL: `${this.defaultTTL/1000}s`,
      maxSize: this.maxSize,
      maxAge: `${this.maxAge/1000/60/60}h`
    });
  }

  /**
   * Generate cache key from URL
   * @param {string} url - URL to cache
   * @returns {string} Cache key
   */
  generateKey(url) {
    // Use normalized URL as cache key
    return this.normalizeUrl(url) || url;
  }

  /**
   * Get cached data
   * @param {string} url - URL key
   * @returns {*} Cached data or null if not found/expired
   */
  get(url) {
    const key = this.generateKey(url);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    const now = Date.now();
    
    // Check if entry is expired
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.deletes++;
      console.log(`⏰ Cache entry expired for ${key.substring(0, 50)}...`);
      return null;
    }
    
    // Update access information for LRU
    entry.lastAccessed = now;
    entry.accessCount++;
    
    this.stats.hits++;
    console.log(`📦 Cache HIT for ${key.substring(0, 50)}... (age: ${((now - entry.createdAt)/1000).toFixed(1)}s)`);
    
    return entry.data;
  }

  /**
   * Set cache data
   * @param {string} url - URL key
   * @param {*} data - Data to cache
   * @param {number} ttl - Time to live in milliseconds (optional)
   * @returns {boolean} Whether the data was successfully cached
   */
  set(url, data, ttl = this.defaultTTL) {
    const key = this.generateKey(url);
    const now = Date.now();
    
    // Validate TTL
    const effectiveTTL = Math.min(ttl, this.maxAge);
    
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    const entry = {
      data: data,
      createdAt: now,
      lastAccessed: now,
      expiresAt: now + effectiveTTL,
      accessCount: 1,
      size: this.estimateSize(data),
      ttl: effectiveTTL
    };
    
    this.cache.set(key, entry);
    this.stats.sets++;
    
    console.log(`💾 Cache SET for ${key.substring(0, 50)}... (TTL: ${effectiveTTL/1000}s, size: ~${entry.size} bytes)`);
    
    return true;
  }

  /**
   * Delete cached data
   * @param {string} url - URL key
   * @returns {boolean} Whether the entry was found and deleted
   */
  delete(url) {
    const key = this.generateKey(url);
    const existed = this.cache.has(key);
    
    if (existed) {
      this.cache.delete(key);
      this.stats.deletes++;
      console.log(`🗑️ Cache DELETE for ${key.substring(0, 50)}...`);
    }
    
    return existed;
  }

  /**
   * Check if data exists in cache (without updating access time)
   * @param {string} url - URL key
   * @returns {boolean} Whether the data exists and is not expired
   */
  has(url) {
    const key = this.generateKey(url);
    const entry = this.cache.get(key);
    
    if (!entry) return false;
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.deletes++;
      return false;
    }
    
    return true;
  }

  /**
   * Clean up expired entries
   * @returns {number} Number of entries cleaned up
   */
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
      this.stats.cleanups++;
      this.stats.deletes += cleanedCount;
      console.log(`🧹 Cache cleanup: removed ${cleanedCount} expired entries`);
    }
    
    return cleanedCount;
  }

  /**
   * Evict least recently used entry
   * @private
   */
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      console.log(`♻️ Cache LRU eviction: removed ${oldestKey.substring(0, 50)}...`);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Performance statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 
      ? (this.stats.hits / totalRequests * 100).toFixed(1)
      : 0;
    
    const memoryUsage = this.getMemoryUsage();
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      cleanups: this.stats.cleanups,
      evictions: this.stats.evictions,
      memoryUsage: memoryUsage,
      oldestEntry: this.getOldestEntryAge(),
      newestEntry: this.getNewestEntryAge()
    };
  }

  /**
   * Get memory usage estimate
   * @private
   * @returns {Object} Memory usage information
   */
  getMemoryUsage() {
    let totalSize = 0;
    let entryCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      totalSize += entry.size || 0;
      totalSize += key.length * 2; // Approximate key size (UTF-16)
      entryCount++;
    }
    
    return {
      totalBytes: totalSize,
      averageEntrySize: entryCount > 0 ? Math.round(totalSize / entryCount) : 0,
      entries: entryCount
    };
  }

  /**
   * Get age of oldest cache entry
   * @private
   * @returns {string} Age in seconds or 'N/A' if cache is empty
   */
  getOldestEntryAge() {
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
      }
    }
    
    return oldestTime !== Infinity 
      ? `${((Date.now() - oldestTime) / 1000).toFixed(1)}s`
      : 'N/A';
  }

  /**
   * Get age of newest cache entry
   * @private
   * @returns {string} Age in seconds or 'N/A' if cache is empty
   */
  getNewestEntryAge() {
    let newestTime = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt > newestTime) {
        newestTime = entry.createdAt;
      }
    }
    
    return newestTime > 0 
      ? `${((Date.now() - newestTime) / 1000).toFixed(1)}s`
      : 'N/A';
  }

  /**
   * Estimate size of cached data
   * @private
   * @param {*} data - Data to estimate
   * @returns {number} Estimated size in bytes
   */
  estimateSize(data) {
    try {
      const jsonString = JSON.stringify(data);
      return jsonString.length * 2; // UTF-16 character = 2 bytes
    } catch (error) {
      return 1000; // Default estimate
    }
  }

  /**
   * Normalize URL for consistent caching
   * @private
   * @param {string} url - URL to normalize
   * @returns {string} Normalized URL
   */
  normalizeUrl(url) {
    try {
      if (!url || typeof url !== 'string') return url;
      
      // Remove query parameters and fragments for Amazon URLs
      if (url.includes('amazon')) {
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
      }
      
      return url;
    } catch (error) {
      return url; // Return original if normalization fails
    }
  }

  /**
   * Clear all cache entries
   * @returns {number} Number of entries cleared
   */
  clear() {
    const count = this.cache.size;
    this.cache.clear();
    this.stats.deletes += count;
    
    console.log(`🗑️ Cache cleared: removed ${count} entries`);
    return count;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      cleanups: 0,
      evictions: 0
    };
    console.log('📊 Cache statistics reset');
  }

  /**
   * Get detailed cache information for debugging
   * @returns {Object} Detailed cache information
   */
  getDetailedInfo() {
    const entries = [];
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key: key.substring(0, 50) + (key.length > 50 ? '...' : ''),
        age: `${((now - entry.createdAt) / 1000).toFixed(1)}s`,
        expiresIn: `${((entry.expiresAt - now) / 1000).toFixed(1)}s`,
        accessCount: entry.accessCount,
        size: entry.size || 0,
        ttl: `${(entry.ttl / 1000).toFixed(1)}s`
      });
    }
    
    return {
      stats: this.getStats(),
      entries: entries.sort((a, b) => b.accessCount - a.accessCount) // Sort by access count
    };
  }

  /**
   * Update cache configuration
   * @param {Object} options - Configuration options
   */
  updateConfig(options = {}) {
    if (options.defaultTTL) this.defaultTTL = options.defaultTTL;
    if (options.maxSize) this.maxSize = options.maxSize;
    if (options.maxAge) this.maxAge = options.maxAge;
    
    console.log('⚙️ Cache configuration updated:', {
      defaultTTL: `${this.defaultTTL/1000}s`,
      maxSize: this.maxSize,
      maxAge: `${this.maxAge/1000/60/60}h`
    });
  }

  /**
   * Destroy cache service and cleanup resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.clear();
    console.log('🗑️ CacheService destroyed');
  }
}