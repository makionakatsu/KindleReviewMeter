/**
 * AttachmentManager - Attach image data URL to X compose tab (extracted)
 */

export default class AttachmentManager {
  constructor({ timeoutFirstAttempt = 7000, timeoutEarlyAttempts = 10000, timeoutLaterAttempts = 12000 } = {}) {
    this.timeoutFirstAttempt = timeoutFirstAttempt;
    this.timeoutEarlyAttempts = timeoutEarlyAttempts;
    this.timeoutLaterAttempts = timeoutLaterAttempts;
  }

  /**
   * Attempt to attach image to tweet composition
   * @param {number} tabId
   * @param {string} dataUrl
   * @param {number} attemptNumber
   * @param {string} tweetText
   * @returns {Promise<boolean>}
   */
  async attemptImageAttachment(tabId, dataUrl, attemptNumber = 0, tweetText = '') {
    console.log('🎯 Attempting image attachment...');

    return new Promise((resolve, reject) => {
      let responseReceived = false;

      let timeoutDuration;
      if (attemptNumber === 0) {
        timeoutDuration = this.timeoutFirstAttempt;
      } else if (attemptNumber <= 2) {
        timeoutDuration = this.timeoutEarlyAttempts;
      } else {
        timeoutDuration = this.timeoutLaterAttempts;
      }

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          console.error(`🔥 Image attachment timed out after ${timeoutDuration}ms (attempt ${attemptNumber + 1})`);
          reject(new Error(`Image attachment timeout after ${timeoutDuration}ms`));
        }
      }, timeoutDuration);

      try {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            clearTimeout(timeout);
            console.error('❌ Tweet tab no longer exists:', chrome.runtime.lastError.message);
            return reject(new Error('Tweet tab was closed or inaccessible'));
          }

          console.log('📤 Sending attachment message to tab:', tab.url);

          chrome.tabs.sendMessage(tabId, { action: 'attachImageDataUrl', dataUrl, tweetText }, (resp) => {
            responseReceived = true;
            clearTimeout(timeout);

            const lastError = chrome.runtime.lastError;
            console.log('📨 Attachment response received:', {
              response: resp,
              lastError: lastError?.message,
              timestamp: new Date().toISOString()
            });

            if (lastError) {
              console.error('💥 Chrome runtime error during attachment:', lastError.message);
              if (lastError.message.includes('message channel closed') || lastError.message.includes('receiving end does not exist')) {
                return reject(new Error(`Content script connection lost - tab may have navigated or refreshed (${lastError.message})`));
              }
              if (lastError.message.includes('Extension ID') || lastError.message.includes('specify an Extension ID')) {
                return reject(new Error(`Content script running in wrong context - may need re-injection (${lastError.message})`));
              }
              return reject(new Error(`Chrome runtime error: ${lastError.message}`));
            }

            if (!resp) {
              console.warn('⚠️ Received null response from content script');
              return reject(new Error('Content script did not respond (may have crashed or been unloaded)'));
            }

            if (resp.ok) {
              console.log('✅ Content script confirmed successful image attachment');
              return resolve(true);
            }

            const errorMsg = resp.error || 'Unknown attachment error';
            console.error('❌ Content script attachment failed:', errorMsg);
            reject(new Error(`Content script attachment failed: ${errorMsg}`));
          });
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
}
