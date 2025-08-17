/**
 * TabUtils - Small tab/notification helpers (extracted)
 */

export async function getTabInfo(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.warn('Tab query failed:', chrome.runtime.lastError.message);
        return resolve(null);
      }
      resolve(tab);
    });
  });
}

export function isValidTweetUrl(url) {
  return /^https:\/\/(?:mobile\.)?(?:x|twitter)\.com\//.test(url);
}

export async function cleanupImageTab(imageTabId) {
  try {
    console.log('🧹 Cleaning up image generation tab:', imageTabId);
    await chrome.tabs.remove(imageTabId);
  } catch (cleanupError) {
    console.warn('⚠️ Failed to cleanup image tab:', cleanupError.message);
  }
}

export async function showManualAttachmentNotification() {
  if (typeof chrome !== 'undefined' && chrome.notifications) {
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Kindle Review Meter',
        message: '画像の自動添付に失敗しました。手動で画像をX投稿に添付してください。'
      });
    } catch (notifError) {
      console.warn('Failed to show notification:', notifError.message);
    }
  }
}

export function isFatalError(error) {
  const fatalErrors = [
    'Tweet tab was closed',
    'No tab with id',
    'Cannot access'
  ];
  return fatalErrors.some(fatal => error.message.includes(fatal));
}

