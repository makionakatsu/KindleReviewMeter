/**
 * Amazon書籍情報取得サービス
 */
export class BookInfoService {
    constructor() {
        // 複数のCORS プロキシを定義（フォールバック対応）
        this.corsProxies = [
            'https://api.allorigins.win/get?url=',
            'https://corsproxy.io/?',
            'https://cors-anywhere.herokuapp.com/'
        ];
        this.currentProxyIndex = 0;
    }

    /**
     * Amazon URLから書籍情報を取得
     */
    async fetchBookInfo(amazonUrl) {
        let lastError = null;
        
        // すべてのプロキシを試行
        for (let i = 0; i < this.corsProxies.length; i++) {
            try {
                console.log(`📚 Fetching book info from: ${amazonUrl} (proxy ${i + 1}/${this.corsProxies.length})`);
                
                const currentProxy = this.corsProxies[i];
                let proxyUrl;
                
                // プロキシのタイプに応じてURL構築を変更
                if (currentProxy.includes('allorigins.win')) {
                    proxyUrl = currentProxy + encodeURIComponent(amazonUrl);
                } else {
                    proxyUrl = currentProxy + amazonUrl;
                }
                
                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/html, */*',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                let html;
                if (currentProxy.includes('allorigins.win')) {
                    const data = await response.json();
                    html = data.contents;
                } else {
                    html = await response.text();
                }
                
                if (!html || html.length < 1000) {
                    throw new Error('Empty or invalid HTML response');
                }
                
                // HTMLから書籍情報を抽出
                const bookInfo = this.parseBookInfo(html);
                
                // 成功したプロキシを記憶
                this.currentProxyIndex = i;
                console.log('✅ Book info fetched successfully:', bookInfo);
                return bookInfo;
                
            } catch (error) {
                console.warn(`⚠️ Proxy ${i + 1} failed:`, error.message);
                lastError = error;
                continue;
            }
        }
        
        // すべてのプロキシが失敗した場合、モックデータを返す
        console.warn('❌ All proxies failed, returning mock data');
        return this.getMockBookInfo(amazonUrl);
    }

    /**
     * モックの書籍情報を生成（プロキシが全て失敗した場合）
     */
    getMockBookInfo(amazonUrl) {
        const asin = this.extractASIN(amazonUrl);
        return {
            title: '書籍情報の取得に失敗しました（手動で入力してください）',
            author: '不明',
            reviewCount: 0,
            imageUrl: '',
            fetchedAt: new Date().toISOString(),
            isMockData: true,
            asin: asin
        };
    }

    /**
     * URLからASINを抽出
     */
    extractASIN(url) {
        const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})|\/product\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})/);
        return asinMatch ? (asinMatch[1] || asinMatch[2] || asinMatch[3]) : null;
    }

    /**
     * HTMLから書籍情報を抽出
     */
    parseBookInfo(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // タイトルを取得
        const titleElement = doc.querySelector('#productTitle') || 
                           doc.querySelector('.product-title') ||
                           doc.querySelector('h1');
        const title = titleElement ? titleElement.textContent.trim() : '';

        // 著者を取得
        const authorElement = doc.querySelector('.author a') ||
                            doc.querySelector('.byline a') ||
                            doc.querySelector('[data-automation-id="byline"]');
        const author = authorElement ? authorElement.textContent.trim() : '';

        // レビュー数を取得
        const reviewElement = doc.querySelector('#acrCustomerReviewText') ||
                            doc.querySelector('.averageStarRatingNumerical') ||
                            doc.querySelector('[data-automation-id="reviews-block"]');
        const reviewText = reviewElement ? reviewElement.textContent.trim() : '';
        const reviewCount = this.extractReviewCount(reviewText);

        // 書影URLを取得
        const imageElement = doc.querySelector('#landingImage') ||
                           doc.querySelector('.frontImage') ||
                           doc.querySelector('.a-image-view img');
        const imageUrl = imageElement ? imageElement.src || imageElement.getAttribute('data-src') : '';

        return {
            title,
            author,
            reviewCount,
            imageUrl,
            fetchedAt: new Date().toISOString()
        };
    }

    /**
     * レビュー数を数値で抽出
     */
    extractReviewCount(text) {
        if (!text) return 0;
        
        const matches = text.match(/([0-9,]+)/);
        if (matches) {
            return parseInt(matches[1].replace(/,/g, ''), 10);
        }
        
        return 0;
    }

    /**
     * URLがAmazon URLかチェック
     */
    isValidAmazonUrl(url) {
        const amazonPattern = /^https?:\/\/(www\.)?(amazon\.(co\.jp|com)|amzn\.to)/;
        return amazonPattern.test(url);
    }
}