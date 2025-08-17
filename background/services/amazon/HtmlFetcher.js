/**
 * HtmlFetcher - Amazon HTML fetching via proxies or background tab
 * Behavior preserved from AmazonScrapingService's methods.
 */

export default class HtmlFetcher {
  constructor(proxyManager) {
    this.proxyManager = proxyManager;
  }

  /**
   * Fetch HTML content using proxy services (parallel race, fast-first)
   * @param {string} url
   * @returns {Promise<string>} HTML string
   */
  async fetchHtmlWithProxies(url) {
    const proxies = this.proxyManager.getOptimizedProxyList();
    const createProxyFetch = (proxy, index) => {
      return new Promise(async (resolve, reject) => {
        const start = Date.now();
        const controller = new AbortController();
        try {
          const timeout = this.proxyManager.getRecommendedTimeout
            ? this.proxyManager.getRecommendedTimeout(proxy)
            : 8000;
          const timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error(`Timeout after ${timeout}ms`));
          }, timeout);

          const proxyUrl = this.buildProxyUrl(proxy, url);
          const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
              'Cache-Control': 'no-cache'
            },
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          const took = Date.now() - start;
          if (!response.ok) {
            this.proxyManager.recordAttempt(proxy, false, took);
            return reject(new Error(`HTTP ${response.status}`));
          }

          let htmlContent;
          const ct = response.headers.get('content-type');
          if (ct && ct.includes('application/json')) {
            const data = await response.json();
            htmlContent = data.contents || data.response || data.data || data;
          } else {
            htmlContent = await response.text();
          }

          if (htmlContent && typeof htmlContent === 'string' && htmlContent.length > 1000 && this.isValidAmazonHtml(htmlContent)) {
            this.proxyManager.recordAttempt(proxy, true, took);
            return resolve({ html: htmlContent, proxy, took, index });
          } else {
            this.proxyManager.recordAttempt(proxy, false, took);
            return reject(new Error('Invalid content'));
          }
        } catch (error) {
          const took = Date.now() - start;
          this.proxyManager.recordAttempt(proxy, false, took);
          return reject(error);
        }
      });
    };

    const attempts = proxies.map(createProxyFetch);
    const anySuccess = Promise.any(attempts).catch(() => null);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Overall race timeout')), 15000));
    const result = await Promise.race([anySuccess, timeout]);
    if (!result) throw new Error('All proxy attempts failed');
    return result.html;
  }

  /**
   * Fallback: Open Amazon page in a background tab and extract HTML via scripting
   * @param {string} url
   * @returns {Promise<string>} HTML string
   */
  async fetchHtmlViaTab(url) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.create({ url, active: false }, (tab) => {
          if (chrome.runtime.lastError || !tab?.id) {
            return reject(new Error(chrome.runtime.lastError?.message || 'Failed to create tab'));
          }

          const tabId = tab.id;
          const timeoutMs = 15000;
          let done = false;

          const cleanup = () => {
            try { chrome.tabs.remove(tabId); } catch {}
            chrome.tabs.onUpdated.removeListener(onUpdated);
          };

          const onTimeout = setTimeout(() => {
            if (!done) {
              done = true;
              cleanup();
              reject(new Error('Direct tab fetch timeout'));
            }
          }, timeoutMs);

          const onUpdated = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
              try {
                chrome.scripting.executeScript(
                  { target: { tabId }, func: () => document.documentElement.outerHTML },
                  (results) => {
                    if (done) return;
                    done = true;
                    clearTimeout(onTimeout);
                    cleanup();
                    if (chrome.runtime.lastError || !results || !results[0]?.result) {
                      return reject(new Error(chrome.runtime.lastError?.message || 'Failed to extract HTML'));
                    }
                    resolve(String(results[0].result));
                  }
                );
              } catch (e) {
                if (!done) {
                  done = true;
                  clearTimeout(onTimeout);
                  cleanup();
                  reject(e);
                }
              }
            }
          };

          chrome.tabs.onUpdated.addListener(onUpdated);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Build proxy URL depending on proxy style
   */
  buildProxyUrl(proxy, url) {
    const lower = String(proxy).toLowerCase();
    const pathStyleHosts = [
      'cors-anywhere.herokuapp.com/',
      'cors.isomorphic-git.org/',
      'thingproxy.freeboard.io/fetch/'
    ];
    if (pathStyleHosts.some(h => lower.includes(h))) {
      return proxy + url;
    }
    return proxy + encodeURIComponent(url);
  }

  /**
   * Validate fetched HTML looks like an Amazon page
   */
  isValidAmazonHtml(html) {
    const requiredPatterns = [/amazon/i, /<title/i, /<body/i];
    const suspiciousPatterns = [/error/i, /not found/i, /access denied/i, /blocked/i];
    const hasRequired = requiredPatterns.every(pattern => pattern.test(html));
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].toLowerCase();
      const hasSuspicious = suspiciousPatterns.some(pattern => pattern.test(title));
      if (hasSuspicious) return false;
    }
    return hasRequired;
  }
}

