/**
 * Amazon Extractors - Robust extraction helpers (image URL, review count)
 * Behavior preserved from AmazonScrapingService methods.
 */

export function extractImageUrlRobust(html) {
  try {
    const markers = [
      'id="imgTagWrapperId"',
      'id="ebooksImageBlock"',
      'id="imageBlock"',
      'id="main-image-container"',
      'imageGallery'
    ];
    let region = '';
    for (const m of markers) {
      const idx = html.indexOf(m);
      if (idx !== -1) { region = html.slice(Math.max(0, idx - 500), idx + 5000); break; }
    }
    if (!region) region = html;

    const isLikelyCover = (u) => {
      if (!u) return false;
      const s = String(u).replace(/&amp;/g, '&');
      if (!/\.(jpg|jpeg|png)(?:[?#].*)?$/i.test(s)) return false;
      if (!/\/images\/I\//.test(s)) return false; // prefer product images path
      if (/Digital_Video|svod|PrimeVideo|\/images\/G\//i.test(s)) return false; // likely banner
      return true;
    };

    const dyn = region.match(/data-a-dynamic-image\s*=\s*'([^']+)'/i) || region.match(/data-a-dynamic-image\s*=\s*"([^"]+)"/i);
    if (dyn && dyn[1]) {
      try {
        const jsonText = dyn[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        const obj = JSON.parse(jsonText);
        let best = null, bestArea = 0;
        for (const [urlStr, size] of Object.entries(obj)) {
          const area = Array.isArray(size) && size.length >= 2 ? (Number(size[0]) * Number(size[1])) : 0;
          if (isLikelyCover(urlStr) && area >= bestArea) { bestArea = area; best = urlStr; }
        }
        if (best) return String(best).replace(/&amp;/g, '&');
      } catch {}
    }

    const hires = region.match(/data-old-hires=\"([^\"]+)\"/i);
    if (hires && isLikelyCover(hires[1])) return hires[1].replace(/&amp;/g, '&');

    const idMatch = region.match(/<img[^>]*id=\"(?:landingImage|imgBlkFront|ebooksImgBlkFront)\"[^>]*(?:src|data-src)=\"([^\"]+)\"/i);
    if (idMatch && isLikelyCover(idMatch[1])) return idMatch[1].replace(/&amp;/g, '&');
    const clsMatch = region.match(/<img[^>]*class=\"[^\"]*(?:a-dynamic-image|frontImage)\"[^>]*src=\"([^\"]+)\"/i);
    if (clsMatch && isLikelyCover(clsMatch[1])) return clsMatch[1].replace(/&amp;/g, '&');

    const og = html.match(/<meta[^>]*property=\"og:image\"[^>]*content=\"([^\"]+)\"[^>]*>/i);
    if (og && isLikelyCover(og[1])) return og[1].replace(/&amp;/g, '&');

    const any = region.match(/src=\"([^\"]*\/images\/I\/[^\"]*\.(?:jpg|jpeg|png)[^\"]*)\"/i);
    if (any && isLikelyCover(any[1])) return any[1].replace(/&amp;/g, '&');

    return null;
  } catch {
    return null;
  }
}

export function extractReviewCountRobust(html) {
  try {
    const patterns = [
      /<[^>]*data-hook=\"total-review-count\"[^>]*>([^<]*)<\/[^>]*>/i,
      /<span[^>]*id=\"acrCustomerReviewText\"[^>]*>([^<]*)<\/span>/i,
      /<a[^>]*href=\"[^\"]*#customerReviews[^\"]*\"[^>]*>([^<]*\d[^<]*)<\/a>/i,
      /([0-9,\d]+)[\s]*(?:個の評価|件のレビュー|件のカスタマーレビュー|ratings?)/i,
      /<[^>]*class=\"[^\"]*cr-widget-ACR[^\"]*\"[^>]*>[\s\S]*?<[^>]*class=\"[^\"]*a-size-base[^\"]*\"[^>]*>([^<]*)<\/[^>]*>/i
    ];
    for (const rx of patterns) {
      const m = html.match(rx);
      if (m && m[1]) {
        const text = String(m[1]).replace(/<[^>]*>/g, ' ');
        const num = text.match(/(\d{1,3}(?:,\d{3})*|\d+)/);
        if (num) {
          const val = parseInt(num[1].replace(/,/g, ''), 10);
          if (!Number.isNaN(val)) return { count: val, source: 'html' };
        }
      }
    }

    try {
      const scriptRegex = /<script[^>]*type=\"application\/ld\+json\"[^>]*>([\s\S]*?)<\/script>/ig;
      let match;
      while ((match = scriptRegex.exec(html)) !== null) {
        const jsonText = match[1];
        try {
          const data = JSON.parse(jsonText);
          const nodes = Array.isArray(data) ? data : [data];
          for (const node of nodes) {
            const agg = node?.aggregateRating || node;
            const rc = agg?.reviewCount || agg?.ratingCount;
            if (typeof rc === 'number' && rc >= 0) {
              return { count: rc, source: 'json-ld' };
            }
            if (typeof rc === 'string') {
              const val = parseInt(rc.replace(/,/g, ''), 10);
              if (!Number.isNaN(val)) return { count: val, source: 'json-ld' };
            }
          }
        } catch {}
      }
    } catch {}

    const keywordRegex = /(レビュー|評価|customer reviews|global ratings|ratings?)/i;
    let best = -1;
    const numberRegex = /(\d{1,3}(?:,\d{3})*|\d+)/g;
    let nm;
    while ((nm = numberRegex.exec(html)) !== null) {
      const numText = nm[1];
      const val = parseInt(numText.replace(/,/g, ''), 10);
      if (Number.isNaN(val)) continue;
      const start = Math.max(0, nm.index - 40);
      const end = Math.min(html.length, nm.index + numText.length + 40);
      const around = html.slice(start, end);
      if (keywordRegex.test(around)) {
        if (val > best) best = val;
      }
    }
    if (best >= 0) return { count: best, source: 'context' };

    return null;
  } catch {
    return null;
  }
}

