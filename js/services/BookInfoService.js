/**
 * Amazon書籍情報取得サービス
 */
export class BookInfoService {
    constructor() {
        this.corsProxy = 'https://api.allorigins.win/get?url=';
    }

    /**
     * Amazon URLから書籍情報を取得
     */
    async fetchBookInfo(amazonUrl) {
        try {
            console.log('📚 Fetching book info from:', amazonUrl);
            
            const proxyUrl = this.corsProxy + encodeURIComponent(amazonUrl);
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            const html = data.contents;
            
            // HTMLから書籍情報を抽出
            const bookInfo = this.parseBookInfo(html);
            
            console.log('✅ Book info fetched successfully:', bookInfo);
            return bookInfo;
            
        } catch (error) {
            console.error('❌ Failed to fetch book info:', error);
            throw error;
        }
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