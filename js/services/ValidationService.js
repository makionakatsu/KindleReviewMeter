/**
 * 入力値検証サービス
 */
export class ValidationService {
    /**
     * Amazon URLを検証
     */
    validateAmazonUrl(url) {
        if (!url || typeof url !== 'string') {
            return { 
                isValid: false, 
                error: '📝 AmazonのURLを入力してください。\n例: https://www.amazon.co.jp/dp/XXXXXXXXXX' 
            };
        }

        const trimmedUrl = url.trim();
        if (!trimmedUrl) {
            return { 
                isValid: false, 
                error: '📝 AmazonのURLを入力してください。\n例: https://www.amazon.co.jp/dp/XXXXXXXXXX' 
            };
        }

        const amazonPattern = /^https?:\/\/(www\.)?(amazon\.(co\.jp|com)|amzn\.to)/;
        if (!amazonPattern.test(trimmedUrl)) {
            return { 
                isValid: false, 
                error: '❌ 有効なAmazon URLを入力してください。\n\n対応URL形式:\n• https://www.amazon.co.jp/dp/XXXXXXXXXX\n• https://www.amazon.co.jp/gp/product/XXXXXXXXXX\n• https://www.amazon.com/dp/XXXXXXXXXX\n• https://amzn.to/XXXXXXX' 
            };
        }

        return { isValid: true, url: trimmedUrl };
    }

    /**
     * 目標レビュー数を検証
     */
    validateTargetReviews(value) {
        const num = parseInt(value, 10);
        
        if (isNaN(num)) {
            return { 
                isValid: false, 
                error: '🔢 目標レビュー数は数値で入力してください。\n例: 100, 500, 1000' 
            };
        }

        if (num <= 0) {
            return { 
                isValid: false, 
                error: '📈 目標レビュー数は1以上の値を入力してください。\n現実的な目標を設定しましょう。' 
            };
        }

        if (num > 100000) {
            return { 
                isValid: false, 
                error: '⚠️ 目標レビュー数は100,000以下で入力してください。\n段階的な目標設定をおすすめします。' 
            };
        }

        return { isValid: true, value: num };
    }

    /**
     * 書籍タイトルを検証
     */
    validateBookTitle(title) {
        if (!title || typeof title !== 'string') {
            return { 
                isValid: false, 
                error: '📚 書籍タイトルを入力してください。\n正確なタイトルを入力することで、より良い管理ができます。' 
            };
        }

        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            return { 
                isValid: false, 
                error: '📚 書籍タイトルを入力してください。\n正確なタイトルを入力することで、より良い管理ができます。' 
            };
        }

        if (trimmedTitle.length > 200) {
            return { 
                isValid: false, 
                error: '📏 タイトルは200文字以内で入力してください。\n現在: ' + trimmedTitle.length + '文字' 
            };
        }

        return { isValid: true, title: trimmedTitle };
    }

    /**
     * 著者名を検証
     */
    validateAuthor(author) {
        if (!author || typeof author !== 'string') {
            return { 
                isValid: false, 
                error: '✍️ 著者名を入力してください。\n複数の著者がいる場合は「, 」で区切って入力できます。' 
            };
        }

        const trimmedAuthor = author.trim();
        if (!trimmedAuthor) {
            return { 
                isValid: false, 
                error: '✍️ 著者名を入力してください。\n複数の著者がいる場合は「, 」で区切って入力できます。' 
            };
        }

        if (trimmedAuthor.length > 100) {
            return { 
                isValid: false, 
                error: '📏 著者名は100文字以内で入力してください。\n現在: ' + trimmedAuthor.length + '文字' 
            };
        }

        return { isValid: true, author: trimmedAuthor };
    }
}