export class ValidationService {
  validateAmazonUrl(url) {
    if (!url || typeof url !== 'string') return { isValid: false, error: 'AmazonのURLを入力してください' };
    const u = url.trim();
    const pattern = /^https?:\/\/(www\.)?(amazon\.(co\.jp|com)|amzn\.to)\//;
    if (!pattern.test(u)) return { isValid: false, error: '有効なAmazon URLを入力してください' };
    return { isValid: true, url: u };
  }
  validateTargetReviews(v) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return { isValid: false, error: '目標レビュー数は数値で入力してください' };
    if (n <= 0 || n > 100000) return { isValid: false, error: '目標レビュー数は1〜100,000の範囲で入力してください' };
    return { isValid: true, value: n };
  }
  validateBookTitle(s) {
    if (!s || !s.trim()) return { isValid: false, error: '書籍タイトルを入力してください' };
    const t = s.trim();
    if (t.length > 200) return { isValid: false, error: 'タイトルは200文字以内で入力してください' };
    return { isValid: true, title: t };
  }
  validateAuthor(s) {
    if (!s || !s.trim()) return { isValid: false, error: '著者名を入力してください' };
    const a = s.trim();
    if (a.length > 100) return { isValid: false, error: '著者名は100文字以内で入力してください' };
    return { isValid: true, author: a };
  }
}

