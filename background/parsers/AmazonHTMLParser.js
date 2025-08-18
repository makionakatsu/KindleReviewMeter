/**
 * AmazonHTMLParser - Amazon HTML Parsing Service
 * 
 * Responsibilities:
 * - Parse Amazon book pages and extract structured data
 * - Handle various Amazon page layouts and formats
 * - Clean and normalize extracted text content
 * - Extract titles, authors, images, and metadata
 * 
 * Extracted from: parseAmazonHTML function (428 lines → organized into focused methods)
 */

export default class AmazonHTMLParser {
  constructor() {
    this.parseStartTime = null;
    this.debugMode = true; // Enable detailed logging for development
  }

  /**
   * Main parsing method - extracts all book data from HTML
   * @param {string} html - The HTML content to parse
   * @param {string} url - The source URL for context
   * @returns {Object} Parsed book data
   */
  parse(html, url) {
    this.parseStartTime = Date.now();
    
    try {
      const result = {
        title: this.extractTitle(html),
        author: this.extractAuthors(html),
        imageUrl: this.extractImageUrl(html),
        url: url,
        extractedAt: new Date().toISOString(),
        parseTime: null // Will be set at the end
      };

      // Validate required fields
      if (!result.title || !result.author) {
        console.warn('⚠️ Missing required data:', {
          hasTitle: !!result.title,
          hasAuthor: !!result.author,
          url: url
        });
      }

      result.parseTime = Date.now() - this.parseStartTime;
      
      console.log('✅ Amazon HTML parsed successfully:', {
        title: result.title?.substring(0, 50) + (result.title?.length > 50 ? '...' : ''),
        author: result.author,
        hasImage: !!result.imageUrl,
        parseTime: result.parseTime + 'ms'
      });

      return result;

    } catch (error) {
      console.error('❌ Amazon HTML parsing failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // TEXT EXTRACTION AND CLEANING
  // ============================================================================

  /**
   * Extract and clean text content from HTML strings
   * @param {string} htmlString - HTML content to clean
   * @returns {string} Clean text content
   */
  extractTextContent(htmlString) {
    if (!htmlString) return '';
    
    // Single-pass optimization: combine multiple replacements
    return htmlString
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&(?:nbsp|#160);/g, ' ') // Non-breaking spaces
      .replace(/&(?:quot|#34);/g, '"') // Quotes
      .replace(/&(?:amp|#38);/g, '&') // Ampersands  
      .replace(/&(?:lt|#60);/g, '<') // Less than
      .replace(/&(?:gt|#62);/g, '>') // Greater than
      .replace(/&(?:#39|#x27);/g, "'") // Apostrophes
      .replace(/&(?:mdash|#8212);/g, '—') // Em dash
      .replace(/&(?:ndash|#8211);/g, '–') // En dash
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Find content using multiple selector patterns
   * @param {string} html - HTML to search
   * @param {RegExp[]} selectorPatterns - Array of regex patterns
   * @param {string} contentType - Type of content being extracted (for debugging)
   * @returns {string|null} Found content or null
   */
  findBySelector(html, selectorPatterns, contentType = 'general') {
    for (let i = 0; i < selectorPatterns.length; i++) {
      const pattern = selectorPatterns[i];
      const match = html.match(pattern);
      
      if (match && match[1]) {
        const rawContent = match[1];
        let content = this.extractTextContent(rawContent)
          .replace(/\s*[-–|:]\s*Amazon.*$/i, '') // Remove Amazon suffix
          .trim();
        
        // Enhanced debug logging for all content types
        if (this.debugMode) {
          console.log(`🔍 ${contentType} pattern ${i + 1} matched:`, {
            patternSource: pattern.source.substring(0, 100) + '...',
            rawMatch: rawContent.substring(0, 200),
            extractedText: content.substring(0, 200),
            textLength: content.length
          });
          
          const originalContent = content;
          content = this.cleanAuthorName(content);
          
          console.log(`🧹 Author cleaning result:`, {
            before: originalContent,
            after: content,
            isValid: !!content && content.length >= 2
          });
          
          // Basic filtering only for obvious non-author content
          if (!content || content.length < 2 || 
              /^(follow|フォロー|amazon|kindle|error|not found)$/i.test(content)) {
            console.log(`❌ Skipping invalid author content: "${content}"`);
            continue;
          }
        }
        
        // Quick validation
        if (content.length >= 2 && content.length <= 300 && 
            !/^(amazon|kindle|book|title|error|not found)$/i.test(content)) {
          if (contentType === 'author' && this.debugMode) {
            console.log(`✅ Selected author: "${content}"`);
          }
          return content;
        }
      }
    }
    
    if (contentType === 'author' && this.debugMode) {
      console.log('❌ No valid author found with any pattern');
    }
    
    return null;
  }

  // ============================================================================
  // AUTHOR NAME PROCESSING
  // ============================================================================

  /**
   * Clean and normalize author names
   * @param {string} authorText - Raw author text
   * @returns {string} Cleaned author name
   */
  cleanAuthorName(authorText) {
    if (!authorText) return '';
    
    if (this.debugMode) {
      console.log(`🧹 Cleaning author text: "${authorText}"`);
    }
    
    // Handle Japanese "をフォロー" patterns - extract author name before "をフォロー"
    if (authorText.includes('をフォロー')) {
      if (this.debugMode) {
        console.log('📝 Found "をフォロー" pattern, extracting author name');
      }
      const beforeFollow = authorText.split('をフォロー')[0].trim();
      if (beforeFollow && beforeFollow.length > 1) {
        if (this.debugMode) {
          console.log(`📝 Extracted before "をフォロー": "${beforeFollow}"`);
        }
        authorText = beforeFollow;
      } else {
        if (this.debugMode) {
          console.log('❌ No valid author name found before "をフォロー"');
        }
        return '';
      }
    }
    
    let cleaned = authorText
      // Remove common prefixes/suffixes
      .replace(/^(by\s+|著者[：:]?\s*|作者[：:]?\s*|著[：:]?\s*)/i, '')
      .replace(/(\s*\(.*?\)\s*|\s*【.*?】\s*)$/, '') // Remove parenthetical info
      .replace(/\s*,.*$/, '') // Remove anything after comma
      .replace(/\s*\|\s*.*$/, '') // Remove anything after pipe
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/^["''""]|["''""]$/g, '') // Remove quotes
      // Remove any remaining follow-related suffixes
      .replace(/\s*(をフォロー|をフォロー中|フォロー|follow|following)\s*$/i, '')
      .trim();
    
    if (this.debugMode) {
      console.log(`🧹 After basic cleaning: "${cleaned}"`);
    }
    
    // Keep basic filtering but remove overly strict patterns
    const invalidPatterns = [
      /^(follow|フォロー|をフォロー|see all|すべて見る|more|もっと見る|visit|amazon|kindle)$/i,
      /^[0-9\s\+\-\(\)]+$/, // Only numbers and symbols
      /^[a-z]{1,3}$/i, // Very short single words like "by", "to", etc.
      /^(see|click|read|view|visit|follow|buy|shop)(\s|$)/i, // Action verbs
      // Only filter out obvious sentence fragments, not all Japanese patterns
      /[。？！]/, // Contains Japanese punctuation (obvious sentences)
      /^.*(という学問|時間を費やして|勉強してきた|わかったこと).*$/i // Very specific sentence patterns only
    ];
    
    for (const pattern of invalidPatterns) {
      if (pattern.test(cleaned)) {
        if (this.debugMode) {
          console.log(`❌ Rejected by invalid pattern: ${pattern}`);
        }
        return ''; // Return empty string to indicate invalid author name
      }
    }
    
    if (this.debugMode) {
      console.log(`✅ Final cleaned author: "${cleaned}"`);
    }
    return cleaned;
  }

  /**
   * Extract all authors from HTML and combine them
   * @param {string} html - HTML content
   * @returns {string} Combined author names
   */
  extractAuthors(html) {
    const authors = [];
    
    const pushAuthor = (name) => {
      if (!name) return;
      const parts = String(name)
        .split(/\s*[、,，&＆／\/]|\s*・\s*/)
        .map(s => s && s.trim())
        .filter(Boolean);
      const tokens = parts.length ? parts : [String(name).trim()];
      
      for (const t of tokens) {
        const cleaned = this.cleanAuthorName(t);
        if (!cleaned || cleaned.length < 2) continue;
        const key = cleaned.replace(/\s+/g, '').toLowerCase();
        if (!authors.some(a => a.key === key)) {
          authors.push({ key, name: cleaned });
        }
      }
    };

    // 1) Build a bounded byline region around id="bylineInfo"
    let region = '';
    const idxByline = html.indexOf('id="bylineInfo"');
    if (idxByline !== -1) {
      region = html.slice(Math.max(0, idxByline - 200), idxByline + 2000);
    } else {
      const idxFeature = html.indexOf('bylineInfo_feature_div');
      if (idxFeature !== -1) {
        region = html.slice(Math.max(0, idxFeature - 200), idxFeature + 3000);
      } else {
        region = html; // last resort only
      }
    }
    
    // Clean HTML to remove follow-related content
    const cleanRegex = /<[^>]*data-action="follow"[^>]*>[\s\S]*?<\/[^>]*>|<a[^>]*aria-label="[^"]*(?:フォロー|follow)[^"]*"[^>]*>[\s\S]*?<\/a>|<a[^>]*>[\s\S]*?(?:をフォロー|フォロー|follow)[\s\S]*?<\/a>/ig;
    const workHtml = region.replace(cleanRegex, '');

    // 2) Extract from anchor tags with author classes
    this.extractAuthorsFromAnchors(workHtml, pushAuthor);
    
    // 3) Extract from span wrappers
    this.extractAuthorsFromSpans(workHtml, pushAuthor);
    
    // 4) Fallback patterns
    this.extractAuthorsFromFallbackPatterns(workHtml, pushAuthor);

    // Combine all found authors
    const result = authors.map(a => a.name).join('、');
    
    if (this.debugMode && result) {
      console.log(`📚 Final combined authors: "${result}"`);
    }
    
    return result || null;
  }

  /**
   * Extract authors from anchor tags
   * @private
   */
  extractAuthorsFromAnchors(html, pushAuthor) {
    const anchorRegexes = [
      // Standard author link patterns
      /<a[^>]*class="[^"]*contributorNameID[^"]*"[^>]*>([\s\S]*?)<\/a>/ig,
      /<a[^>]*class="[^"]*(?:by-author|author)[^"]*"[^>]*>([\s\S]*?)<\/a>/ig,
      
      // Kindle-specific author patterns
      /<a[^>]*class="[^"]*a-link-normal[^"]*"[^>]*href="[^"]*\/author\/[^"]*"[^>]*>([\s\S]*?)<\/a>/ig,
      /<a[^>]*href="[^"]*\/e\/[A-Z0-9]+[^"]*"[^>]*>([\s\S]*?)<\/a>/ig,
      
      // Meta property patterns for authors
      /<meta[^>]*property=["']book:author["'][^>]*content=["']([^"']+)["'][^>]*>/ig,
      /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["'][^>]*>/ig
    ];
    
    for (const rx of anchorRegexes) {
      try {
        const matches = [...html.matchAll(rx)];
        for (const match of matches) {
          if (match && match[1]) {
            pushAuthor(this.extractTextContent(match[1]));
          }
        }
      } catch (e) {
        console.warn('Regex matching failed for anchor patterns:', e);
      }
    }
  }

  /**
   * Extract authors from span wrappers
   * @private
   */
  extractAuthorsFromSpans(html, pushAuthor) {
    const spanRegexes = [
      /<span[^>]*class="[^"]*author[^"]*notFaded[^"]*"[^>]*>([\s\S]*?)<\/span>/ig,
      /<span[^>]*class="[^"]*a-link-normal[^"]*contributorNameID[^"]*"[^>]*>([\s\S]*?)<\/span>/ig
    ];
    
    for (const rx of spanRegexes) {
      try {
        const matches = [...html.matchAll(rx)];
        for (const match of matches) {
          if (match && match[1]) {
            pushAuthor(this.extractTextContent(match[1]));
          }
        }
      } catch (e) {
        console.warn('Regex matching failed for span patterns:', e);
      }
    }
  }

  /**
   * Extract authors using fallback patterns
   * @private
   */
  extractAuthorsFromFallbackPatterns(html, pushAuthor) {
    const fallbackPatterns = [
      /(?:著者|作者|by|author)[：:]\s*([^\n<>]{2,50})/ig,
      /class="[^"]*contributor[^"]*"[^>]*>([^<]{2,50})</ig,
      /data-asin="[^"]*"[^>]*>([^<]{2,30})</ig
    ];
    
    for (const pattern of fallbackPatterns) {
      try {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
          if (match && match[1]) {
            const candidate = this.extractTextContent(match[1]);
            if (candidate && candidate.length >= 2) {
              pushAuthor(candidate);
            }
          }
        }
      } catch (e) {
        console.warn('Regex matching failed for fallback patterns:', e);
      }
    }
  }

  // ============================================================================
  // TITLE AND IMAGE EXTRACTION
  // ============================================================================

  /**
   * Extract book title from HTML
   * @param {string} html - HTML content
   * @returns {string|null} Book title
   */
  extractTitle(html) {
    const titlePatterns = [
      // Standard Amazon product title
      /<span[^>]*id="productTitle"[^>]*>([^<]+)<\/span>/i,
      /<h1[^>]*class="[^"]*a-size-large[^"]*"[^>]*>([^<]+)<\/h1>/i,
      
      // Kindle-specific title patterns
      /<h1[^>]*id="title"[^>]*>([^<]+)<\/h1>/i,
      /<span[^>]*class="[^"]*kindle-[^"]*title[^"]*"[^>]*>([^<]+)<\/span>/i,
      
      // Meta and title tag fallbacks
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<title>\s*([^<]+?)\s*[-–|:]\s*Amazon/i,
      /<title>([^<]+?)\s*</i,
      
      // Generic fallbacks
      /<h1[^>]*>([^<]+)<\/h1>/i,
      /<h2[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h2>/i
    ];

    return this.findBySelector(html, titlePatterns, 'title');
  }

  /**
   * Extract book cover image URL
   * @param {string} html - HTML content
   * @returns {string|null} Image URL
   */
  extractImageUrl(html) {
    const imagePatterns = [
      // Standard Amazon product images
      /<img[^>]*id="landingImage"[^>]*src="([^"]+)"/i,
      /<img[^>]*data-old-hires="([^"]+)"/i,
      /<img[^>]*data-a-dynamic-image="[^"]*([^"]+\.jpg)[^"]*"/i,
      
      // Kindle-specific image patterns
      /<img[^>]*id="ebooksImgBlkFront"[^>]*src="([^"]+)"/i,
      /<img[^>]*class="[^"]*kindle-[^"]*image[^"]*"[^>]*src="([^"]+)"/i,
      
      // Meta property fallbacks
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      
      // Dynamic image patterns
      /<img[^>]*class="[^"]*a-dynamic-image[^"]*"[^>]*src="([^"]+)"/i,
      /<img[^>]*data-src="([^"]+)"/i
    ];

    const imageUrl = this.findBySelector(html, imagePatterns, 'image');
    
    // Clean up image URL if found
    if (imageUrl) {
      // Remove Amazon URL parameters for cleaner URLs
      return imageUrl.replace(/\._[A-Z0-9_,]+_\./, '.').split('?')[0];
    }
    
    return null;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether to enable debug logging
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  /**
   * Get parsing statistics
   * @returns {Object} Parsing statistics
   */
  getStats() {
    return {
      lastParseTime: this.parseTime,
      debugMode: this.debugMode
    };
  }
}