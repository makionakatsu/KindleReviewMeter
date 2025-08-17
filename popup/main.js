import PopupController from './controllers/PopupController.js';
import StorageService from './services/StorageService.js';
import ToastService from './services/ToastService.js';

// Bootstrap the popup using MVC controller
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const storage = new StorageService('kindleReviewMeter');
    const toast = new ToastService();

    // Pre-fill amazonUrl from context menu (session) if available, then clear
    try {
      let pendingUrl = null;
      if (chrome?.storage?.session) {
        const ses = await chrome.storage.session.get(['pendingAmazonUrl']);
        pendingUrl = ses?.pendingAmazonUrl || null;
        if (pendingUrl) await chrome.storage.session.remove('pendingAmazonUrl');
      } else if (chrome?.storage?.local) {
        const loc = await chrome.storage.local.get(['pendingAmazonUrl']);
        pendingUrl = loc?.pendingAmazonUrl || null;
        if (pendingUrl) await chrome.storage.local.remove('pendingAmazonUrl');
      }
      if (pendingUrl) {
        const input = document.getElementById('amazonUrl');
        if (input && !input.value) {
          input.value = pendingUrl;
          // fire input event so validation/UI hooks can react
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    } catch (e) {
      console.warn('Prefill amazonUrl failed:', e);
    }

    // Controller wires Model and View internally
    // eslint-disable-next-line no-new
    new PopupController(storage, toast);
  } catch (e) {
    console.error('Popup bootstrap failed:', e);
    alert('拡張の初期化に失敗しました: ' + (e?.message || e));
  }
});
