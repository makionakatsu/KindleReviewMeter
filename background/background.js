/**
 * Background Script (Service Worker) for Kindle Review Meter Chrome Extension
 * Handles Amazon data fetching and image generation with host permissions
 */

// Service Worker event listeners

// Message handling from popup
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
});

/**
 * Amazon data fetching with multiple CORS proxy attempts
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
    
    return parseAmazonHTML(htmlContent, normalizedUrl);
    
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

/**
 * Handle image export - Chrome extension with multiple data delivery methods
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

    // Method 3: Send message after tab loads (original method)
    const sendDataToTab = async () => {
      try {
        const response = await chrome.tabs.sendMessage(imageTab.id, {
          action: 'generateImage',
          data: data
        });
        console.log('Successfully sent data to image generation tab, response:', response);
      } catch (error) {
        console.error('Failed to send data to tab:', error);
        // Try again after a longer delay
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(imageTab.id, {
              action: 'generateImage',  
              data: data
            });
            console.log('Retry successful');
          } catch (retryError) {
            console.error('Retry also failed:', retryError);
          }
        }, 3000);
      }
    };

    // Wait for tab to load completely
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === imageTab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        console.log('Tab loading complete, sending data');
        setTimeout(sendDataToTab, 500); // Small delay after complete
      }
    });

    // Fallback: send after fixed delay
    setTimeout(sendDataToTab, 2000);

    return { success: true, tabId: imageTab.id };
  } catch (error) {
    console.error('Image export failed:', error);
    throw new Error(`画像生成に失敗しました: ${error.message}`);
  }
}

/**
 * Handle installation and updates
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