/**
 * Amazon書籍情報取得サービス
 */
export class BookInfoService {
    constructor() {
        // 複数のCORS プロキシを定義（フォールバック対応）
        this.corsProxies = [
            'https://api.allorigins.win/get?url=',
            // 'https://corsproxy.io/?', // 一時的に無効化（403エラーのため）
            // 'https://cors-anywhere.herokuapp.com/', // 一時的に無効化（制限のため）
        ];
        this.currentProxyIndex = 0;
    }

    /**
     * Amazon URLから書籍情報を取得
     */
    async fetchBookInfo(amazonUrl) {
        let lastError = null;
        
        // URL形式を検証
        const urlValidation = this.validateAmazonUrl(amazonUrl);
        if (!urlValidation.valid) {
            console.warn('❌ Invalid Amazon URL:', urlValidation.error);
            return this.getMockBookInfo(amazonUrl);
        }
        
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
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 10000 // 10秒タイムアウト
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                let html;
                if (currentProxy.includes('allorigins.win')) {
                    const data = await response.json();
                    html = data.contents;
                    
                    // status_codeをチェック
                    if (data.status && data.status.http_code !== 200) {
                        throw new Error(`Amazon returned HTTP ${data.status.http_code}`);
                    }
                } else {
                    html = await response.text();
                }
                
                if (!html || html.length < 1000) {
                    throw new Error('Empty or invalid HTML response');
                }
                
                // 404ページやエラーページをチェック
                if (this.isErrorPage(html)) {
                    throw new Error('Amazon page not found or access denied');
                }
                
                // HTMLから書籍情報を抽出
                const bookInfo = this.parseBookInfo(html);
                
                // 抽出したデータが有効かチェック
                if (!bookInfo.title || bookInfo.title.includes('取得に失敗')) {
                    throw new Error('Failed to extract valid book information');
                }
                
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
        
        // すべてのプロキシが失敗した場合、詳細な情報付きでモックデータを返す
        console.warn('❌ All proxies failed, returning mock data. Last error:', lastError?.message);
        const mockData = this.getMockBookInfo(amazonUrl);
        mockData.fetchError = lastError?.message;
        return mockData;
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
     * Amazon URLの形式を検証
     */
    validateAmazonUrl(url) {
        if (!url) {
            return { valid: false, error: 'URL not provided' };
        }

        // 基本的なURL形式チェック
        try {
            new URL(url);
        } catch {
            return { valid: false, error: 'Invalid URL format' };
        }

        // Amazon ドメインチェック
        const amazonPattern = /^https?:\/\/(www\.)?(amazon\.(co\.jp|com|de|fr|it|es|ca|com\.au|in|com\.br|com\.mx)|amzn\.to)/;
        if (!amazonPattern.test(url)) {
            return { valid: false, error: 'Not an Amazon URL' };
        }

        // ASIN存在チェック
        const asin = this.extractASIN(url);
        if (!asin) {
            return { valid: false, error: 'No ASIN found in URL' };
        }

        return { valid: true, asin: asin };
    }

    /**
     * エラーページかどうかをチェック
     */
    isErrorPage(html) {
        const errorIndicators = [
            'Page Not Found',
            'Looking for something?',
            'We\'re sorry',
            'not a functioning page',
            'api-services-support@amazon.com',
            '404',
            'Access Denied',
            'Robot Check'
        ];

        const lowercaseHtml = html.toLowerCase();
        return errorIndicators.some(indicator => 
            lowercaseHtml.includes(indicator.toLowerCase())
        );
    }

    /**
     * HTMLから書籍情報を抽出
     */
    parseBookInfo(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // タイトルを取得（複数の候補セレクタを試行）
        const titleSelectors = [
            '#productTitle',
            'h1[data-automation-id="title"]',
            'h1.a-size-large',
            '.product-title',
            'h1.a-size-base-plus',
            'h1'
        ];
        let title = '';
        for (const selector of titleSelectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent.trim()) {
                title = element.textContent.trim();
                break;
            }
        }

        // 著者を取得（複数の候補セレクタを試行）
        const authorSelectors = [
            '.author .a-link-normal',
            '.author a',
            '.byline .a-link-normal',
            '.byline a',
            '[data-automation-id="byline"] a',
            '.a-row .a-link-normal[href*="search-alias=stripbooks"]',
            'span.author a.a-link-normal'
        ];
        let author = '';
        for (const selector of authorSelectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent.trim()) {
                author = element.textContent.trim();
                break;
            }
        }

        // レビュー数を取得（複数の候補セレクタを試行）
        const reviewSelectors = [
            '#acrCustomerReviewText',
            '[data-hook="total-review-count"]',
            '.a-link-normal[href*="reviews"] span',
            '.averageStarRatingNumerical',
            '[data-automation-id="reviews-block"]'
        ];
        let reviewText = '';
        for (const selector of reviewSelectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent.trim()) {
                reviewText = element.textContent.trim();
                break;
            }
        }
        const reviewCount = this.extractReviewCount(reviewText);

        // 書影URLを取得（複数の候補セレクタを試行）
        const imageSelectors = [
            '#landingImage',
            '#imgBlkFront',
            '.frontImage',
            '.a-image-view img',
            '#main-image',
            '#ebooksImgBlkFront'
        ];
        let imageUrl = '';
        for (const selector of imageSelectors) {
            const element = doc.querySelector(selector);
            if (element) {
                imageUrl = element.src || element.getAttribute('data-src') || element.getAttribute('data-a-dynamic-image');
                if (imageUrl) {
                    // data-a-dynamic-image からJSONパースして最初の画像を取得
                    if (imageUrl.startsWith('{')) {
                        try {
                            const imageData = JSON.parse(imageUrl);
                            const firstImageUrl = Object.keys(imageData)[0];
                            if (firstImageUrl) {
                                imageUrl = firstImageUrl;
                            }
                        } catch (e) {
                            // JSON パースに失敗した場合はそのまま使用
                        }
                    }
                    break;
                }
            }
        }

        // 抽出結果の検証
        const result = {
            title: title || 'タイトルを取得できませんでした（手動で入力してください）',
            author: author || '著者を取得できませんでした（手動で入力してください）',
            reviewCount: reviewCount,
            imageUrl: imageUrl,
            fetchedAt: new Date().toISOString(),
            extractionSuccess: !!(title && author)
        };

        console.log('📖 Extracted book info:', result);
        return result;
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