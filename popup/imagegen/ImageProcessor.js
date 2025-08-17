/**
 * KRMImage.ImageProcessing - Image helpers for image generator
 * Exposes: drawBookPlaceholder, drawBookCoverOnCanvas, fetchImageObjectUrl
 *
 * Behavior: Canvas-only image drawing + network fetch for image Blob.
 * Contracts: drawBookCoverOnCanvas resolves when image painted; fetch returns ObjectURL.
 */
(function(){
  'use strict';
  const ns = (window.KRMImage = window.KRMImage || {});
  ns.ImageProcessing = ns.ImageProcessing || {};

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

  /**
   * Draw placeholder card when cover image is unavailable.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   */
  ns.ImageProcessing.drawBookPlaceholder = function drawBookPlaceholder(ctx, x, y, width, height) {
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
  };

  /**
   * Draw cover image inside rounded rect mask.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} imageUrl Object URL or network URL
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @returns {Promise<void>}
   */
  ns.ImageProcessing.drawBookCoverOnCanvas = function drawBookCoverOnCanvas(ctx, imageUrl, x, y, width, height) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;
        roundRect(ctx, x, y, width, height, 16);
        ctx.clip();
        // 元のロジック: そのままフィット描画（色変更以外の挙動を変えない）
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
  };

  /**
   * Fetch remote image as Blob and return an object URL (avoids canvas taint).
   * @param {string} url
   * @returns {Promise<string>} object URL
   */
  ns.ImageProcessing.fetchImageObjectUrl = async function fetchImageObjectUrl(url) {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
    if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error('empty image blob');
    return URL.createObjectURL(blob);
  };
})();
