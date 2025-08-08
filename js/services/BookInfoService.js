export class BookInfoService {
  constructor() {
    this.proxies = [
      'https://api.cors.lol/?url=',
      'https://proxy.cors.sh/',
      'https://api.allorigins.win/raw?url='
    ];
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const fromLS = JSON.parse(localStorage.getItem('krm:config') || '{}');
      const fromGlobal = (typeof window !== 'undefined' && window.KRM_CONFIG) ? window.KRM_CONFIG : {};
      return { corsShApiKey: fromGlobal.corsShApiKey || fromLS.corsShApiKey || '' };
    } catch { return { corsShApiKey: '' }; }
  }

  extractASIN(url) {
    const m = url.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})|\/product\/([A-Z0-9]{10})/);
    return m ? (m[1] || m[2] || m[3]) : null;
  }

  async fetchBookInfo(amazonUrl) {
    let lastErr = null;
    for (const base of this.proxies) {
      try {
        const proxied = base.includes('allorigins')
          ? base + encodeURIComponent(amazonUrl)
          : base + amazonUrl;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10000);
        const headers = { 'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8' };
        if (base.includes('proxy.cors.sh') && this.config.corsShApiKey) headers['x-cors-api-key'] = this.config.corsShApiKey;
        const res = await fetch(proxied, { signal: controller.signal, headers });
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let html;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j = await res.json();
          html = j.contents || j.body || '';
        } else {
          html = await res.text();
        }
        if (!html || html.length < 500) throw new Error('Empty response');
        const info = this.parse(html);
        if (!info.title) throw new Error('Parse failed');
        info.asin = this.extractASIN(amazonUrl);
        info.fetchedAt = new Date().toISOString();
        return info;
      } catch (e) {
        lastErr = e;
        continue;
      }
    }
    const asin = this.extractASIN(amazonUrl);
    return {
      title: '書籍情報の取得に失敗しました（手動入力してください）',
      author: '不明', reviewCount: 0, imageUrl: '', asin,
      fetchedAt: new Date().toISOString(), isMockData: true, fetchError: lastErr?.message
    };
  }

  parse(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pickText = (selectors) => {
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
      }
      return '';
    };
    const pickImage = (selectors) => {
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) {
          let src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-a-dynamic-image');
          if (src) {
            if (src.startsWith('{')) {
              try { const o = JSON.parse(src); const k = Object.keys(o)[0]; if (k) return k; } catch {}
            }
            return src;
          }
        }
      }
      return '';
    };
    const title = pickText(['#productTitle','h1[data-automation-id="title"]','h1.a-size-large','h1']);
    const author = pickText(['.author a','.byline a','[data-automation-id="byline"] a','span.author a']);
    const reviewText = pickText(['#acrCustomerReviewText','[data-hook="total-review-count"]','.a-link-normal[href*="reviews"] span','.averageStarRatingNumerical']);
    const reviewCount = (() => { const m = (reviewText||'').match(/([0-9,]+)/); return m ? parseInt(m[1].replace(/,/g,''),10) : 0; })();
    const imageUrl = pickImage(['#landingImage','#imgBlkFront','.frontImage','#main-image','#ebooksImgBlkFront']);
    return { title, author, reviewCount, imageUrl, extractionSuccess: !!(title && author) };
  }
}

