/**
 * ContentScriptManager - Handles content script readiness and pinging
 * Extracted from SocialMediaService (behavior preserved)
 */

export default class ContentScriptManager {
  constructor({ pingTimeoutMs = 1500 } = {}) {
    this.pingTimeoutMs = pingTimeoutMs;
  }

  /**
   * Ensure content script is ready and responsive
   * @param {number} tabId
   * @param {number} maxAttempts
   * @returns {Promise<boolean>}
   */
  async ensureContentScriptReady(tabId, maxAttempts = 3) {
    for (let pingAttempt = 0; pingAttempt < maxAttempts; pingAttempt++) {
      console.log(`Ping/inject attempt ${pingAttempt + 1}/${maxAttempts}`);

      // First, check if content script is already responsive
      const existingScript = await this.pingContentScript(tabId);
      if (existingScript) {
        console.log('✅ Content script already responsive, skipping injection');
        return true;
      }

      // Avoid script injection on first attempt to prevent duplicate instances
      if (chrome?.scripting?.executeScript && pingAttempt > 0) {
        try {
          console.log(`Injecting content script only after initial failure (attempt ${pingAttempt + 1})`);
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content-scripts/x-tweet-auto-attach.js']
          });

          // Optimized script initialization timing (fastest record: 500-1500ms)
          const initWait = Math.min(500 + (pingAttempt * 300), 1500);
          console.log(`Waiting ${initWait}ms for content script initialization`);
          await new Promise(r => setTimeout(r, initWait));
        } catch (injectionError) {
          console.warn(`Content script injection failed (attempt ${pingAttempt + 1}):`, injectionError.message);

          // If tab doesn't exist, abort immediately
          if (injectionError.message.includes('No tab with id')) {
            console.error('Tweet tab no longer exists, aborting');
            throw new Error('Tweet tab was closed');
          }
        }
      } else if (pingAttempt === 0) {
        console.log('Skipping script injection on first attempt to avoid duplicates');
      }

      // Test if content script is responsive
      const pingResult = await this.pingContentScript(tabId);

      if (pingResult) {
        console.log('✅ Content script is ready and responding');
        return true;
      }

      // Optimized linear backoff (fastest record pattern)
      if (pingAttempt < maxAttempts - 1) {
        const waitTime = Math.min(300 + (pingAttempt * 200), 1000);
        console.log(`❌ Ping failed, waiting ${waitTime}ms before retry`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }

    return false;
  }

  /**
   * Ping content script to check responsiveness
   * @param {number} tabId
   * @returns {Promise<boolean>}
   */
  async pingContentScript(tabId) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log(`Ping timeout after ${this.pingTimeoutMs}ms`);
        resolve(false);
      }, this.pingTimeoutMs);

      chrome.tabs.sendMessage(tabId, { action: 'krmPing' }, (resp) => {
        clearTimeout(timeout);
        const success = !chrome.runtime.lastError && resp?.pong;
        console.log(`Ping result:`, { success, response: resp, error: chrome.runtime.lastError?.message });
        resolve(success);
      });
    });
  }
}

