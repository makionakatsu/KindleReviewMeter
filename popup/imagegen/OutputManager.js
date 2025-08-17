/**
 * KRMImage.Output - Output and UX handling for image generator
 * Responsibilities (behavior preserved):
 * - Download via chrome.downloads or anchor fallback
 * - Clipboard copy (manual button + optional auto-copy when permitted)
 * - Quick mode transfer to background (imageGenerated)
 * - Silent/autoClose window behavior
 *
 * Contracts: No side effects outside DOM operations and Chrome API calls
 *            identical to prior inline behavior; messages unchanged.
 */
(function(){
  'use strict';
  const root = (window.KRMImage = window.KRMImage || {});
  const Output = root.Output = root.Output || {};

  /**
   * Trigger a file download using an anchor element.
   * @param {string} href
   * @param {string} filename
   */
  Output.triggerDownload = function triggerDownload(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /**
   * Wire up the manual clipboard copy button.
   * @param {Blob} blob PNG blob
   */
  Output.setupClipboardButton = function setupClipboardButton(blob) {
    const copyBtn = document.getElementById('copyToClipboard');
    if (!copyBtn) return;
    copyBtn.style.display = 'inline-flex';
    copyBtn.onclick = async () => {
      let success = false;
      let lastError = null;

      try {
        await navigator.clipboard.write([ new ClipboardItem({ 'image/png': blob }) ]);
        success = true;
        console.log('Clipboard copy succeeded with modern API');
      } catch (error) {
        lastError = error;
        console.warn('Modern clipboard API failed:', error);
      }

      if (success) {
        copyBtn.textContent = 'コピー完了！';
        copyBtn.style.background = '#10b981';
        setTimeout(() => {
          copyBtn.textContent = 'クリップボードにコピー';
          copyBtn.style.background = '';
        }, 2000);
        if (chrome?.runtime) {
          chrome.runtime.sendMessage({ action: 'clipboardCopySuccess', success: true });
        }
      } else {
        console.error('All clipboard copy methods failed. Last error:', {
          name: lastError?.name,
          message: lastError?.message,
          code: lastError?.code,
          stack: lastError?.stack
        });
        copyBtn.textContent = `コピー失敗 (${lastError?.name || 'Unknown'})`;
        copyBtn.style.background = '#ef4444';
        setTimeout(() => {
          copyBtn.textContent = 'クリップボードにコピー';
          copyBtn.style.background = '';
        }, 3000);
        const statusEl = document.getElementById('status');
        if (statusEl) {
          statusEl.innerHTML = `クリップボードエラー: ${lastError?.name || 'Unknown'}<br>手動で画像をダウンロードしてX投稿画面にドラッグ&ドロップしてください。`;
        }
      }
    };
  };

  /**
   * Handle quick mode: send image data URL to background and close.
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} statusEl
   */
  Output.handleQuickMode = async function handleQuickMode(canvas, statusEl) {
    const urlParams = new URLSearchParams(window.location.search);
    const tweetTabId = Number(urlParams.get('tweetTabId')) || null;
    try {
      console.log('Quick mode: generating image data URL (legacy push path)');
      const dataUrl = (() => {
        try { return canvas.toDataURL('image/jpeg', 0.9); } catch { return canvas.toDataURL('image/png'); }
      })();
      await chrome.runtime.sendMessage({ action: 'imageGenerated', dataUrl, tweetTabId });
      if (statusEl) statusEl.textContent = '画像データを送信しました';
    } catch (e) {
      console.error('Quick mode send failed, falling back to download:', e);
      const fallbackUrl = canvas.toDataURL('image/png');
      Output.triggerDownload(fallbackUrl, `kindle-review-progress-${Date.now()}.png`);
    } finally {
      setTimeout(() => { try { window.close(); } catch(_) {} }, 600);
    }
  };

  /**
   * Handle normal mode: download, optional clipboard, silent/autoClose.
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} statusEl
   * @param {number} current
   * @param {number} target
   */
  Output.handleNormalMode = async function handleNormalMode(canvas, statusEl, current, target) {
    const urlParams = new URLSearchParams(window.location.search);
    await new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (blob) {
          Output.setupClipboardButton(blob);
          const helpText = document.getElementById('helpText');
          if (helpText) helpText.style.display = 'block';
          const objectUrl = URL.createObjectURL(blob);
          const filename = `kindle-review-progress-${current}-${target}-${Date.now()}.png`;
          if (chrome?.downloads?.download) {
            try {
              const downloadId = await new Promise((resolveDl, rejectDl) => {
                chrome.downloads.download({ url: objectUrl, filename, saveAs: false, conflictAction: 'uniquify' }, (id) => {
                  if (chrome.runtime.lastError || !id) return rejectDl(chrome.runtime.lastError || new Error('download failed'));
                  resolveDl(id);
                });
              });
              setTimeout(() => { try { chrome.downloads.show(downloadId); } catch {} }, 300);
            } catch (e) {
              console.warn('chrome.downloads failed, fallback to anchor:', e?.message || e);
              Output.triggerDownload(objectUrl, filename);
            } finally {
              setTimeout(()=>URL.revokeObjectURL(objectUrl), 2000);
            }
          } else {
            Output.triggerDownload(objectUrl, filename);
            setTimeout(()=>URL.revokeObjectURL(objectUrl), 2000);
          }
          try {
            const permission = await navigator.permissions.query({name: 'clipboard-write'});
            const userActivated = !!(navigator.userActivation?.isActive);
            const canAutoCopy = permission.state === 'granted' && userActivated && document.hasFocus();
            if (canAutoCopy) {
              await navigator.clipboard.write([ new ClipboardItem({ 'image/png': blob }) ]);
              if (statusEl) statusEl.textContent = 'ダウンロードを開始しました';
              if (chrome?.runtime) chrome.runtime.sendMessage({ action: 'clipboardCopySuccess', success: true });
            } else {
              console.debug('Skipping optional clipboard copy (no user activation or permission)');
            }
          } catch (clipboardError) {
            console.debug('Optional clipboard copy failed:', clipboardError);
            if (statusEl) statusEl.textContent = 'ダウンロードを開始しました';
            if (chrome?.runtime) chrome.runtime.sendMessage({ action: 'clipboardCopySuccess', success: false, error: `${clipboardError.name}: ${clipboardError.message}` });
          }
        } else {
          const dataUrl = canvas.toDataURL('image/png');
          const filename = `kindle-review-progress-${current}-${target}-${Date.now()}.png`;
          if (chrome?.downloads?.download) {
            try {
              const downloadId = await new Promise((resolveDl, rejectDl) => {
                chrome.downloads.download({ url: dataUrl, filename, saveAs: false, conflictAction: 'uniquify' }, (id) => {
                  if (chrome.runtime.lastError || !id) return rejectDl(chrome.runtime.lastError || new Error('download failed'));
                  resolveDl(id);
                });
              });
              setTimeout(() => { try { chrome.downloads.show(downloadId); } catch {} }, 300);
            } catch (e) {
              console.warn('chrome.downloads failed, fallback to anchor:', e?.message || e);
              Output.triggerDownload(dataUrl, filename);
            }
          } else {
            Output.triggerDownload(dataUrl, filename);
          }
          try {
            const permission = await navigator.permissions.query({name: 'clipboard-write'});
            const userActivated = !!(navigator.userActivation?.isActive);
            const canAutoCopy = permission.state === 'granted' && userActivated && document.hasFocus();
            if (canAutoCopy) {
              const resp = await fetch(dataUrl);
              const clipBlob = await resp.blob();
              await navigator.clipboard.write([ new ClipboardItem({ 'image/png': clipBlob }) ]);
              if (statusEl) statusEl.textContent = 'ダウンロードを開始しました';
              if (chrome?.runtime) chrome.runtime.sendMessage({ action: 'clipboardCopySuccess', success: true });
            } else {
              console.debug('Skipping optional clipboard copy (no user activation or permission)');
            }
          } catch (clipboardError) {
            console.debug('Optional clipboard copy (data URL) failed:', clipboardError);
            if (statusEl) statusEl.textContent = 'ダウンロードを開始しました';
            if (chrome?.runtime) chrome.runtime.sendMessage({ action: 'clipboardCopySuccess', success: false, error: `${clipboardError.name}: ${clipboardError.message}` });
          }
        }

        // Silent/autoClose handling (unchanged behavior)
        const silent = urlParams.has('silent');
        if (silent) {
          const clipboardSuccess = false;
          if (chrome?.runtime) {
            chrome.runtime.sendMessage({ action: 'imageGenerationComplete', success: clipboardSuccess, error: clipboardSuccess ? null : 'Clipboard copy failed' });
          }
          setTimeout(() => { try { window.close(); } catch(_) {} }, 1000);
        } else {
          const autoClose = urlParams.has('autoClose');
          if (autoClose) {
            setTimeout(() => {
              // 自動クローズの挙動は、クリップボードには依存させない
              try { window.close(); } catch(_) {}
            }, 3000);
          }
        }
        resolve();
      }, 'image/png');
    });
  };
})();
