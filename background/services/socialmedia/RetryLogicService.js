/**
 * RetryLogicService - Optimized retry logic for social media operations
 * Extracted from SocialMediaService.js
 * 
 * Responsibilities:
 * - Progressive delay calculation (matches a2830b6 fastest record)
 * - Retry attempt coordination with timeout management
 * - Error classification and retry decision logic
 * - Performance-optimized backoff strategies
 */

export default class RetryLogicService {
  constructor(config = {}) {
    // PERFORMANCE CONFIGURATION - Matches a2830b6 fastest record exactly
    this.maxRetryAttempts = config.maxRetryAttempts || 12;        // Reduced from 20 → 12 (40% fewer attempts)
    this.baseDelayMs = config.baseDelayMs || 600;                // Base delay matches original trySendImageToTweetTab
    this.delayIncrementMs = config.delayIncrementMs || 150;      // Linear increment per attempt
    this.maxDelayMs = config.maxDelayMs || 1500;                 // Cap delay at 1.5s (vs original 10s)
    this.maxPingAttempts = config.maxPingAttempts || 3;          // Content script ping attempts (was 5)
  }

  /**
   * Execute operation with retry logic
   * @param {Function} operation - Async operation to retry
   * @param {Object} context - Context for logging and error handling
   * @returns {Promise<any>} Operation result
   */
  async executeWithRetry(operation, context = {}) {
    const { operationName = 'operation', tweetTabId } = context;
    
    for (let attempt = 0; attempt < this.maxRetryAttempts; attempt++) {
      try {
        console.log(`Attempt ${attempt + 1}/${this.maxRetryAttempts} to ${operationName}${tweetTabId ? ` for tab ${tweetTabId}` : ''}`);
        
        // Apply delay for subsequent attempts (first attempt is immediate)
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
        }
        
        const result = await operation(attempt);
        
        if (result.success !== false) {
          console.log(`✅ ${operationName} succeeded on attempt ${attempt + 1}`);
          return result;
        }
        
        // If operation returned explicit failure, handle based on error type
        if (result.shouldRetry === false) {
          console.log(`🛑 ${operationName} failed with non-retryable error on attempt ${attempt + 1}`);
          throw new Error(result.error || `${operationName} failed (non-retryable)`);
        }
        
        console.log(`⚠️ ${operationName} failed on attempt ${attempt + 1}, will retry: ${result.error || 'Unknown error'}`);
        
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetryAttempts - 1;
        
        if (isLastAttempt) {
          console.error(`❌ ${operationName} failed after ${this.maxRetryAttempts} attempts:`, error.message);
          throw error;
        }
        
        if (this.isFatalError(error)) {
          console.error(`💥 ${operationName} failed with fatal error:`, error.message);
          throw error;
        }
        
        console.warn(`⚠️ ${operationName} attempt ${attempt + 1} failed (will retry):`, error.message);
      }
    }
  }

  /**
   * Calculate progressive delay for retry attempts
   * FASTEST RECORD DELAY PATTERN: Exact match to a2830b6
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt) {
    return Math.min(
      this.baseDelayMs + (attempt * this.delayIncrementMs), 
      this.maxDelayMs
    );
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Determine if error is fatal and should not be retried
   * @param {Error} error - Error to classify
   * @returns {boolean} Whether error is fatal
   */
  isFatalError(error) {
    const fatalPatterns = [
      'Invalid tab ID',
      'Tab was closed',
      'No tab with id',
      'Permission denied',
      'Invalid URL',
      'Network error',
      'Extension context invalidated'
    ];
    
    const errorMessage = error.message.toLowerCase();
    return fatalPatterns.some(pattern => 
      errorMessage.includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if error indicates connection issues that may be temporary
   * @param {Error} error - Error to classify
   * @returns {boolean} Whether error is connection-related
   */
  isConnectionError(error) {
    const connectionPatterns = [
      'connection',
      'receiving end does not exist',
      'script did not respond',
      'timeout',
      'disconnected'
    ];
    
    const errorMessage = error.message.toLowerCase();
    return connectionPatterns.some(pattern => 
      errorMessage.includes(pattern.toLowerCase())
    );
  }

  /**
   * Create retry context for specific operation types
   * @param {string} operationType - Type of operation being retried
   * @param {Object} additionalContext - Additional context info
   * @returns {Object} Retry context
   */
  createRetryContext(operationType, additionalContext = {}) {
    return {
      operationName: operationType,
      startTime: Date.now(),
      maxAttempts: this.maxRetryAttempts,
      baseDelay: this.baseDelayMs,
      maxDelay: this.maxDelayMs,
      ...additionalContext
    };
  }

  /**
   * Get retry configuration for debugging
   * @returns {Object} Current retry configuration
   */
  getConfig() {
    return {
      maxRetryAttempts: this.maxRetryAttempts,
      baseDelayMs: this.baseDelayMs,
      delayIncrementMs: this.delayIncrementMs,
      maxDelayMs: this.maxDelayMs,
      maxPingAttempts: this.maxPingAttempts
    };
  }

  /**
   * Calculate estimated total retry time for planning
   * @returns {number} Estimated total time in milliseconds
   */
  getEstimatedTotalRetryTime() {
    let totalTime = 0;
    for (let attempt = 1; attempt < this.maxRetryAttempts; attempt++) {
      totalTime += this.calculateDelay(attempt);
    }
    return totalTime;
  }
}