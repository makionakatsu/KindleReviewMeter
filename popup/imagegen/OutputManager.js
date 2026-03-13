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
    const shareId = (urlParams.get('shareId') || '').trim();
    const tweetText = urlParams.get('tweetText') || '';
    const enableBinary = urlParams.get('binary') === '1';
    let shouldAutoClose = false;

    const sendFailureTelemetry = async (reason) => {
      try {
        await chrome.runtime.sendMessage({
          action: 'clipboardCopySuccess',
          success: false,
          error: reason || 'quick_mode_send_failed'
        });
      } catch {}
    };

    const validateImageGeneratedResponse = (response, expectedShareId) => {
      const payload = response?.data ?? response ?? {};

      if (response?.success !== true) {
        throw new Error(
          payload?.error ||
          response?.error ||
          payload?.failedReason ||
          'imageGenerated_request_failed'
        );
      }

      if (typeof payload?.shareId === 'string' &&
          payload.shareId &&
          payload.shareId !== expectedShareId) {
        throw new Error('share_id_mismatch');
      }

      if (payload?.queued === false && payload?.alreadyCompleted !== true) {
        throw new Error(payload?.failedReason || 'image_not_queued');
      }

      return payload;
    };

    try {
      if (!shareId) {
        if (statusEl) statusEl.textContent = '自動添付を中断しました（shareId欠落）';
        throw new Error('strict_affinity_shareId_missing');
      }

      const dataUrl = (() => {
        try { return canvas.toDataURL('image/jpeg', 0.9); } catch { return canvas.toDataURL('image/png'); }
      })();
      const imageTabId = await new Promise((resolve) => {
        try {
          if (chrome?.tabs?.getCurrent) {
            chrome.tabs.getCurrent((tab) => resolve(Number(tab?.id) || null));
          } else {
            resolve(null);
          }
        } catch (_) {
          resolve(null);
        }
      });

      // Strict affinity: shareId is mandatory to prevent cross-draft attachment.
      const response = await chrome.runtime.sendMessage({
        action: 'imageGenerated',
        target: 'background',
        dataUrl,
        shareId,
        tweetTabId,
        imageTabId,
        tweetText,
        binarySent: false,
        policy: 'strict_affinity'
      });
      validateImageGeneratedResponse(response, shareId);

      // Optional binary path for experiments/debugging only.
      if (enableBinary) {
        try {
          if (chrome?.runtime?.connect) {
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            if (blob) {
              const buffer = await blob.arrayBuffer();
              await new Promise((resolve) => {
                const port = chrome.runtime.connect({ name: 'krm_image_gen' });
                let settled = false;
                const finish = () => {
                  if (settled) return;
                  settled = true;
                  try { port.disconnect(); } catch {}
                  resolve();
                };

                const timeout = setTimeout(finish, 1000);
                port.onMessage.addListener((msg) => {
                  if (msg?.type === 'stored') {
                    clearTimeout(timeout);
                    finish();
                  }
                });
                port.onDisconnect.addListener(() => {
                  clearTimeout(timeout);
                  finish();
                });

                try {
                  port.postMessage({
                    type: 'image',
                    shareId,
                    tweetTabId,
                    mime: blob.type || 'image/jpeg',
                    buffer
                  });
                } catch (_) {
                  clearTimeout(timeout);
                  finish();
                }
              });
            }
          }
        } catch (binaryError) {
          console.warn('Quick mode binary send failed (non-fatal):', binaryError);
        }
      }

      if (statusEl) statusEl.textContent = '画像データを送信しました';
      shouldAutoClose = true;
    } catch (e) {
      const reason = e?.message || 'quick_mode_send_failed';
      console.error('Quick mode send failed, falling back to download:', e);
      if (statusEl) statusEl.textContent = `自動添付に失敗しました: ${reason}`;
      await sendFailureTelemetry(reason);
      const fallbackUrl = canvas.toDataURL('image/png');
      Output.triggerDownload(fallbackUrl, `kindle-review-progress-${Date.now()}.png`);
    } finally {
      if (shouldAutoClose) {
        setTimeout(() => { try { window.close(); } catch(_) {} }, 600);
      }
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
