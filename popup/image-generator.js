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

  // ============================================================================
  // CANVAS DRAWING UTILITIES
  // ============================================================================
  
  // Import helpers from KRMImage namespaces
  const { roundRect, wrapTextBoundedCenter } = (window.KRMImage?.Canvas || {});
  const {
    drawBookPlaceholder,
    drawBookCoverOnCanvas,
    fetchImageObjectUrl
  } = (window.KRMImage?.ImageProcessing || {});

  // Fallback guards: ensure helpers exist
  if (!roundRect || !wrapTextBoundedCenter || !drawBookPlaceholder || !drawBookCoverOnCanvas || !fetchImageObjectUrl) {
    console.error('Image generator helpers missing. Ensure imagegen/*.js are loaded before image-generator.js');
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
      // High-DPI rendering: scale up internal resolution while keeping layout code unchanged
      const BASE_W = 420, BASE_H = 560; // 3:4 logical coordinates
      // Determine scale: query param > devicePixelRatio (clamped) > default 2
      const isQuick = qs.has('quickMode');
      const qsScale = Number(qs.get('scale'));
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
      let scale;
      if (isQuick) {
        // Force a predictable 3:4 pixel size in quick mode for X attachment
        scale = 2; // 420x560 * 2 = 840x1120
      } else {
        // Default higher resolution for downloads: prefer >=3x when not specified
        scale = Number.isFinite(qsScale) && qsScale > 0
          ? Math.min(qsScale, 4)
          : Math.min(Math.max(dpr, 3), 4);
      }
      canvas.width = Math.round(BASE_W * scale);
      canvas.height = Math.round(BASE_H * scale);
      ctx.scale(scale, scale);

      // Background gradient (blue→cyan)
      let grad = ctx.createLinearGradient(0, 0, 0, BASE_H);
      grad.addColorStop(0, '#0ea5e9'); grad.addColorStop(1, '#22d3ee');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, BASE_W, BASE_H);

      // Subtle radial accents
      let g1 = ctx.createRadialGradient(BASE_W*0.2, BASE_H*0.2, 0, BASE_W*0.2, BASE_H*0.2, 150);
      g1.addColorStop(0, 'rgba(14,165,233,0.05)'); g1.addColorStop(1, 'transparent');
      ctx.fillStyle = g1; ctx.fillRect(0,0,BASE_W,BASE_H);
      let g2 = ctx.createRadialGradient(BASE_W*0.8, BASE_H*0.8, 0, BASE_W*0.8, BASE_H*0.8, 150);
      g2.addColorStop(0, 'rgba(34,211,238,0.05)'); g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2; ctx.fillRect(0,0,BASE_W,BASE_H);

      // White rounded card
      const cardX = 15, cardY = 15, cardW = BASE_W - 30, cardH = BASE_H - 30;
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
      const coverX = (BASE_W - coverW) / 2;
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
      ctx.save(); ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(14,165,233,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.fillText(String(current), BASE_W/2, y); ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(current), BASE_W/2, y);

      // Label
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#4a5568';
      const labelY = y + 56 + 8; ctx.fillText('現在のレビュー数', BASE_W/2, labelY);

      // Progress bar + stats (only when target set)
      if (hasTarget) {
        const barY = labelY + 28; const barW = cardW - 60; const barH = 24; const barX = (BASE_W - barW)/2;
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

      const quickMode = qs.has('quickMode');
      if (quickMode) {
        await (window.KRMImage?.Output?.handleQuickMode?.(canvas, status));
        return;
      }

      await (window.KRMImage?.Output?.handleNormalMode?.(canvas, status, current, target));
    } catch (e) {
      console.error(e);
      document.getElementById('status').textContent = '画像生成に失敗しました: ' + e.message;
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', async () => {
    const d = await (window.KRMImage?.DataLoader?.loadData?.() || Promise.resolve(null));
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
