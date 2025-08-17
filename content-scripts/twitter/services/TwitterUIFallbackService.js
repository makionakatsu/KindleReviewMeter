/**
 * TwitterUIFallbackService - Fallback overlay and retry helpers
 * Extract plan from x-tweet-auto-attach.js (no runtime wiring yet)
 */
(function(){
  'use strict';

  /**
   * TwitterUIFallbackService
   * - 自動添付が失敗した際のフォールバックUIおよび簡易リトライ監視を提供
   * - 挙動は既存CSのインライン実装と同一（構造分離のみ）
   */
  class TwitterUIFallbackService {
    /**
     * DOM変化を一定時間監視し、変化検知のたびにretryFnを呼ぶ（最大 maxMs）
     * @param {number} maxMs 監視最大時間（ms）
     * @param {Function} retryFn 変化検知時のリトライ関数
     */
    setupAutoRetry(maxMs = 15000, retryFn) {
      const start = Date.now();
      const observer = new MutationObserver(async () => {
        if (Date.now() - start > maxMs) { observer.disconnect(); return; }
        try { typeof retryFn === 'function' && retryFn(); } catch {}
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), maxMs + 200);
    }

    /**
     * フォールバック用のオーバーレイを表示（ダウンロードリンクと閉じるボタン）
     * @param {string} dataUrl 画像のdata URL（任意）
     */
    showFallbackOverlay(dataUrl) {
      const existing = document.querySelector('#krm-fallback-overlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'krm-fallback-overlay';
      overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center; z-index: 99999;`;
      const box = document.createElement('div');
      box.style.cssText = `background:white; border-radius:12px; padding:18px; width: min(420px, 90vw);`;
      box.innerHTML = `
        <h3 style="margin:0 0 10px 0; font-size:16px;">画像の自動添付に失敗しました</h3>
        <div style="font-size:13px; line-height:1.6; color:#333;">
          次の手順で添付してください：
          <ol style="margin:8px 0 0 16px;">
            <li>画像をダウンロード</li>
            <li>Xの投稿画面にドラッグ＆ドロップ</li>
            <li>または、投稿欄を選択して Ctrl+V（Mac: Cmd+V）</li>
          </ol>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px;">
          <a id="krm-dl" class="btn primary" style="padding:6px 12px; background:#2563eb; color:white; border-radius:6px; text-decoration:none;">ダウンロード</a>
          <button id="krm-close" class="btn" style="padding:6px 12px; border-radius:6px;">閉じる</button>
        </div>`;
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const dl = box.querySelector('#krm-dl');
      const close = box.querySelector('#krm-close');
      if (dl && dataUrl) { dl.href = dataUrl; dl.download = 'kindle-review-image.png'; }
      if (close) close.onclick = () => overlay.remove();
    }
  }

  window.TwitterUIFallbackService = TwitterUIFallbackService;
})();
