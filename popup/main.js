import PopupController from './controllers/PopupController.js';
import StorageService from './services/StorageService.js';
import ToastService from './services/ToastService.js';

// Bootstrap the popup using MVC controller
document.addEventListener('DOMContentLoaded', () => {
  try {
    const storage = new StorageService('kindleReviewMeter');
    const toast = new ToastService();
    // Controller wires Model and View internally
    // eslint-disable-next-line no-new
    new PopupController(storage, toast);
  } catch (e) {
    console.error('Popup bootstrap failed:', e);
    alert('拡張の初期化に失敗しました: ' + (e?.message || e));
  }
});

