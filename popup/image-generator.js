/**
 * Image Generator Service for Kindle Review Meter
 * 
 * Architecture Overview:
 * This script runs in a dedicated tab to generate progress visualization images
 * for social media sharing. It operates in two modes: normal (user-facing) and
 * quick (background) mode for automated X/Twitter integration.
 * 
 * Key Responsibilities:
 * - Generate beautiful progress visualization images using Canvas API
 * - Handle data input from multiple sources (URL params, Chrome storage)
 * - Manage different operational modes (normal, quick, silent)
 * - Provide download functionality and clipboard integration
 * - Coordinate with background script for cross-tab image transfer
 * 
 * Technical Features:
 * - Canvas-based image rendering with custom drawing functions
 * - Dynamic layout calculation for text wrapping and positioning
 * - Cross-origin image loading with fallback placeholders
 * - Multiple clipboard API methods with comprehensive error handling
 * - Blob and DataURL conversion for various output formats
 * 
 * Operational Modes:
 * - Normal: User-facing interface with preview and manual controls
 * - Quick: Background generation for automatic social media integration
 * - Silent: Headless generation with minimal UI interaction
 */

(function(){
  // ============================================================================
  // DATA LOADING AND INITIALIZATION
  // ============================================================================
  
  const qs = new URLSearchParams(location.search);
  let data = null;

  /**
   * Multi-Source Data Loading System
   * 
   * Responsibilities:
   * - Load book data from URL parameters (primary)
   * - Fallback to Chrome storage for data retrieval
   * - Handle data parsing and error recovery
   * - Support multiple data input methods
   */
  async function loadData() {
    try {
      if (qs.has('data')) {
        data = JSON.parse(decodeURIComponent(qs.get('data')));
      }
    } catch (e) {
      console.warn('Failed to parse data from query:', e);
    }

    if (!data && chrome?.storage?.local) {
      const res = await chrome.storage.local.get(['pendingImageData']);
      data = res.pendingImageData || null;
    }

    return data;
  }

  // ============================================================================
  // CANVAS DRAWING UTILITIES
  // ============================================================================
  
  /**
   * Canvas Drawing Helper Functions
   * 
   * These utility functions provide enhanced drawing capabilities for the Canvas API,
   * including rounded rectangles, text wrapping, and image handling.
   */
  
  /**
   * Draw rounded rectangle path
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate  
   * @param {number} w - Width
   * @param {number} h - Height
   * @param {number} r - Border radius
   */
  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }

  function wrapTextBoundedCenter(ctx, text, centerX, top, left, right, lineHeight) {
    const maxWidth = Math.max(0, right - left);
    const originalAlign = ctx.textAlign;
    const originalBaseline = ctx.textBaseline;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // Grapheme segmentation for robust wrapping (handles Japanese and emoji)
    let graphemes;
    try {
      const seg = new Intl.Segmenter('ja', { granularity: 'grapheme' });
      graphemes = Array.from(seg.segment(text), s => s.segment);
    } catch {
      graphemes = Array.from(text);
    }

    const isWs = (ch) => ch === ' ' || ch === '\u3000' || /\s/.test(ch);
    const lines = [];
    let line = '';
    for (let i = 0; i < graphemes.length; i++) {
      const ch = graphemes[i];
      // Collapse leading whitespace of a new line
      const glyph = (isWs(ch) && line.length === 0) ? '' : ch;
      const test = line + glyph;
      const w = ctx.measureText(test).width;
      if (w > maxWidth && line) {
        lines.push(line.replace(/\s+$/,'').replace(/^\s+/,''));
        line = isWs(ch) ? '' : ch; // start next line without leading space
      } else {
        line = test;
      }
    }
    if (line) lines.push(line.replace(/\s+$/,'').replace(/^\s+/,''));

    let y = top;
    for (const l of lines) {
      ctx.fillText(l, centerX, y);
      y += lineHeight;
    }
    ctx.textAlign = originalAlign;
    ctx.textBaseline = originalBaseline;
    return y - lineHeight;
  }

  function drawBookPlaceholder(ctx, x, y, width, height) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
    ctx.fillStyle = gradient;
    roundRect(ctx, x, y, width, height, 16);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, 16);
    ctx.stroke();
    ctx.font = '48px Inter, system-ui';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'center';
    ctx.fillText('📚', x + width / 2, y + height / 2 + 10);
    ctx.font = '12px Inter, system-ui';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('画像なし', x + width / 2, y + height / 2 + 35);
  }

  function drawBookCoverOnCanvas(ctx, imageUrl, x, y, width, height) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Using object URLs from fetched blobs avoids canvas taint; crossOrigin not required
      img.onload = () => {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;
        roundRect(ctx, x, y, width, height, 16);
        ctx.clip();
        ctx.drawImage(img, x, y, width, height);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 3;
        roundRect(ctx, x, y, width, height, 16);
        ctx.stroke();
        ctx.restore();
        resolve();
      };
      img.onerror = reject;
      img.src = imageUrl;
    });
  }

  // Fetch remote image as Blob and return an object URL to avoid canvas taint
  async function fetchImageObjectUrl(url) {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
    if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error('empty image blob');
    return URL.createObjectURL(blob);
  }

  // ============================================================================
  // MAIN IMAGE GENERATION ENGINE
  // ============================================================================
  
  /**
   * Primary Image Generation Function
   * 
   * Responsibilities:
   * - Orchestrate the complete image generation process
   * - Handle different operational modes (normal, quick, silent)
   * - Coordinate canvas rendering, book cover loading, and text layout
   * - Manage output formats (download, clipboard, data URL transfer)
   * - Provide comprehensive error handling and fallback options
   * 
   * Process Flow:
   * 1. Data validation and preprocessing
   * 2. Canvas setup and background rendering
   * 3. Book cover loading (with fallback)
   * 4. Text layout and progress visualization
   * 5. Output handling based on operational mode
   */
  async function generateImage(d) {
    const status = document.getElementById('status');
    const preview = document.getElementById('preview');
    const link = document.getElementById('downloadLink');
    try {
      if (!d) throw new Error('データが渡されていません');

      const current = Number(d.reviewCount) || 0;
      const targetRaw = Number(d.targetReviews);
      const hasTarget = Number.isFinite(targetRaw) && targetRaw > 0;
      const target = hasTarget ? targetRaw : 0;
      const percentage = hasTarget ? Math.min(Math.round((current / target) * 100), 100) : 0;
      const remaining = hasTarget ? Math.max(target - current, 0) : 0;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 420; canvas.height = 560; // 3:4

      // Background gradient (blue→cyan)
      let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#0ea5e9'); grad.addColorStop(1, '#22d3ee');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle radial accents
      let g1 = ctx.createRadialGradient(canvas.width*0.2, canvas.height*0.2, 0, canvas.width*0.2, canvas.height*0.2, 150);
      g1.addColorStop(0, 'rgba(14,165,233,0.05)'); g1.addColorStop(1, 'transparent');
      ctx.fillStyle = g1; ctx.fillRect(0,0,canvas.width,canvas.height);
      let g2 = ctx.createRadialGradient(canvas.width*0.8, canvas.height*0.8, 0, canvas.width*0.8, canvas.height*0.8, 150);
      g2.addColorStop(0, 'rgba(34,211,238,0.05)'); g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2; ctx.fillRect(0,0,canvas.width,canvas.height);

      // White rounded card
      const cardX = 15, cardY = 15, cardW = canvas.width - 30, cardH = canvas.height - 30;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 20; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 8;
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      roundRect(ctx, cardX, cardY, cardW, cardH, 24); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(226,232,240,0.8)'; ctx.lineWidth = 1; roundRect(ctx, cardX, cardY, cardW, cardH, 24); ctx.stroke();

      // Decorative dot
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(cardX+cardW-20, cardY+20, 6, 0, 2*Math.PI); ctx.fill();

      // Safe content bounds
      const pad = 32; const left = cardX + pad, right = cardX + cardW - pad;

      // Cover
      const coverW = 150, coverH = 225;
      const coverX = (canvas.width - coverW) / 2;
      const coverY = cardY + 40;
      if (d.imageUrl && d.imageUrl.trim()) {
        let objUrl = null;
        try {
          objUrl = await fetchImageObjectUrl(d.imageUrl.trim());
          await drawBookCoverOnCanvas(ctx, objUrl, coverX, coverY, coverW, coverH);
        } catch (e) {
          console.warn('Cover fetch/draw failed, using placeholder:', e?.message || e);
          drawBookPlaceholder(ctx, coverX, coverY, coverW, coverH);
        } finally {
          if (objUrl) URL.revokeObjectURL(objUrl);
        }
      } else {
        drawBookPlaceholder(ctx, coverX, coverY, coverW, coverH);
      }

      // Title / Author (centered and bounded)
      const centerX = (left + right)/2;
      const titleTop = coverY + coverH + 20;
      ctx.fillStyle = '#1a202c'; ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
      const titleLast = wrapTextBoundedCenter(ctx, d.title || 'タイトル未設定', centerX, titleTop, left, right, 16);
      const titleLines = Math.max(1, Math.floor((titleLast - titleTop) / 16) + 1);
      const authorTop = titleLast + 21;
      ctx.fillStyle = '#4a5568'; ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      const authorLast = wrapTextBoundedCenter(ctx, d.author || '著者未設定', centerX, authorTop, left, right, 14);
      const authorLines = Math.max(1, Math.floor((authorLast - authorTop) / 14) + 1);
      let y = authorLast + 36;
      // Evidence logs
      console.log('[ImageGen] wrap metrics:', { titleLines, authorLines, titleTop, titleLast, authorTop, authorLast, yStartForNumber: y });

      // Current number (centered)
      ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, sans-serif';
      const cg = ctx.createLinearGradient(0, y, 0, y+56); cg.addColorStop(0,'#3b82f6'); cg.addColorStop(1,'#06b6d4');
      ctx.fillStyle = cg; ctx.textAlign = 'center';
      ctx.save(); ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(14,165,233,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.fillText(String(current), canvas.width/2, y); ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(current), canvas.width/2, y);

      // Label
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#4a5568';
      const labelY = y + 56 + 8; ctx.fillText('現在のレビュー数', canvas.width/2, labelY);

      // Progress bar + stats (only when target set)
      if (hasTarget) {
        const barY = labelY + 28; const barW = cardW - 60; const barH = 24; const barX = (canvas.width - barW)/2;
        ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
        roundRect(ctx, barX, barY, barW, barH, 16); ctx.fill(); ctx.stroke();
        if (percentage > 0) {
          const fillW = Math.max((barW * percentage)/100, 10);
          const pg = ctx.createLinearGradient(barX, barY, barX+barW, barY+barH);
          pg.addColorStop(0.0,'#3b82f6'); pg.addColorStop(0.6,'#06b6d4'); pg.addColorStop(1.0,'#10b981');
          ctx.fillStyle = pg; roundRect(ctx, barX, barY, fillW, barH, 16); ctx.fill();
        }
        // Center percentage text vertically and horizontally on the bar
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#1a202c';
        ctx.textAlign = 'center';
        const percentX = barX + barW / 2;
        ctx.save();
        const prevBaseline = ctx.textBaseline;
        ctx.textBaseline = 'middle';
        ctx.fillText(`${percentage}%`, percentX, barY + barH / 2);
        ctx.textBaseline = prevBaseline;
        ctx.restore();

        // Stats cards (ensure spacing below the bar)
        const statsY = barY + barH + 16; const cardW1 = (cardW - 80)/2; const cardH1 = 28; const gap = 10; const leftX = cardX + 30; const rightX = leftX + cardW1 + gap;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 12; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4; ctx.fillStyle = 'rgba(255,255,255,0.95)';
        roundRect(ctx, leftX, statsY, cardW1, cardH1, 8); ctx.fill(); ctx.restore();
        ctx.strokeStyle = 'rgba(226,232,240,1)'; ctx.lineWidth = 1; roundRect(ctx, leftX, statsY, cardW1, cardH1, 8); ctx.stroke();
        // Center text vertically and horizontally in the stats card
        ctx.save();
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#1f2937';
        ctx.textAlign = 'center';
        const prevBaselineStatsLeft = ctx.textBaseline;
        ctx.textBaseline = 'middle';
        ctx.fillText(`目標: ${target} レビュー`, leftX + cardW1/2, statsY + cardH1/2);
        ctx.textBaseline = prevBaselineStatsLeft;
        ctx.restore();

        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 12; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4; ctx.fillStyle = 'rgba(255,255,255,0.95)';
        roundRect(ctx, rightX, statsY, cardW1, cardH1, 8); ctx.fill(); ctx.restore();
        ctx.strokeStyle = 'rgba(226,232,240,1)'; ctx.lineWidth = 1; roundRect(ctx, rightX, statsY, cardW1, cardH1, 8); ctx.stroke();
        // Center text vertically and horizontally in the stats card
        ctx.save();
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#1f2937';
        ctx.textAlign = 'center';
        const prevBaselineStatsRight = ctx.textBaseline;
        ctx.textBaseline = 'middle';
        ctx.fillText(`あと ${remaining} レビュー`, rightX + cardW1/2, statsY + cardH1/2);
        ctx.textBaseline = prevBaselineStatsRight;
        ctx.restore();
        // Evidence: assert no overlap
        const overlap = statsY < (barY + barH);
        console.log('[ImageGen] layout check:', { barY, barH, statsY, overlap });
      }

      // Global variables for clipboard functionality
      let globalCanvas = canvas;
      let globalBlob = null;
      
      // Direct download without preview
      const filename = `kindle-review-progress-${current}-${target}-${Date.now()}.png`;
      const triggerDownload = (href) => {
        const a = document.createElement('a');
        a.href = href;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      // Setup clipboard button with multiple methods
      const setupClipboardButton = (blob) => {
        const copyBtn = document.getElementById('copyToClipboard');
        if (copyBtn) {
          copyBtn.style.display = 'inline-flex';
          copyBtn.onclick = async () => {
            let success = false;
            let lastError = null;
            
            // Method 1: Modern Clipboard API
            try {
              await navigator.clipboard.write([
                new ClipboardItem({
                  'image/png': blob
                })
              ]);
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
                chrome.runtime.sendMessage({
                  action: 'clipboardCopySuccess',
                  success: true
                });
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
              
              // Show detailed error to user
              const statusEl = document.getElementById('status');
              if (statusEl) {
                statusEl.innerHTML = `クリップボードエラー: ${lastError?.name || 'Unknown'}<br>手動で画像をダウンロードしてX投稿画面にドラッグ&ドロップしてください。`;
              }
            }
          };
        }
      };

      canvas.toBlob(async (blob)=>{
        const urlParams = new URLSearchParams(window.location.search);
        const quickMode = urlParams.has('quickMode');

        // Quick mode: クリップボードを使わず、データURLを背景→Xタブへ転送
        if (quickMode) {
          try {
            console.log('Quick mode: generating image data URL');
            let dataUrl;
            if (blob) {
              console.log('Converting blob to data URL, blob size:', blob.size);
              dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  console.log('Blob to data URL conversion complete');
                  resolve(reader.result);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            } else {
              console.log('Using canvas toDataURL fallback');
              dataUrl = canvas.toDataURL('image/png');
            }
            
            console.log('Data URL generated, length:', dataUrl?.length);
            if (chrome?.runtime?.sendMessage) {
              console.log('Sending imageGenerated message to background');
              const response = await chrome.runtime.sendMessage({ action: 'imageGenerated', dataUrl });
              console.log('Background response:', response);
              status.textContent = '画像データを送信しました';
            } else {
              console.error('Chrome runtime not available for message sending');
            }
          } catch (e) {
            console.error('Quick mode send failed, falling back to download:', e);
            const fallbackUrl = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
            triggerDownload(fallbackUrl);
          } finally {
            setTimeout(() => { try { window.close(); } catch(_) {} }, 600);
          }
          return;
        }

        // 通常モード: 既存のダウンロード + 任意のクリップボードコピー
        if (blob) {
          // Setup manual clipboard button
          setupClipboardButton(blob);
          const helpText = document.getElementById('helpText');
          if (helpText) helpText.style.display = 'block';
          const url = URL.createObjectURL(blob);
          triggerDownload(url);
          try {
            const permission = await navigator.permissions.query({name: 'clipboard-write'});
            if (permission.state === 'granted' || permission.state === 'prompt') {
              await navigator.clipboard.write([ new ClipboardItem({ 'image/png': blob }) ]);
              status.textContent = 'ダウンロードを開始しました';
              if (chrome?.runtime) chrome.runtime.sendMessage({ action: 'clipboardCopySuccess', success: true });
            }
          } catch (clipboardError) {
            console.warn('Optional clipboard copy failed:', clipboardError);
            status.textContent = 'ダウンロードを開始しました';
            if (chrome?.runtime) chrome.runtime.sendMessage({ action: 'clipboardCopySuccess', success: false, error: `${clipboardError.name}: ${clipboardError.message}` });
          } finally {
            setTimeout(()=>URL.revokeObjectURL(url), 2000);
          }
        } else {
          const dataUrl = canvas.toDataURL('image/png');
          triggerDownload(dataUrl);
          try {
            const permission = await navigator.permissions.query({name: 'clipboard-write'});
            if (permission.state === 'granted' || permission.state === 'prompt') {
              const resp = await fetch(dataUrl);
              const clipBlob = await resp.blob();
              await navigator.clipboard.write([ new ClipboardItem({ 'image/png': clipBlob }) ]);
              status.textContent = 'ダウンロードを開始しました';
              if (chrome?.runtime) chrome.runtime.sendMessage({ action: 'clipboardCopySuccess', success: true });
            }
          } catch (clipboardError) {
            console.warn('Optional clipboard copy (data URL) failed:', clipboardError);
            status.textContent = 'ダウンロードを開始しました';
            if (chrome?.runtime) chrome.runtime.sendMessage({ action: 'clipboardCopySuccess', success: false, error: `${clipboardError.name}: ${clipboardError.message}` });
          }
        }

        // 通常モード: オートクローズ制御（既存挙動維持）
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
              const statusEl = document.getElementById('status');
              // 自動クローズの挙動は、クリップボードには依存させない
              try { window.close(); } catch(_) {}
            }, 3000);
          }
        }
      }, 'image/png');
    } catch (e) {
      console.error(e);
      document.getElementById('status').textContent = '画像生成に失敗しました: ' + e.message;
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', async () => {
    const d = await loadData();
    await generateImage(d);

    // Also support message-based injection from background (fallback)
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'generateImage') {
          generateImage(request.data);
          sendResponse({ ok: true });
        }
      });
    }
  });
})();
