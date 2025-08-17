/**
 * KRMImage.Canvas - Canvas helpers for image generator
 * Exposes: roundRect, wrapTextBoundedCenter
 *
 * Behavior: Pure drawing helpers; no DOM or Chrome API usage.
 * Contracts: Do not mutate global canvas state beyond documented saves/restores.
 */
(function(){
  'use strict';
  const ns = (window.KRMImage = window.KRMImage || {});
  ns.Canvas = ns.Canvas || {};

  /**
   * Draw rounded rectangle path on a canvas context.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} r
   */
  ns.Canvas.roundRect = function roundRect(ctx, x, y, w, h, r){
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
  };

  /**
   * Wrap and center text within [left, right] bounds starting at top.
   * Handles grapheme segmentation for CJK/emoji when available.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} centerX
   * @param {number} top
   * @param {number} left
   * @param {number} right
   * @param {number} lineHeight
   * @returns {number} y-coordinate of last rendered line baseline
   */
  ns.Canvas.wrapTextBoundedCenter = function wrapTextBoundedCenter(ctx, text, centerX, top, left, right, lineHeight) {
    const maxWidth = Math.max(0, right - left);
    const originalAlign = ctx.textAlign;
    const originalBaseline = ctx.textBaseline;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

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
      const glyph = (isWs(ch) && line.length === 0) ? '' : ch;
      const test = line + glyph;
      const w = ctx.measureText(test).width;
      if (w > maxWidth && line) {
        lines.push(line.replace(/\s+$/,'').replace(/^\s+/,''));
        line = isWs(ch) ? '' : ch;
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
  };
})();
