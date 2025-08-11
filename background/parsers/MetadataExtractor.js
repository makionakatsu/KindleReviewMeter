/**
 * MetadataExtractor - Amazon Metadata Extraction Service
 * 
 * Responsibilities:
 * - Extract structured metadata from Amazon pages
 * - Handle JSON-LD, microdata, and other structured data
 * - Extract review counts, ratings, and other metrics
 * - Normalize and validate extracted metadata
 */

export default class MetadataExtractor {
  constructor() {
    this.debugMode = true;
  }

  /**
   * Extract all available metadata from HTML
   * @param {string} html - HTML content
   * @param {string} url - Source URL
   * @returns {Object} Extracted metadata
   */
  extractAll(html, url) {
    try {
      const metadata = {
        // Basic metadata
        isbn: this.extractISBN(html),
        asin: this.extractASIN(html, url),
        publisher: this.extractPublisher(html),
        publicationDate: this.extractPublicationDate(html),
        
        // Review data
        reviewCount: this.extractReviewCount(html),
        averageRating: this.extractAverageRating(html),
        
        // Pricing
        price: this.extractPrice(html),
        currency: this.extractCurrency(html),
        
        // Categories
        categories: this.extractCategories(html),
        
        // Technical details
        pageCount: this.extractPageCount(html),
        language: this.extractLanguage(html),
        
        // Structured data
        jsonLD: this.extractJSONLD(html),
        microdata: this.extractMicrodata(html),
        
        extractedAt: new Date().toISOString()
      };

      // Filter out null/empty values
      Object.keys(metadata).forEach(key => {
        if (metadata[key] === null || metadata[key] === undefined || metadata[key] === '') {
          delete metadata[key];
        }
      });

      if (this.debugMode) {
        console.log('📊 Extracted metadata:', {
          fieldsFound: Object.keys(metadata).length,
          hasISBN: !!metadata.isbn,
          hasASIN: !!metadata.asin,
          hasReviewCount: !!metadata.reviewCount,
          hasRating: !!metadata.averageRating
        });
      }

      return metadata;

    } catch (error) {
      console.error('❌ Metadata extraction failed:', error);
      return {};
    }
  }

  /**
   * Extract ISBN from various locations in the HTML
   * @param {string} html - HTML content
   * @returns {string|null} ISBN
   */
  extractISBN(html) {
    const isbnPatterns = [
      /ISBN-?1[03]:\s*([0-9-]{10,17})/i,
      /ISBN:\s*([0-9-]{10,17})/i,
      /"isbn":\s*"([0-9-]{10,17})"/i,
      /isbn[^>]*>([0-9-]{10,17})</i,
      /<span[^>]*>ISBN[^<]*([0-9-]{10,17})</i
    ];

    for (const pattern of isbnPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const isbn = match[1].replace(/[^0-9X]/g, '');
        if (isbn.length >= 10) {
          return isbn;
        }
      }
    }

