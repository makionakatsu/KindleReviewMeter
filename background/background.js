/**
 * Background Script (Service Worker) for Kindle Review Meter Chrome Extension
 * 
 * Architecture Overview:
 * This service worker acts as the central coordinator for the Chrome extension,
 * handling cross-origin requests, data processing, and inter-tab communication.
 * 
 * Key Responsibilities:
 * - Amazon Data Fetching: Scrape book information from Amazon pages via CORS proxies
 * - Image Generation: Coordinate progress image creation for social media sharing
 * - X/Twitter Integration: Manage cross-tab image attachment for tweet composition
 * - Extension Lifecycle: Handle installation, updates, and context menu creation
 * 
 * Service Architecture:
 * 1. Amazon Scraping Service: Multi-proxy fallback system for reliable data extraction
 * 2. Image Generation Service: Tab-based image creation with data passing
 * 3. Social Media Service: Cross-tab communication for automatic image attachment
 * 4. Context Menu Service: Right-click integration for Amazon links
 * 
 * Communication Flow:
 * Popup → Background → Content Scripts → Background → Popup
 */

// ============================================================================
// MESSAGE ROUTING SYSTEM
// ============================================================================

/**
 * Central Message Router
 * 
 * Handles all communication between popup, content scripts, and background.
 * Routes messages to appropriate service handlers based on action type.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchAmazonData') {
    handleAmazonDataFetch(request.url)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'exportProgressImage') {
    handleImageExport(request.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }

  if (request.action === 'shareToXWithImage') {
    handleShareToXWithImage(request.data, request.tweetUrl)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }

  // Receive generated image (as data URL) from image-generator tab in quickMode
  if (request.action === 'imageGenerated') {
    try {
      console.log('imageGenerated received:', {
        hasPendingXShare: !!pendingXShare,
        hasDataUrl: !!request.dataUrl,
        dataUrlLength: request.dataUrl?.length,
        senderTabId: sender?.tab?.id
      });
      
      if (pendingXShare && request.dataUrl) {
        pendingXShare.dataUrl = request.dataUrl;
        console.log('Updated pendingXShare with dataUrl, attempting to send to tweet tab');
        // Try to forward now; the content script may not yet be ready, so retries happen elsewhere
        trySendImageToTweetTab();
      } else {
        console.warn('Cannot process imageGenerated:', {
          pendingXShare: !!pendingXShare,
          dataUrl: !!request.dataUrl
        });
      }
      
      // Try closing the image tab (sender.tab.id), if available
      if (sender?.tab?.id) {
        try { 
          console.log('Closing image generation tab:', sender.tab.id);
          chrome.tabs.remove(sender.tab.id); 
        } catch(e) {
          console.warn('Failed to close image tab:', e);
        }
      }
      sendResponse({ success: true });
    } catch (err) {
      console.error('imageGenerated handling failed:', err);
      sendResponse({ success: false, error: err?.message || String(err) });
    }
    return true;
  }

  // Content script from X tweet page signals readiness
  if (request.action === 'xTweetPageReady') {
    console.log('X tweet page ready signal received');
    // Only try to send if we have pending data and haven't sent yet
    if (pendingXShare && pendingXShare.dataUrl && !pendingXShare.imageSent) {
      console.log('Tweet page ready and we have pending image data, attempting send');
      trySendImageToTweetTab();
    } else {
      console.log('Tweet page ready but no pending image or already sent:', {
        hasPendingXShare: !!pendingXShare,
        hasDataUrl: !!pendingXShare?.dataUrl,
        imageSent: !!pendingXShare?.imageSent
      });
    }
    sendResponse({ ok: true });
    return true;
  }

});

// ============================================================================
// AMAZON SCRAPING SERVICE
// ============================================================================

/**
 * Amazon Data Fetching Service
 * 
 * Responsibilities:
 * - Extract book information from Amazon product pages
 * - Handle CORS restrictions via multiple proxy attempts
 * - Parse HTML content to extract title, author, image, and review count
 * - Provide fallback mechanisms for reliable data extraction
 * 
 * Architecture:
 * - Multi-proxy system with automatic failover
 * - Enhanced HTML parsing with regex-based selectors
 * - URL normalization and validation
 * - Comprehensive error handling and logging
 */
