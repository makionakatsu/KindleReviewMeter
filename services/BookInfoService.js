/**
 * 書籍情報取得サービス
 *
 * 【責任範囲】
 * - Amazon書籍ページから包括的な書籍情報の自動取得
 * - プロキシサービスを経由したCORS制限の回避
 * - 複数の抽出パターンによる高い成功率の実現
 * - ネットワークエラーとパースエラーの適切なハンドリング
 * - レート制限と負荷分散の考慮
 *
 * 【取得対象データ】
 * - 書籍タイトル：title要素、og:title、span#title等から抽出
 * - 著者名：AuthorExtractionServiceと連携した高精度抽出
 * - レビュー数：data-hook="total-review-count"等の複数パターン対応
 * - 書影URL：hiRes、large、landingImage等の高解像度画像を優先取得
 *
 * 【技術実装】
 * - プロキシ：api.allorigins.win経由でのCORS回避
 * - エラー処理：ネットワーク、パース、認証エラーの分類と適切な対応
 * - パフォーマンス：並行処理による高速化
 * - 信頼性：複数のフォールバックパターンによる堅牢性
 */
import { AuthorExtractionService } from './AuthorExtractionService.js';
import { logger } from '../utils/AILogger.js';
import { securityHelper } from '../utils/SecurityHelper.js';
export class AmazonBookInfoService {
    constructor(options = {}) {
        Object.defineProperty(this, "authorExtractor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "proxyUrl", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timeout", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxRetries", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.proxyUrl = options.proxyUrl || 'https://api.allorigins.win/raw?url=';
        this.timeout = options.timeout || 30000;
        this.maxRetries = options.maxRetries || 3;
        this.authorExtractor = new AuthorExtractionService(options.debugMode);
    }
    /**
     * 書籍情報を取得
     */
    async fetchBookInfo(url) {
        const startTime = performance.now();
        const result = {
            success: false,
            errors: [],
            warnings: [],
            metadata: {
                url,
                fetchTime: 0,
                dataSize: 0,
                extractedFields: [],
            },
        };
        try {
            // セキュリティ検証
            const urlValidation = securityHelper.validateAmazonURL(url);
            if (!urlValidation.isValid) {
                logger.error({
                    component: 'BookInfoService',
                    method: 'fetchBookInfo',
                    operation: 'SECURITY_VALIDATION_FAILED',
                    data: { url }
                }, `🚨 SECURITY_VALIDATION_FAILED: Invalid Amazon URL`, ['security', 'validation', 'failed']);
                result.errors.push('無効または安全でないAmazonのURLです');
                return result;
            }
            // 従来のURL検証も実行
            if (!this.validateUrl(url)) {
                result.errors.push('無効なAmazonのURLです');
                return result;
            }
            console.log('📚 書籍情報取得開始:', url);
            // HTMLを取得
            const html = await this.fetchHTML(url);
            result.metadata.dataSize = html.length;
            // 各情報を抽出
            const bookData = {};
            // 1. タイトル抽出
            try {
                const title = this.extractTitle(html);
                if (title) {
                    bookData.bookTitle = title;
                    result.metadata.extractedFields.push('title');
                    console.log('✅ タイトル取得:', title);
                }
                else {
                    result.warnings.push('タイトルを取得できませんでした');
                }
            }
            catch (error) {
                result.warnings.push(`タイトル取得エラー: ${String(error)}`);
            }
            // 2. 著者名抽出
            try {
                const authorResult = await this.extractAuthor(html, url);
                if (authorResult.author) {
                    bookData.bookAuthor = authorResult.author;
                    result.metadata.extractedFields.push('author');
                    console.log('✅ 著者名取得:', authorResult.author);
                }
                else {
                    result.warnings.push('著者名を取得できませんでした');
                }
            }
            catch (error) {
                result.warnings.push(`著者名取得エラー: ${String(error)}`);
            }
            // 3. レビュー数抽出
            try {
                const reviewCount = this.extractReviewCount(html);
                if (reviewCount !== null) {
                    bookData.currentReviews = reviewCount;
                    result.metadata.extractedFields.push('reviews');
                    console.log('✅ レビュー数取得:', reviewCount);
                }
                else {
                    result.warnings.push('レビュー数を取得できませんでした');
                }
            }
            catch (error) {
                result.warnings.push(`レビュー数取得エラー: ${String(error)}`);
            }
            // 4. 書影抽出
            try {
                const coverUrl = this.extractCoverImage(html, url);
                if (coverUrl) {
                    bookData.bookCoverUrl = coverUrl;
                    result.metadata.extractedFields.push('cover');
                    console.log('✅ 書影URL取得:', coverUrl);
                }
                else {
                    result.warnings.push('書影を取得できませんでした');
                }
            }
            catch (error) {
                result.warnings.push(`書影取得エラー: ${String(error)}`);
            }
            // 結果をセット
            if (result.metadata.extractedFields.length > 0) {
                result.success = true;
                result.data = bookData;
                console.log(`📚 取得完了: ${result.metadata.extractedFields.join('、')} (${result.metadata.extractedFields.length}/4項目)`);
            }
            else {
                result.errors.push('書籍情報を取得できませんでした');
            }
        }
        catch (error) {
            console.error('書籍情報取得エラー:', error);
            result.errors.push(`取得に失敗しました: ${String(error)}`);
        }
        finally {
            result.metadata.fetchTime = performance.now() - startTime;
        }
        return result;
    }
    /**
     * 著者名を抽出
     */
    async extractAuthor(html, url) {
        return this.authorExtractor.extractAuthor(html, url);
    }
    /**
     * URLの検証
     */
    validateUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.includes('amazon.co.jp') || urlObj.hostname.includes('amazon.com');
        }
        catch {
            return false;
        }
    }
    /**
     * HTMLを取得
     */
    async fetchHTML(url) {
        let lastError = null;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`🌐 HTML取得試行 ${attempt}/${this.maxRetries}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);
                const response = await fetch(this.proxyUrl + encodeURIComponent(url), {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    },
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const html = await response.text();
                console.log(`✅ HTML取得成功 (${html.length} 文字)`);
                return html;
            }
            catch (error) {
                lastError = error;
                console.warn(`❌ HTML取得失敗 (試行 ${attempt}/${this.maxRetries}):`, String(error));
                if (attempt < this.maxRetries) {
                    // 指数バックオフで待機
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.log(`⏳ ${delay}ms 待機後に再試行...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw new Error(`HTML取得に失敗しました (${this.maxRetries}回試行): ${lastError?.message}`);
    }
    /**
     * タイトルを抽出
     */
    extractTitle(html) {
        const titlePatterns = [
            // より具体的なセレクター
            /<span[^>]+id="[^"]*productTitle[^"]*"[^>]*>([^<]+)<\/span>/i,
            /<h1[^>]+id="[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/i,
            // OpenGraph、meta タグ
            /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
            /<meta[^>]+name="title"[^>]+content="([^"]+)"/i,
            // JSON-LD構造化データ
            /"name"\s*:\s*"([^"]+)"/,
            // title タグ（最後の手段）
            /<title[^>]*>([^<]+)<\/title>/i,
        ];
        for (const pattern of titlePatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                let title = match[1]
                    .replace(/\s*[-|:]\s*Amazon.*$/i, '')
                    .replace(/\s*[-|:]\s*アマゾン.*$/i, '')
                    .replace(/\s*\|\s*.*$/, '')
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .trim();
                if (title.length > 5 && title.length <= 200) {
                    return title;
                }
            }
        }
        return null;
    }
    /**
     * レビュー数を抽出
     */
    extractReviewCount(html) {
        const reviewPatterns = [
            // 最新のAmazon構造
            /data-hook="total-review-count"[^>]*>([0-9,]+)/i,
            /<span[^>]*data-hook="total-review-count"[^>]*>([0-9,]+)<\/span>/i,
            // 日本語パターン
            /([0-9,]+)\s*個のカスタマーレビュー/i,
            /([0-9,]+)\s*件のレビュー/i,
            /レビュー\s*[：:]\s*([0-9,]+)\s*件/i,
            // 英語パターン
            /([0-9,]+)\s*customer reviews?/i,
            /([0-9,]+)\s*reviews?/i,
            // JSON構造化データ
            /"reviewCount"\s*:\s*([0-9]+)/i,
            /"ratingCount"\s*:\s*([0-9]+)/i,
            // より汎用的なパターン
            /(?:レビュー|reviews?)\s*[：:]?\s*([0-9,]+)/i,
        ];
        for (const pattern of reviewPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                const reviewCount = parseInt(match[1].replace(/,/g, ''), 10);
                if (!isNaN(reviewCount) && reviewCount >= 0) {
                    return reviewCount;
                }
            }
        }
        return null;
    }
    /**
     * 書影URLを抽出
     */
    extractCoverImage(html, pageUrl) {
        const coverPatterns = [
            // 高解像度画像
            /"hiRes":"([^"]+)"/,
            /"large":"([^"]+)"/,
            // メイン商品画像
            /<img[^>]+id="landingImage"[^>]+src="([^"]+)"/i,
            /<img[^>]+data-old-hires="([^"]+)"/i,
            // JSON構造化データ
            /"image"\s*:\s*"([^"]+)"/,
            /"imageUrl"\s*:\s*"([^"]+)"/,
            // OpenGraph
            /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i,
            // その他の画像パターン
            /<img[^>]+class="[^"]*book[^"]*"[^>]+src="([^"]+)"/i,
            /<img[^>]+alt="[^"]*表紙[^"]*"[^>]+src="([^"]+)"/i,
        ];
        for (const pattern of coverPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                let coverUrl = match[1]
                    .replace(/\\u002F/g, '/')
                    .replace(/\\\//g, '/')
                    .replace(/\\/g, '');
                // 相対URLを絶対URLに変換
                if (coverUrl.startsWith('//')) {
                    coverUrl = 'https:' + coverUrl;
                }
                else if (coverUrl.startsWith('/')) {
                    const urlObj = new URL(pageUrl);
                    coverUrl = urlObj.origin + coverUrl;
                }
                // 有効なHTTP(S) URLかチェック
                if (coverUrl.startsWith('http') && this.isValidImageUrl(coverUrl)) {
                    return coverUrl;
                }
            }
        }
        return null;
    }
    /**
     * 画像URLの妥当性をチェック
     */
    isValidImageUrl(url) {
        try {
            const urlObj = new URL(url);
            // Amazon以外のドメインは警告
            const trustedDomains = ['amazon.com', 'amazon.co.jp', 'ssl-images-amazon.com', 'm.media-amazon.com'];
            if (!trustedDomains.some(domain => urlObj.hostname.includes(domain))) {
                console.warn('信頼できないドメインの画像URL:', urlObj.hostname);
            }
            // 明らかに画像でないURLを除外
            const path = urlObj.pathname.toLowerCase();
            const suspiciousPatterns = ['/node/', '/review/', '/customer/', '/seller/', '/dp/'];
            if (suspiciousPatterns.some(pattern => path.includes(pattern)) && !path.includes('image')) {
                return false;
            }
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * サービス設定を更新
     */
    updateConfig(config) {
        if (config.proxyUrl)
            this.proxyUrl = config.proxyUrl;
        if (config.timeout)
            this.timeout = config.timeout;
        if (config.maxRetries)
            this.maxRetries = config.maxRetries;
    }
    /**
     * キャッシュされた結果をクリア（将来の拡張用）
     */
    clearCache() {
        // 将来的にキャッシュ機能を追加する場合の準備
        console.log('キャッシュクリア（現在はキャッシュ機能なし）');
    }
    /**
     * サービスの健全性をチェック
     */
    async healthCheck() {
        const details = {
            proxyUrl: this.proxyUrl,
            timeout: this.timeout,
            maxRetries: this.maxRetries,
            timestamp: new Date().toISOString(),
        };
        try {
            // 簡単な接続テスト
            const testUrl = 'https://www.amazon.co.jp/';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(this.proxyUrl + encodeURIComponent(testUrl), {
                signal: controller.signal,
                method: 'HEAD',
            });
            clearTimeout(timeoutId);
            details.proxyStatus = response.status;
            details.healthy = response.ok;
            return {
                healthy: response.ok,
                details,
            };
        }
        catch (error) {
            details.error = String(error);
            details.healthy = false;
            return {
                healthy: false,
                details,
            };
        }
    }
}
//# sourceMappingURL=BookInfoService.js.map