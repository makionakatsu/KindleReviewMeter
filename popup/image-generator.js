// Image generator page script (MV3 CSP-compliant: no inline scripts)

(function(){
  const qs = new URLSearchParams(location.search);
  let data = null;

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
    ctx.textAlign = 'center';
    const hasSpace = text.includes(' ');
    const tokens = hasSpace ? text.split(' ') : Array.from(text);
    const lines = [];
    let line = '';
    for (let i = 0; i < tokens.length; i++) {
      const sep = hasSpace ? ' ' : '';
      const test = line + tokens[i] + sep;
      const w = ctx.measureText(test).width;
      if (w > maxWidth && line) {
        lines.push(line.trimEnd());
        line = tokens[i] + sep;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line.trimEnd());
    let y = top;
    for (const l of lines) {
      ctx.fillText(l, centerX, y);
      y += lineHeight;
    }
    ctx.textAlign = originalAlign;
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
      img.crossOrigin = 'anonymous';
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
        try { await drawBookCoverOnCanvas(ctx, d.imageUrl.trim(), coverX, coverY, coverW, coverH); }
        catch { drawBookPlaceholder(ctx, coverX, coverY, coverW, coverH); }
      } else {
        drawBookPlaceholder(ctx, coverX, coverY, coverW, coverH);
      }

      // Title / Author (centered and bounded)
      const centerX = (left + right)/2;
      let y = coverY + coverH + 20;
      ctx.fillStyle = '#1a202c'; ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif';
      y = wrapTextBoundedCenter(ctx, d.title || 'タイトル未設定', centerX, y, left, right, 16) + 21;
      ctx.fillStyle = '#4a5568'; ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      y = wrapTextBoundedCenter(ctx, d.author || '著者未設定', centerX, y, left, right, 14) + 36;

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
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#1a202c'; ctx.textAlign = 'center';
        ctx.fillText(`${percentage}%`, canvas.width/2, barY + 17);

        // Stats cards
        const statsY = barY + 25; const cardW1 = (cardW - 80)/2; const cardH1 = 28; const gap = 10; const leftX = cardX + 30; const rightX = leftX + cardW1 + gap;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 12; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4; ctx.fillStyle = 'rgba(255,255,255,0.95)';
        roundRect(ctx, leftX, statsY, cardW1, cardH1, 8); ctx.fill(); ctx.restore();
        ctx.strokeStyle = 'rgba(226,232,240,1)'; ctx.lineWidth = 1; roundRect(ctx, leftX, statsY, cardW1, cardH1, 8); ctx.stroke();
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#1f2937'; ctx.textAlign = 'center'; ctx.fillText(`目標: ${target} レビュー`, leftX + cardW1/2, statsY + cardH1/2 + 3);

        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.08)'; ctx.shadowBlur = 12; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 4; ctx.fillStyle = 'rgba(255,255,255,0.95)';
        roundRect(ctx, rightX, statsY, cardW1, cardH1, 8); ctx.fill(); ctx.restore();
        ctx.strokeStyle = 'rgba(226,232,240,1)'; ctx.lineWidth = 1; roundRect(ctx, rightX, statsY, cardW1, cardH1, 8); ctx.stroke();
        ctx.fillStyle = '#1f2937'; ctx.fillText(`あと ${remaining} レビュー`, rightX + cardW1/2, statsY + cardH1/2 + 3);
      }

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

      canvas.toBlob((blob)=>{
        if (blob) {
          const url = URL.createObjectURL(blob);
          triggerDownload(url);
          setTimeout(()=>URL.revokeObjectURL(url), 2000);
        } else {
          // Fallback to data URL
          const dataUrl = canvas.toDataURL('image/png');
          triggerDownload(dataUrl);
        }
        status.textContent = 'ダウンロードを開始しました';
        // Try to auto-close after a moment (tab was opened by the extension)
        setTimeout(()=>{ try { window.close(); } catch(_) {} }, 1500);
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
