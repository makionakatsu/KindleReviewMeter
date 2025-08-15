/**
 * @typedef {Object} BookDataDTO
 * @property {string} title - Book title (max ~200 chars)
 * @property {string} author - Author name(s) (joined by '、')
 * @property {string|null} imageUrl - Product cover image URL
 * @property {number} reviewCount - Current review count
 * @property {number} currentReviews - Same as reviewCount (UI compatibility)
 * @property {number} [averageRating] - Average star rating (0-5)
 * @property {number} [price] - Price in JPY (number)
 * @property {string|null} [asin] - ASIN if detected
 * @property {string} amazonUrl - Normalized Amazon URL
 * @property {string} normalizedUrl - Same as amazonUrl
 * @property {number} timestamp - Unix ms of fetch
 * @property {number} fetchTime - Duration ms of fetch operation
 * @property {string} source - Provider id (e.g., 'amazon_scraping_service')
 */

// This file documents shared data shapes for background <-> popup messaging.
// Keep in sync when adding new fields.