async function handleAmazonDataFetch(url) {
  // Normalize URL first
  const normalizedUrl = normalizeAmazonUrl(url);
  if (!normalizedUrl) {
    throw new Error('Invalid Amazon URL - could not normalize');
  }
  
  console.log('Using normalized URL:', normalizedUrl);

  try {
    // Multiple CORS proxy attempts for reliability
    const proxies = [
      'https://api.allorigins.win/get?url=',
      'https://corsproxy.io/?',
      'https://cors-anywhere.herokuapp.com/',
      'https://thingproxy.freeboard.io/fetch/',
      'https://api.codetabs.com/v1/proxy?quest=',
    ];
    
    let htmlContent = null;
    
    // Try each proxy until one works
    for (let i = 0; i < proxies.length; i++) {
      const proxy = proxies[i];
      try {
        const proxyUrl = proxy + encodeURIComponent(normalizedUrl);
        console.log(`Trying proxy ${i + 1}/${proxies.length}: ${proxy}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
            'Cache-Control': 'no-cache'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log(`Proxy ${proxy} response:`, {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
        }
        
        // Handle different proxy response formats
        let data;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
          htmlContent = data.contents || data.response || data.data || data;
        } else {
          htmlContent = await response.text();
        }
        
        console.log('Received content length:', htmlContent ? htmlContent.length : 0);
        
        if (htmlContent && typeof htmlContent === 'string' && htmlContent.length > 1000) {
          console.log('Successfully fetched data with proxy:', proxy);
          console.log('Content preview:', htmlContent.substring(0, 200) + '...');
          break;
        } else {
          console.warn(`Proxy ${proxy} returned insufficient content:`, typeof htmlContent, htmlContent?.length);
        }
      } catch (error) {
        console.warn(`Proxy ${proxy} failed:`, {
          message: error.message,
          name: error.name,
          stack: error.stack?.substring(0, 200)
        });
        continue;
      }
    }
    
    if (!htmlContent) {
      throw new Error('All proxies failed');
    }
    
    const bookData = parseAmazonHTML(htmlContent, normalizedUrl);
    bookData.normalizedUrl = normalizedUrl;
    return bookData;
    
  } catch (error) {
    console.error('Amazon scraping failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      url: normalizedUrl
    });
    
    // Enhanced fallback
    try {
      return await enhancedAmazonExtraction(normalizedUrl);
    } catch (fallbackError) {
      console.error('Fallback extraction also failed:', fallbackError);
      throw new Error(`データ取得に失敗しました: ${error.message}`);
    }
  }
}

/**
 * Parse Amazon HTML to extract book data (Service Worker compatible with original selectors)
 */
function parseAmazonHTML(html, url) {
  try {
    console.log('Parsing HTML content, length:', html.length);
    
    // Helper function to extract text content between tags (simulates textContent)
    function extractTextContent(htmlString) {
      return htmlString.replace(/<[^>]*>/g, '').trim().replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }
    
    // Helper function to find elements by selector-like patterns
    function findBySelector(html, selectorPatterns) {
      for (const pattern of selectorPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          const content = extractTextContent(match[1]);
          if (content.length > 0) {
            console.log('Found with pattern:', pattern.source.substring(0, 50));
            return content;
          }
        }
      }
      return null;
    }
    
    // Extract title - using original selectors converted to regex
    const titlePatterns = [
      /<span[^>]*id="productTitle"[^>]*>([^<]+(?:<[^>]*>[^<]*<\/[^>]*>[^<]*)*)<\/span>/gi,
      /<h1[^>]*class="[^"]*a-size-large[^"]*"[^>]*>([^<]+(?:<[^>]*>[^<]*<\/[^>]*>[^<]*)*)<\/h1>/gi,
      /<h1[^>]*>([^<]+(?:<span[^>]*>[^<]*<\/span>[^<]*)*)<\/h1>/gi,
      /<title>([^<]*?) [-|] Amazon/i
    ];
    
    const title = findBySelector(html, titlePatterns);
    
    // Extract author - using original selectors (multiple approaches)
    const authorPatterns = [
      // .author .contributorNameID
      /<[^>]*class="[^"]*author[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*contributorNameID[^"]*"[^>]*>([^<]+)<\/[^>]*>/gi,
      // .author a
      /<[^>]*class="[^"]*author[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi,
      // .by-author a
      /<[^>]*class="[^"]*by-author[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi,
      // [data-automation-id="byline"] a
      /<[^>]*data-automation-id="byline"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi,
      // .a-size-base+ .a-size-base .a-link-normal (adjacent sibling selector approximation)
      /<[^>]*class="[^"]*a-size-base[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*a-size-base[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*a-link-normal[^"]*"[^>]*>([^<]+)<\/[^>]*>/gi
    ];
    
    let author = findBySelector(html, authorPatterns);
    
    // Additional author extraction for Japanese pages
    if (!author) {
      const japaneseAuthorPatterns = [
        /著[\s]*者[：:]?[\s]*([^<\n\r]{2,50})(?=<|\n|\r|$)/gi,
        /作[\s]*者[：:]?[\s]*([^<\n\r]{2,50})(?=<|\n|\r|$)/gi,
        /著[：:]?[\s]*([^<\n\r]{2,50})(?=<|\n|\r|$)/gi
      ];
      author = findBySelector(html, japaneseAuthorPatterns);
    }
    
    // Extract image URL - comprehensive patterns for Amazon book covers
    const imagePatterns = [
      // Main product image patterns
      /<img[^>]*id="landingImage"[^>]*src="([^"]+)"/gi,
      /<img[^>]*id="imgBlkFront"[^>]*src="([^"]+)"/gi,
      /<img[^>]*id="ebooksImgBlkFront"[^>]*src="([^"]+)"/gi,
      
      // Data-src attributes (lazy loading)
      /<img[^>]*id="landingImage"[^>]*data-src="([^"]+)"/gi,
      /<img[^>]*id="imgBlkFront"[^>]*data-src="([^"]+)"/gi,
      /<img[^>]*id="ebooksImgBlkFront"[^>]*data-src="([^"]+)"/gi,
      
      // Class-based patterns
      /<img[^>]*class="[^"]*a-dynamic-image[^"]*"[^>]*src="([^"]+)"/gi,
      /<img[^>]*class="[^"]*frontImage[^"]*"[^>]*src="([^"]+)"/gi,
      /<img[^>]*class="[^"]*itemImageBlock[^"]*"[^>]*src="([^"]+)"/gi,
      
      // Container-based patterns
      /<[^>]*class="[^"]*frontImage[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/gi,
      /<[^>]*class="[^"]*itemImageBlock[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/gi,
      /<[^>]*id="imageBlock"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/gi,
      /<[^>]*id="imgTagWrapperId"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/gi,
      
      // Alternative attributes and patterns
      /<img[^>]*data-old-hires="([^"]+)"/gi,
      /<img[^>]*data-a-dynamic-image="[^"]*&quot;([^&]+)&quot;"/gi,
      
      // General Amazon image patterns
      /src="([^"]*images-amazon[^"]*\.jpg[^"]*)"/gi,
      /src="([^"]*ssl-images-amazon[^"]*\.jpg[^"]*)"/gi,
      /src="([^"]*media-amazon[^"]*\.jpg[^"]*)"/gi,
      /data-src="([^"]*images-amazon[^"]*\.jpg[^"]*)"/gi,
      /data-src="([^"]*ssl-images-amazon[^"]*\.jpg[^"]*)"/gi,
      
      // Fallback: any image with book-like dimensions in URL
      /src="([^"]*amazon[^"]*[_\.](?:SX|SY|AC_UL|AC_SX|AC_SY)\d+[^"]*\.jpg[^"]*)"/gi
    ];
    
    let imageUrl = null;
    for (const pattern of imagePatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        if (match && match[1]) {
          let candidateUrl = match[1];
          
          // Clean up the URL
          candidateUrl = candidateUrl.replace(/&amp;/g, '&');
          
          // Check if it's a valid Amazon image
          const isAmazonImage = candidateUrl.includes('amazon') || 
                               candidateUrl.includes('ssl-images') || 
                               candidateUrl.includes('media-amazon') ||
                               candidateUrl.includes('images-na');
          
          // Avoid tiny thumbnails and icons
          const isNotThumbnail = !candidateUrl.includes('._SS') && 
                                 !candidateUrl.includes('._SX40') && 
                                 !candidateUrl.includes('._SY40') &&
                                 !candidateUrl.includes('._AC_UL16') &&
                                 !candidateUrl.includes('favicon');
          
          if (isAmazonImage && isNotThumbnail) {
            imageUrl = candidateUrl;
            console.log('Found image with pattern:', pattern.source.substring(0, 50));
            console.log('Image URL:', imageUrl.substring(0, 80) + '...');
            break;
          }
        }
      }
      if (imageUrl) break;
    }
    
    // If no direct image found, try to extract from JSON-LD or script tags
    if (!imageUrl) {
      const jsonPatterns = [
        /"image":\s*"([^"]*amazon[^"]*\.jpg[^"]*)"/gi,
        /"hiRes":\s*"([^"]*amazon[^"]*\.jpg[^"]*)"/gi,
        /"large":\s*"([^"]*amazon[^"]*\.jpg[^"]*)"/gi
      ];
      
      for (const pattern of jsonPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          imageUrl = match[1].replace(/\\u003d/g, '=').replace(/\\/g, '');
          console.log('Found image in JSON with pattern:', pattern.source.substring(0, 30));
          break;
        }
      }
    }
    
    // Extract review count - enhanced patterns to avoid price confusion
    const reviewSelectors = [
      '[data-hook="total-review-count"]',
      '.cr-widget-ACR .a-size-base', 
      '.averageStarRating .a-size-base',
      'review link #customerReviews',
      'review link reviews',
      'Japanese: 個の評価',
      'Japanese: 件のレビュー',
      'Japanese: レビュー件',
      'Japanese: カスタマーレビュー',
      '.a-link-normal .a-size-base (price excluded)'
    ];
    
    // Convert selectors to regex patterns, with additional specific patterns for reviews
    const reviewPatterns = [
      // [data-hook="total-review-count"] - most reliable
      /<[^>]*data-hook="total-review-count"[^>]*>([^<]*)<\/[^>]*>/gi,
      
      // .cr-widget-ACR .a-size-base
      /<[^>]*class="[^"]*cr-widget-ACR[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*a-size-base[^"]*"[^>]*>([^<]*)<\/[^>]*>/gi,
      
      // .averageStarRating .a-size-base
      /<[^>]*class="[^"]*averageStarRating[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*a-size-base[^"]*"[^>]*>([^<]*)<\/[^>]*>/gi,
      
      // Review links (customer review section)
      /<a[^>]*href="[^"]*#customerReviews[^"]*"[^>]*>([^<]*\d[^<]*)<\/a>/gi,
      /<a[^>]*href="[^"]*reviews[^"]*"[^>]*>([^<]*\d[^<]*)<\/a>/gi,
      
      // Japanese specific patterns (more targeted)
      /([0-9,\d]+)[\s]*個の評価/gi,
      /([0-9,\d]+)[\s]*件のレビュー/gi, 
      /レビュー[\s]*([0-9,\d]+)[\s]*件/gi,
      /カスタマーレビュー[\s\S]*?([0-9,\d]+)[\s]*件/gi,
      
      // .a-link-normal .a-size-base but exclude price patterns
      /<[^>]*class="[^"]*a-link-normal[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*a-size-base[^"]*"[^>]*>([^<]*\d[^<]*(?!.*￥|.*円|.*から))<\/[^>]*>/gi
    ];
    
    let reviewCount = 0;
    let allCandidates = []; // Debug: track all found numbers
    
    // Try selectors in order, but first collect all candidates for debugging
    for (let i = 0; i < reviewPatterns.length; i++) {
      const pattern = reviewPatterns[i];
      const selectorName = reviewSelectors[i];
      const matches = html.matchAll(pattern);
      
      let foundAny = false;
      for (const match of matches) {
        if (match && match[1]) {
          foundAny = true;
          const text = extractTextContent(match[1]);
          const numberMatches = text.match(/(\d{1,3}(?:,\d{3})*|\d+)/);
          if (numberMatches) {
            const candidate = parseInt(numberMatches[1].replace(/,/g, ''));
            if (candidate > 0) {
              allCandidates.push({
                selector: selectorName,
                count: candidate,
                text: text.substring(0, 50),
                patternIndex: i,
                rawMatch: match[1].substring(0, 50)
              });
              console.log(`Pattern ${i} (${selectorName}): found ${candidate} in "${text.substring(0, 50)}" | raw: "${match[1].substring(0, 50)}"`);
            }
          }
        }
      }
      
      if (!foundAny) {
        console.log(`Pattern ${i} (${selectorName}): No matches found`);
      }
    }
    
    // Additional search for 1292 specifically in the HTML
    console.log('=== Searching specifically for 1292 in HTML ===');
    const search1292Patterns = [
      /1[,，]?292/g,
      /1292/g,
      />[^<]*1[,，]?292[^<]*</g
    ];
    
    for (let i = 0; i < search1292Patterns.length; i++) {
      const pattern = search1292Patterns[i];
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        console.log(`Found "1292" pattern ${i}:`, match[0].substring(0, 100));
        
        // Look for surrounding context (100 characters before and after)
        const index = html.indexOf(match[0]);
        const start = Math.max(0, index - 100);
        const end = Math.min(html.length, index + match[0].length + 100);
        const context = html.substring(start, end);
        console.log('Context around 1292:', context);
      }
    }
    
    console.log('All review count candidates:', allCandidates);
    
    // Now use original logic: take first valid match
    if (allCandidates.length > 0) {
      reviewCount = allCandidates[0].count;
      console.log('Selected review count (first match):', reviewCount, 'from', allCandidates[0].selector);
      
      // But let's also check if there's a significantly larger number that might be the correct one
      const maxCandidate = allCandidates.reduce((max, current) => current.count > max.count ? current : max);
      if (maxCandidate.count > reviewCount * 1.2) { // If max is 20% larger, it might be the correct one
        console.log('WARNING: Found larger review count:', maxCandidate.count, 'from', maxCandidate.selector);
        console.log('Consider using this instead of', reviewCount);
      }
    }
    
    console.log('Extraction results:', {
      title: title ? title.substring(0, 50) + '...' : null,
      author: author ? author.substring(0, 30) + '...' : null,
      imageUrl: imageUrl ? imageUrl.substring(0, 50) + '...' : null,
      reviewCount: reviewCount
    });
    
    // Validate extracted data
    if (!title || title.length < 5) {
      throw new Error('Could not extract valid title from HTML');
    }
    
    return {
      title: title,
      author: author || '著者不明',
      imageUrl: imageUrl,
      currentReviews: reviewCount,
      extractedFrom: url,
      extractionTime: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('HTML parsing failed:', error);
    throw error;
  }
}

/**
 * Enhanced Amazon extraction fallback
 */
async function enhancedAmazonExtraction(url) {
  // Extract ASIN for potential API calls
  const asinMatch = url.match(/\/(?:dp|product)\/([A-Z0-9]{10})(?:\/|$|\?)/);
  const asin = asinMatch ? asinMatch[1] : null;
  
  if (!asin) {
    throw new Error('Could not extract ASIN from URL');
  }
  
  // Try alternative Amazon endpoints
  try {
    // Try Amazon's mobile API endpoint
    const mobileUrl = `https://www.amazon.co.jp/gp/aw/d/${asin}`;
    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(mobileUrl)}`);
    
    if (response.ok) {
      const data = await response.json();
      if (data.contents) {
        return parseAmazonHTML(data.contents, url);
      }
    }
  } catch (error) {
    console.warn('Enhanced extraction failed:', error);
  }
  
  // Final fallback - return basic structure for manual input
  throw new Error('Unable to extract book data automatically. Please enter manually.');
}

/**
 * URL normalization - Extract ASIN and create clean URL (enhanced error handling)
 */
function normalizeAmazonUrl(url) {
  try {
    console.log('Background: Attempting to normalize URL:', url, 'Type:', typeof url, 'Length:', url?.length);
    
    // Input validation
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      console.error('Background: Invalid URL input:', url);
      return null;
    }
    
    const trimmedUrl = url.trim();
    
    // Add protocol if missing
    let fullUrl = trimmedUrl;
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      fullUrl = 'https://' + trimmedUrl;
      console.log('Background: Added https protocol:', fullUrl);
    }
    
    const urlObj = new URL(fullUrl);
    
    // Amazon hostname validation
    const amazonHosts = [
      'amazon.co.jp', 'amazon.com', 'amazon.ca', 'amazon.co.uk',
      'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es',
      'www.amazon.co.jp', 'www.amazon.com', 'www.amazon.ca', 'www.amazon.co.uk',
      'www.amazon.de', 'www.amazon.fr', 'www.amazon.it', 'www.amazon.es'
    ];
    
    const isAmazonHost = amazonHosts.some(host => 
      urlObj.hostname === host || urlObj.hostname.endsWith('.' + host)
    );
    
    if (!isAmazonHost) {
      console.log('Background: Invalid Amazon host:', urlObj.hostname);
      return null;
    }
    
    // Extract ASIN from various URL patterns
    const asinPatterns = [
      /\/dp\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,           // /dp/XXXXXXXXXX
      /\/product\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,      // /product/XXXXXXXXXX
      /\/gp\/product\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,  // /gp/product/XXXXXXXXXX
      /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:\/|$|\?|#)/i, // /exec/obidos/ASIN/XXXXXXXXXX
      /\/o\/ASIN\/([A-Z0-9]{10})(?:\/|$|\?|#)/i       // /o/ASIN/XXXXXXXXXX
    ];
    
    let asin = null;
    for (const pattern of asinPatterns) {
      const match = fullUrl.match(pattern);
      if (match) {
        asin = match[1];
        console.log('Background: Found ASIN:', asin, 'with pattern:', pattern.source);
        break;
      }
    }
    
    if (!asin) {
      console.log('Background: No valid ASIN found in URL:', fullUrl);
      return null;
    }
    
    // Construct clean Amazon URL
    const cleanUrl = `https://${urlObj.hostname}/dp/${asin}`;
    
    console.log('Background URL normalization successful:', {
      original: url,
      processed: fullUrl,
      normalized: cleanUrl,
      asin: asin,
      hostname: urlObj.hostname
    });
    
    return cleanUrl;
    
  } catch (error) {
    console.error('Background URL normalization error:', error);
    console.error('Background failed URL details:', {
      input: url,
      type: typeof url,
      length: url?.length,
      charCodes: url ? Array.from(url).map(c => c.charCodeAt(0)).slice(0, 20) : null
    });
    return null;
  }
}

/**
 * URL validation - Enhanced version
 */
function isValidAmazonUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Amazon hostname patterns
    const amazonHosts = [
      'amazon.co.jp',
      'amazon.com', 
      'amazon.ca',
      'amazon.co.uk',
      'amazon.de',
      'amazon.fr',
      'amazon.it',
      'amazon.es',
      'www.amazon.co.jp',
      'www.amazon.com',
      'www.amazon.ca',
      'www.amazon.co.uk',
      'www.amazon.de',
      'www.amazon.fr',
      'www.amazon.it',
      'www.amazon.es'
    ];
    
    const isAmazonHost = amazonHosts.some(host => 
      urlObj.hostname === host || urlObj.hostname.endsWith('.' + host)
    );
    
    if (!isAmazonHost) {
      console.log('Invalid Amazon host:', urlObj.hostname);
      return false;
    }
    
    // Amazon product URL patterns
    const productPatterns = [
      '/dp/',           // Digital Product
      '/product/',      // Product
      '/gp/product/',   // Generic Product
      '/exec/obidos/',  // Old format
      '/o/ASIN/'        // Old ASIN format
    ];
    
    const hasProductPattern = productPatterns.some(pattern => url.includes(pattern));
    
    // ASIN pattern check (10 character alphanumeric)
    const asinMatch = url.match(/\/(?:dp|product|ASIN|gp\/product)\/([A-Z0-9]{10})(?:\/|$|\?|#)/i);
    
    console.log('Background URL validation:', {
      url,
      hostname: urlObj.hostname,
      isAmazonHost,
      hasProductPattern,
      asinMatch: !!asinMatch,
      asin: asinMatch ? asinMatch[1] : null
    });
    
    return hasProductPattern || asinMatch;
    
  } catch (error) {
    console.error('URL validation error:', error);
    return false;
  }
}

// ============================================================================
// IMAGE GENERATION SERVICE
// ============================================================================

/**
 * Image Export Service
 * 
 * Responsibilities:
 * - Create progress visualization images for social media sharing
 * - Manage tab-based image generation process
 * - Handle data transfer between popup and image generator
 * - Coordinate with social media sharing workflows
 * 
 * Process:
 * 1. Receive image generation request from popup
 * 2. Store data in Chrome storage for image generator access
 * 3. Create image generation tab with encoded data
 * 4. Return success status to popup
 */
async function handleImageExport(data) {
  try {
    console.log('Starting image export with data:', data);
    
    // Method 1: Store data in chrome.storage for the image page to access
    await chrome.storage.local.set({ 'pendingImageData': data });
    console.log('Stored data in chrome.storage');
    
    // Method 2: Create URL with encoded data as backup
    const encodedData = encodeURIComponent(JSON.stringify(data));
    const imagePageUrl = chrome.runtime.getURL(`popup/image-generator.html?data=${encodedData}`);
    
    // Create a new tab with the image generation page
    const imageTab = await chrome.tabs.create({
      url: imagePageUrl,
      active: true // Make it active so user can see the generation process
    });

    console.log('Created image generation tab:', imageTab.id);

    // No need to send messages to the tab.
    // Image page reads data from query param and/or chrome.storage.local ('pendingImageData').
    return { success: true, tabId: imageTab.id };
  } catch (error) {
    console.error('Image export failed:', error);
    throw new Error(`画像生成に失敗しました: ${error.message}`);
  }
}

// ============================================================================
// SOCIAL MEDIA INTEGRATION SERVICE
// ============================================================================

/**
 * X (Twitter) Share with Image Service
 * 
 * Responsibilities:
 * - Coordinate image generation and X tweet composition
 * - Manage cross-tab communication for image attachment
 * - Handle automatic image transfer to X compose interface
 * - Provide fallback mechanisms for manual image attachment
 * 
 * Architecture:
 * - Dual-tab system (X compose + image generation)
 * - Direct data URL transfer bypassing clipboard restrictions
 * - Content script injection for robust image attachment
 * - Retry mechanism with multiple attachment methods
 * 
 * Process Flow:
 * 1. Create X compose tab with tweet text
 * 2. Generate image in background tab
 * 3. Transfer image data to X tab via content script
 * 4. Attempt automatic image attachment
 * 5. Cleanup temporary resources
 */

// Global variable to track pending X share requests
let pendingXShare = null;

async function trySendImageToTweetTab(maxAttempts = 8, delayMs = 500) {
  console.log('trySendImageToTweetTab called:', {
    hasPendingXShare: !!pendingXShare,
    tweetTabId: pendingXShare?.tweetTabId,
    hasDataUrl: !!pendingXShare?.dataUrl,
    dataUrlLength: pendingXShare?.dataUrl?.length,
    imageSent: !!pendingXShare?.imageSent
  });
  
  if (!pendingXShare?.tweetTabId || !pendingXShare?.dataUrl) {
    console.warn('Cannot send image to tweet tab - missing required data');
    return false;
  }
  
  // Prevent duplicate sends
  if (pendingXShare.imageSent) {
    console.log('Image already sent, skipping duplicate send attempt');
    return true;
  }
  
  // Mark as in progress to prevent concurrent sends
  pendingXShare.imageSent = true;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      console.log(`Attempt ${i + 1}/${maxAttempts} to send image to tweet tab ${pendingXShare.tweetTabId}`);
      await new Promise(r => setTimeout(r, i === 0 ? 0 : delayMs));
      
      const ensureInjected = async () => {
        // Try pinging the content script; if it fails to connect, inject the script programmatically
        const pingOk = await new Promise((resolve) => {
          try {
            chrome.tabs.sendMessage(pendingXShare.tweetTabId, { action: 'krmPing' }, (resp) => {
              const success = !chrome.runtime.lastError;
              console.log('Content script ping result:', { success, error: chrome.runtime.lastError?.message });
              resolve(success);
            });
          } catch (e) { 
            console.warn('Ping attempt failed:', e);
            resolve(false); 
          }
        });
        
        if (!pingOk && chrome?.scripting?.executeScript) {
          try {
            console.log('Injecting content script programmatically');
            await chrome.scripting.executeScript({
              target: { tabId: pendingXShare.tweetTabId },
              files: ['content-scripts/x-tweet-auto-attach.js']
            });
            await new Promise(r => setTimeout(r, 200));
            console.log('Content script injection completed');
          } catch (e) {
            console.warn('Programmatic injection failed:', e.message);
          }
        }
      };

      await ensureInjected();

      await new Promise((resolve, reject) => {
        try {
          console.log('Sending attachImageDataUrl message to tab', pendingXShare.tweetTabId);
          chrome.tabs.sendMessage(pendingXShare.tweetTabId, {
            action: 'attachImageDataUrl',
            dataUrl: pendingXShare.dataUrl
          }, (resp) => {
            console.log('Response from content script:', resp, 'lastError:', chrome.runtime.lastError?.message);
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (resp && resp.ok) {
              console.log('Content script confirmed successful attachment');
              return resolve();
            }
            return reject(new Error('Content script did not confirm attach'));
          });
        } catch (e) { 
          console.error('Error sending message to content script:', e);
          reject(e); 
        }
      });
      console.log('Sent image to tweet tab successfully');
      if (pendingXShare.imageTabId) {
        try { 
          console.log('Cleaning up image generation tab:', pendingXShare.imageTabId);
          await chrome.tabs.remove(pendingXShare.imageTabId); 
        } catch (e) {
          console.warn('Failed to cleanup image tab:', e);
        }
      }
      pendingXShare = null;
      return true;
    } catch (e) {
      console.warn(`Send attempt ${i+1} failed:`, e.message);
    }
  }
  console.error('All attempts to send image to tweet tab failed');
  // Reset flag so user can retry if needed
  if (pendingXShare) {
    pendingXShare.imageSent = false;
  }
  return false;
}

