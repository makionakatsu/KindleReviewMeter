/**
 * ImageAttachmentService - Handles attaching data URL images to X compose
 * Extract plan from x-tweet-auto-attach.js (no runtime wiring yet)
 */
(function(){
  'use strict';

  class ImageAttachmentService {
    /**
     * Convert data URL string to a File object.
     * Behavior: 1:1 移植（拡張子・MIME 推定を保持）
     * @param {string} dataUrl
     * @param {string|null} filename
     * @returns {File}
     */
    /** Convert data URL to File (moved from original CS) */
    dataUrlToFile(dataUrl, filename = null) {
      const arr = dataUrl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) { u8arr[n] = bstr.charCodeAt(n); }
      let ext = 'png';
      if (/jpeg|jpg/i.test(mime)) ext = 'jpg';
      else if (/png/i.test(mime)) ext = 'png';
      else if (/webp/i.test(mime)) ext = 'webp';
      const base = 'kindle-review-image';
      const inferredName = `${base}.${ext}`;
      const finalName = (filename && filename.includes('.')) ? filename : inferredName;
      return new File([u8arr], finalName, { type: mime });
    }

    /**
     * Drag & Drop シミュレーション（安定待機 80ms を維持）
     * @param {Element} target
     * @param {File} file
     */
    async dropOn(target, file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      const dragEnterEvent = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt });
      const dragOverEvent  = new DragEvent('dragover',  { bubbles: true, cancelable: true, dataTransfer: dt });
      const dropEvent      = new DragEvent('drop',      { bubbles: true, cancelable: true, dataTransfer: dt });
      target.dispatchEvent(dragEnterEvent);
      await new Promise(r=>setTimeout(r,80));
      target.dispatchEvent(dragOverEvent);
      await new Promise(r=>setTimeout(r,80));
      target.dispatchEvent(dropEvent);
    }

    /**
     * 画像 File の貼り付け（paste）イベントをシミュレート
     * 既存ロジックの 1:1 移植（挙動不変）
     * @param {Element} target
     * @param {File} file
     * @returns {Promise<boolean>} 成功時 true
     */
    async simulatePaste(target, file) {
      try {
        if (target && target.focus) target.focus();
        const clipboardData = new DataTransfer();
        clipboardData.items.add(file);
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData
        });
        target.dispatchEvent(pasteEvent);
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  window.ImageAttachmentService = ImageAttachmentService;
})();
