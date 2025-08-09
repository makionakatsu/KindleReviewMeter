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
  if (!isValidAmazonUrl(url)) {
    throw new Error('Invalid Amazon URL');
  }

  try {
    // Multiple CORS proxy attempts for reliability
    const proxies = [
      'https://api.allorigins.win/get?url=',
      'https://corsproxy.io/?',
    ];
    
    let htmlContent = null;
    
    // Try each proxy until one works
    for (const proxy of proxies) {
      try {
        const proxyUrl = proxy + encodeURIComponent(url);
        console.log(`Trying proxy: ${proxy}`);
        
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        htmlContent = data.contents || data.response;
        
        if (htmlContent && htmlContent.length > 1000) {
          console.log('Successfully fetched data with proxy:', proxy);
          break;
        }
      } catch (error) {
        console.warn(`Proxy ${proxy} failed:`, error);
        continue;
      }
    }
    
    if (!htmlContent) {
      throw new Error('All proxies failed');
    }
    
    return parseAmazonHTML(htmlContent, url);
    
  } catch (error) {
    console.error('Amazon scraping failed:', error);
    // Enhanced fallback
    return enhancedAmazonExtraction(url);
  }
}

/**
 * Parse Amazon HTML to extract book data
 */
function parseAmazonHTML(html, url) {
  try {
    // Create a DOM parser to extract data
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract title - multiple selectors for reliability
    const titleSelectors = [
      '#productTitle',
      '.product-title',
      '[data-automation-id="title"]',
      'h1.a-size-large',
      'h1 span'
    ];
    
    let title = null;
    for (const selector of titleSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        title = element.textContent.trim();
        if (title.length > 5) break;
      }
    }
    
    // Extract author - multiple approaches
    const authorSelectors = [
      '.author .contributorNameID',
      '.author a',
      '.by-author a',
      '[data-automation-id="byline"] a',
      '.a-size-base+ .a-size-base .a-link-normal'
    ];
    
    let author = null;
    for (const selector of authorSelectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        author = Array.from(elements)
          .map(el => el.textContent.trim())
          .filter(text => text.length > 2)
          .join(', ');
        if (author.length > 2) break;
      }
    }
    
    // Extract image URL
    const imageSelectors = [
      '#landingImage',
      '.frontImage img',
      '.itemImageBlock img',
      '#imgBlkFront',
      '#ebooksImgBlkFront'
    ];
    
    let imageUrl = null;
    for (const selector of imageSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        imageUrl = element.src || element.getAttribute('data-src');
        if (imageUrl && imageUrl.includes('amazon')) break;
      }
    }
    
    // Extract review count - multiple patterns
    const reviewSelectors = [
      '[data-hook="total-review-count"]',
      '.cr-widget-ACR .a-size-base',
      '.averageStarRating .a-size-base',
      '.a-link-normal .a-size-base'
    ];
    
    let reviewCount = 0;
    for (const selector of reviewSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const text = element.textContent;
        const matches = text.match(/(\d{1,3}(?:,\d{3})*|\d+)/);
        if (matches) {
          reviewCount = parseInt(matches[1].replace(/,/g, ''));
          if (reviewCount > 0) break;
        }
      }
    }
    
    // Validate extracted data
    if (!title || title.length < 5) {
      throw new Error('Could not extract valid title');
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
 * URL validation
 */
function isValidAmazonUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('amazon') && 
           (url.includes('/dp/') || url.includes('/product/') || url.includes('/gp/product/'));
  } catch {
    return false;
  }
}

/**
 * Handle image export - simplified for Chrome extension
 */
async function handleImageExport(data) {
  try {
    // Create a new tab with the image generation page
    const imageTab = await chrome.tabs.create({
      url: chrome.runtime.getURL('popup/image-generator.html'),
      active: false
    });

    // Send data to the image generation tab
    setTimeout(() => {
      chrome.tabs.sendMessage(imageTab.id, {
        action: 'generateImage',
        data: data
      });
    }, 1000);

    return { success: true };
  } catch (error) {
    console.error('Image export failed:', error);
    throw error;
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