    return null;
  }

  /**
   * Extract ASIN from HTML or URL
   * @param {string} html - HTML content
   * @param {string} url - Source URL
   * @returns {string|null} ASIN
   */
  extractASIN(html, url) {
    // Try to extract from URL first
    const urlMatch = url.match(/\/dp\/([A-Z0-9]{10})(?:\/|$)/i);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Try to extract from HTML
    const asinPatterns = [
      /"asin":\s*"([A-Z0-9]{10})"/i,
      /data-asin="([A-Z0-9]{10})"/i,
      /ASIN:\s*([A-Z0-9]{10})/i
    ];

    for (const pattern of asinPatterns) {
      const match = html.match(pattern);
      if (match && match[1] && match[1].length === 10) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Extract publisher information
   * @param {string} html - HTML content
   * @returns {string|null} Publisher name
   */
  extractPublisher(html) {
    const publisherPatterns = [
      /<span[^>]*>出版社[：:]\s*([^<]+)<\/span>/i,
      /<td[^>]*>出版社<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
      /"publisher":\s*"([^"]+)"/i,
      /出版社[：:]?\s*([^\n<>]{2,50})/i
    ];

    return this.findByPattern(html, publisherPatterns, 'publisher');
  }

  /**
   * Extract publication date
   * @param {string} html - HTML content
   * @returns {string|null} Publication date
   */
  extractPublicationDate(html) {
    const datePatterns = [
      /<span[^>]*>発売日[：:]\s*([0-9年月日\/\-\s]+)<\/span>/i,
      /<td[^>]*>発売日<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
      /"datePublished":\s*"([^"]+)"/i,
      /発売日[：:]?\s*([0-9年月日\/\-\s]{6,20})/i
    ];

    return this.findByPattern(html, datePatterns, 'date');
  }

  /**
   * Extract review count
   * @param {string} html - HTML content
   * @returns {number|null} Review count
   */
  extractReviewCount(html) {
    const reviewCountPatterns = [
      /<span[^>]*id="acrCustomerReviewText"[^>]*>([0-9,]+)\s*個の評価<\/span>/i,
      /<span[^>]*>([0-9,]+)\s*個の評価<\/span>/i,
      /"reviewCount":\s*([0-9]+)/i,
      /([0-9,]+)\s*件のカスタマーレビュー/i,
      /([0-9,]+)\s*customer review/i
    ];

    const result = this.findByPattern(html, reviewCountPatterns, 'reviewCount');
    if (result) {
      const number = result.replace(/[^0-9]/g, '');
      return number ? parseInt(number, 10) : null;
    }
    return null;
  }

  /**
   * Extract average rating
   * @param {string} html - HTML content
   * @returns {number|null} Average rating
   */
  extractAverageRating(html) {
    const ratingPatterns = [
      /<span[^>]*class="[^"]*a-icon-alt[^"]*"[^>]*>5つ星のうち([0-9.]+)</i,
      /"ratingValue":\s*([0-9.]+)/i,
      /平均評価\s*([0-9.]+)/i,
      /([0-9.]+)\s*out of 5 stars/i
    ];

    const result = this.findByPattern(html, ratingPatterns, 'rating');
    if (result) {
      const rating = parseFloat(result);
      return !isNaN(rating) ? rating : null;
    }
    return null;
  }

  /**
   * Extract price information
   * @param {string} html - HTML content
   * @returns {string|null} Price
   */
  extractPrice(html) {
    const pricePatterns = [
      /<span[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>([^<]+)<\/span>/i,
      /<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>￥([0-9,]+)<\/span>/i,
      /"price":\s*"￥([0-9,]+)"/i,
      /￥([0-9,]+)/i
    ];

    return this.findByPattern(html, pricePatterns, 'price');
  }

  /**
   * Extract currency
   * @param {string} html - HTML content  
   * @returns {string|null} Currency
   */
  extractCurrency(html) {
    // For Amazon JP, usually JPY
    if (html.includes('￥') || html.includes('JPY')) {
      return 'JPY';
    }
    if (html.includes('$') || html.includes('USD')) {
      return 'USD';
    }
    return null;
  }

  /**
   * Extract categories/genres
   * @param {string} html - HTML content
   * @returns {string[]|null} Categories
   */
  extractCategories(html) {
    const categories = [];
    
    // Look for breadcrumb navigation
    const breadcrumbMatches = html.matchAll(/<a[^>]*href="[^"]*node=[^"]*"[^>]*>([^<]+)<\/a>/gi);
    for (const match of breadcrumbMatches) {
      if (match[1] && match[1].trim()) {
        categories.push(match[1].trim());
      }
    }

    // Look for category keywords in page
    const categoryKeywords = html.match(/カテゴリー[：:]?\s*([^\n<>]{5,100})/i);
    if (categoryKeywords && categoryKeywords[1]) {
      const cats = categoryKeywords[1].split(/[,、]/).map(c => c.trim()).filter(Boolean);
      categories.push(...cats);
    }

    return categories.length > 0 ? [...new Set(categories)] : null;
  }

  /**
   * Extract page count
   * @param {string} html - HTML content
   * @returns {number|null} Page count
   */
  extractPageCount(html) {
    const pagePatterns = [
      /<span[^>]*>ページ数[：:]\s*([0-9]+)\s*ページ<\/span>/i,
      /([0-9]+)\s*ページ/i,
      /"numberOfPages":\s*([0-9]+)/i
    ];

    const result = this.findByPattern(html, pagePatterns, 'pages');
    if (result) {
      const pages = parseInt(result.replace(/[^0-9]/g, ''), 10);
      return !isNaN(pages) ? pages : null;
    }
    return null;
  }

  /**
   * Extract language
   * @param {string} html - HTML content
   * @returns {string|null} Language
   */
  extractLanguage(html) {
    const langPatterns = [
      /<span[^>]*>言語[：:]\s*([^<]+)<\/span>/i,
      /"inLanguage":\s*"([^"]+)"/i,
      /言語[：:]?\s*([^\n<>]{2,20})/i
    ];

    return this.findByPattern(html, langPatterns, 'language');
  }

  /**
   * Extract JSON-LD structured data
   * @param {string} html - HTML content
   * @returns {Object[]|null} JSON-LD data
   */
  extractJSONLD(html) {
    try {
      const jsonLDMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
      const jsonLDData = [];

      for (const match of jsonLDMatches) {
        try {
          const data = JSON.parse(match[1]);
          jsonLDData.push(data);
        } catch (e) {
          if (this.debugMode) {
            console.warn('Failed to parse JSON-LD:', e);
          }
        }
      }

      return jsonLDData.length > 0 ? jsonLDData : null;
    } catch (error) {
      if (this.debugMode) {
        console.warn('JSON-LD extraction failed:', error);
      }
      return null;
    }
  }

  /**
   * Extract microdata
   * @param {string} html - HTML content
   * @returns {Object|null} Microdata
   */
  extractMicrodata(html) {
    const microdata = {};
    
    // Look for itemscope and itemprop attributes
    const microdataMatches = html.matchAll(/itemprop="([^"]+)"[^>]*>([^<]+)</gi);
    for (const match of microdataMatches) {
      if (match[1] && match[2]) {
        microdata[match[1]] = match[2].trim();
      }
    }

    return Object.keys(microdata).length > 0 ? microdata : null;
  }

  /**
   * Helper method to find content using patterns
   * @private
   */
  findByPattern(html, patterns, contentType) {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const content = match[1].trim();
        if (content.length > 0) {
          if (this.debugMode) {
            console.log(`📊 Found ${contentType}:`, content.substring(0, 50));
          }
          return content;
        }
      }
    }
    return null;
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether to enable debug logging
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }
}