async function handleShareToXWithImage(data, tweetUrl) {
  try {
    console.log('Starting X share with image, data:', data);
    
    // First, open X tweet page immediately
    const tweetTab = await chrome.tabs.create({
      url: tweetUrl,
      active: true
    });

    console.log('Opened X tweet tab:', tweetTab.id);
    pendingXShare = { tweetTabId: tweetTab.id };
    
    // Then generate image in background and copy to clipboard
    await chrome.storage.local.set({ 'pendingImageData': data });
    console.log('Stored data in chrome.storage for image generation');
    
    // Create image generation page (will auto-close after generating)
    const encodedData = encodeURIComponent(JSON.stringify(data));
    const imagePageUrl = chrome.runtime.getURL(`popup/image-generator.html?data=${encodedData}&quickMode=true`);
    
    // Create image generation tab briefly in background
    const backgroundTab = await chrome.tabs.create({
      url: imagePageUrl,
      active: false // No need to focus; we'll relay the image directly
    });

    console.log('Created image generation tab:', backgroundTab.id);
    // Store image tab id for potential cleanup
    pendingXShare.imageTabId = backgroundTab.id;
    
    return { success: true, tweetTabId: tweetTab.id, imageTabId: backgroundTab.id };
  } catch (error) {
    console.error('X share with image failed:', error);
    throw new Error(`X投稿準備に失敗しました: ${error.message}`);
  }
}

// ============================================================================
// EXTENSION LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Extension Installation and Update Handler
 * 
 * Responsibilities:
 * - Initialize extension on first install
 * - Handle extension updates and migrations
 * - Create context menu items for Amazon links
 * - Set up right-click integration workflows
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Kindle Review Meter installed');
    
    // Create context menu for Amazon links
    if (chrome.contextMenus) {
      try {
        chrome.contextMenus.create({
          id: 'kindle-review-meter',
          title: 'Kindle Review Meter で分析',
          contexts: ['link'],
          targetUrlPatterns: ['*://*.amazon.co.jp/dp/*', '*://*.amazon.co.jp/gp/product/*']
        });
      } catch (error) {
        console.error('Context menu creation failed:', error);
      }
    }
  } else if (details.reason === 'update') {
    console.log('Kindle Review Meter updated to', chrome.runtime.getManifest().version);
  }
});

// Context menu click handler
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'kindle-review-meter') {
      // Context menus don't directly open popups, but we can store the URL
      chrome.storage.local.set({ 'pendingUrl': info.linkUrl });
    }
  });
}
