/**
 * 入力値検証サービス
 */
export class ValidationService {
    /**
     * Amazon URLを検証
     */
    validateAmazonUrl(url) {
        if (!url || typeof url !== 'string') {
            return { isValid: false, error: 'URLが入力されていません' };
        }

        const trimmedUrl = url.trim();
        if (!trimmedUrl) {
            return { isValid: false, error: 'URLが入力されていません' };
        }

        const amazonPattern = /^https?:\/\/(www\.)?(amazon\.(co\.jp|com)|amzn\.to)/;
        if (!amazonPattern.test(trimmedUrl)) {
            return { isValid: false, error: 'Amazon URLではありません' };
        }

        return { isValid: true, url: trimmedUrl };
    }

    /**
     * 目標レビュー数を検証
     */
    validateTargetReviews(value) {
        const num = parseInt(value, 10);
        
        if (isNaN(num)) {
            return { isValid: false, error: '数値を入力してください' };
        }

        if (num <= 0) {
            return { isValid: false, error: '1以上の数値を入力してください' };
        }

        if (num > 100000) {
            return { isValid: false, error: '100,000以下の数値を入力してください' };
        }

        return { isValid: true, value: num };
    }

    /**
     * 書籍タイトルを検証
     */
    validateBookTitle(title) {
        if (!title || typeof title !== 'string') {
            return { isValid: false, error: 'タイトルが取得できませんでした' };
        }

        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            return { isValid: false, error: 'タイトルが取得できませんでした' };
        }

        if (trimmedTitle.length > 200) {
            return { isValid: false, error: 'タイトルが長すぎます' };
        }

        return { isValid: true, title: trimmedTitle };
    }

    /**
     * 著者名を検証
     */
    validateAuthor(author) {
        if (!author || typeof author !== 'string') {
            return { isValid: false, error: '著者名が取得できませんでした' };
        }

        const trimmedAuthor = author.trim();
        if (!trimmedAuthor) {
            return { isValid: false, error: '著者名が取得できませんでした' };
        }

        if (trimmedAuthor.length > 100) {
            return { isValid: false, error: '著者名が長すぎます' };
        }

        return { isValid: true, author: trimmedAuthor };
    }
}