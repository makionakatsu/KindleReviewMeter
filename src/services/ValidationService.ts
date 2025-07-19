/**
 * バリデーションサービス
 * 
 * 入力データの検証とサニタイゼーションを行うサービス
 */

import { ValidationService, ValidationResult, BookData, AppConfig } from '../types/index.js';

export class BookValidationService implements ValidationService {
  private config: AppConfig['validationRules'];

  constructor(config?: AppConfig['validationRules']) {
    this.config = config || this.getDefaultConfig();
  }

  /**
   * デフォルト設定を取得
   */
  private getDefaultConfig(): AppConfig['validationRules'] {
    return {
      bookTitle: {
        minLength: 1,
        maxLength: 200,
      },
      bookAuthor: {
        minLength: 2,
        maxLength: 100,
        invalidTerms: [
          'follow', 'more', 'see', 'clothing', 'store', 'shop', 'brand',
          'kindle', 'amazon', 'paperback', 'hardcover', 'format',
          'page', 'pages', 'price', 'buy', 'purchase', 'cart', 'wishlist',
          'review', 'reviews', 'customer', 'rating', 'star', 'stars',
          'visit', 'website', 'profile', 'biography', 'bio', 'more info'
        ],
      },
      reviews: {
        min: 0,
        max: 1000000,
      },
      url: {
        allowedDomains: ['amazon.co.jp', 'amazon.com'],
      },
    };
  }

  /**
   * 書籍データ全体をバリデーション
   */
  validateBookData(data: Partial<BookData>): ValidationResult {
    const errors: Record<string, string> = {};
    const warnings: string[] = [];

    // URL バリデーション
    if (data.bookUrl !== undefined) {
      if (!data.bookUrl.trim()) {
        errors.bookUrl = 'URLは必須です';
      } else if (!this.validateUrl(data.bookUrl)) {
        errors.bookUrl = '有効なAmazonのURLを入力してください';
      }
    }

    // タイトル バリデーション
    if (data.bookTitle !== undefined) {
      const titleValidation = this.validateBookTitle(data.bookTitle);
      if (!titleValidation.isValid) {
        errors.bookTitle = titleValidation.error || 'タイトルが無効です';
      }
    }

    // 著者名 バリデーション
    if (data.bookAuthor !== undefined) {
      const authorValidation = this.validateAuthorName(data.bookAuthor);
      if (!authorValidation) {
        if (data.bookAuthor.trim()) {
          errors.bookAuthor = '著者名が無効です';
        }
        // 空の場合は警告のみ
        else {
          warnings.push('著者名が設定されていません');
        }
      }
    }

    // レビュー数 バリデーション
    if (data.currentReviews !== undefined) {
      const reviewValidation = this.validateReviewCount(data.currentReviews);
      if (!reviewValidation.isValid) {
        errors.currentReviews = reviewValidation.error || '現在のレビュー数が無効です';
      }
    }

    // 目標レビュー数 バリデーション
    if (data.targetReviews !== undefined) {
      const targetValidation = this.validateReviewCount(data.targetReviews, true);
      if (!targetValidation.isValid) {
        errors.targetReviews = targetValidation.error || '目標レビュー数が無効です';
      }
    }

    // ストレッチ目標 バリデーション
    if (data.stretchReviews !== undefined && data.targetReviews !== undefined) {
      if (data.stretchReviews <= data.targetReviews) {
        errors.stretchReviews = 'ストレッチ目標は目標レビュー数より大きく設定してください';
      } else {
        const stretchValidation = this.validateReviewCount(data.stretchReviews, true);
        if (!stretchValidation.isValid) {
          errors.stretchReviews = stretchValidation.error || 'ストレッチ目標が無効です';
        }
      }
    }

    // カバー画像URL バリデーション
    if (data.bookCoverUrl !== undefined && data.bookCoverUrl.trim()) {
      if (!this.validateImageUrl(data.bookCoverUrl)) {
        warnings.push('書影URLの形式が正しくない可能性があります');
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings,
    };
  }

  /**
   * URL バリデーション
   */
  validateUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return this.config.url.allowedDomains.some(domain => 
        urlObj.hostname.includes(domain)
      );
    } catch {
      return false;
    }
  }

  /**
   * 書籍タイトルのバリデーション
   */
  private validateBookTitle(title: string): { isValid: boolean; error?: string } {
    const trimmedTitle = title.trim();

    if (trimmedTitle.length < this.config.bookTitle.minLength) {
      return {
        isValid: false,
        error: `タイトルは${this.config.bookTitle.minLength}文字以上で入力してください`,
      };
    }

    if (trimmedTitle.length > this.config.bookTitle.maxLength) {
      return {
        isValid: false,
        error: `タイトルは${this.config.bookTitle.maxLength}文字以内で入力してください`,
      };
    }

    // 疑わしいパターンをチェック
    const suspiciousPatterns = [
      /^[\d\s\-_]+$/,           // 数字と記号のみ
      /^[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+$/, // 文字以外のみ
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(trimmedTitle))) {
      return {
        isValid: false,
        error: 'タイトルの形式が正しくありません',
      };
    }

    return { isValid: true };
  }

  /**
   * 著者名のバリデーション
   */
  validateAuthorName(author: string): boolean {
    const trimmedAuthor = author.trim();

    // 空文字列は有効（未設定として扱う）
    if (trimmedAuthor === '') {
      return true;
    }

    // 長さチェック
    if (trimmedAuthor.length < this.config.bookAuthor.minLength ||
        trimmedAuthor.length > this.config.bookAuthor.maxLength) {
      return false;
    }

    // 無効な用語チェック
    const lowerAuthor = trimmedAuthor.toLowerCase();
    if (this.config.bookAuthor.invalidTerms.some(term => 
        lowerAuthor.includes(term.toLowerCase()))) {
      return false;
    }

    // 数字のみや記号のみを除外
    if (/^\d+$/.test(trimmedAuthor) || /^[^\w\s]*$/.test(trimmedAuthor)) {
      return false;
    }

    return true;
  }

  /**
   * 詳細な著者名バリデーション
   */
  private validateAuthorNameDetailed(author: string): { isValid: boolean; error?: string } {
    if (!this.validateAuthorName(author)) {
      const trimmedAuthor = author.trim();
      
      if (trimmedAuthor.length < this.config.bookAuthor.minLength) {
        return {
          isValid: false,
          error: `著者名は${this.config.bookAuthor.minLength}文字以上で入力してください`,
        };
      }

      if (trimmedAuthor.length > this.config.bookAuthor.maxLength) {
        return {
          isValid: false,
          error: `著者名は${this.config.bookAuthor.maxLength}文字以内で入力してください`,
        };
      }

      return {
        isValid: false,
        error: '著者名に無効な文字が含まれています',
      };
    }

    return { isValid: true };
  }

  /**
   * レビュー数のバリデーション
   */
  private validateReviewCount(count: number, required: boolean = false): { isValid: boolean; error?: string } {
    if (!Number.isInteger(count)) {
      return {
        isValid: false,
        error: '整数で入力してください',
      };
    }

    if (count < this.config.reviews.min) {
      return {
        isValid: false,
        error: `${this.config.reviews.min}以上の値を入力してください`,
      };
    }

    if (count > this.config.reviews.max) {
      return {
        isValid: false,
        error: `${this.config.reviews.max}以下の値を入力してください`,
      };
    }

    if (required && count === 0) {
      return {
        isValid: false,
        error: '1以上の値を入力してください',
      };
    }

    return { isValid: true };
  }

  /**
   * 画像URLのバリデーション
   */
  private validateImageUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // HTTPSまたはHTTPをチェック
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // 画像拡張子をチェック
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const pathname = urlObj.pathname.toLowerCase();
      
      return imageExtensions.some(ext => pathname.includes(ext)) ||
             pathname.includes('image') ||
             urlObj.hostname.includes('amazon');
    } catch {
      return false;
    }
  }

  /**
   * 入力のサニタイゼーション
   */
  sanitizeInput(input: string): string {
    return input
      .trim()
      .replace(/\s+/g, ' ')                    // 連続する空白を単一スペースに
      .replace(/[\u0000-\u001F\u007F]/g, '')   // 制御文字を除去
      .replace(/[<>]/g, '')                    // 危険な文字を除去
      .substring(0, 1000);                     // 最大長制限
  }

  /**
   * HTMLタグを除去
   */
  stripHtml(input: string): string {
    return input.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * 数値の正規化
   */
  normalizeNumber(input: string | number): number {
    if (typeof input === 'number') {
      return Math.max(0, Math.floor(input));
    }

    const cleaned = input.replace(/[^\d]/g, '');
    const number = parseInt(cleaned, 10);
    
    return isNaN(number) ? 0 : Math.max(0, number);
  }

  /**
   * URLの正規化
   */
  normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url.trim());
      
      // Amazon URLの特別処理
      if (urlObj.hostname.includes('amazon')) {
        // 不要なパラメータを除去
        const allowedParams = ['dp', 'gp', 'product'];
        const pathname = urlObj.pathname;
        
        // 商品IDを抽出
        const productIdMatch = pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
        if (productIdMatch) {
          return `${urlObj.origin}/dp/${productIdMatch[1]}`;
        }
      }
      
      return urlObj.toString();
    } catch {
      return url.trim();
    }
  }

  /**
   * バリデーション設定を更新
   */
  updateConfig(config: Partial<AppConfig['validationRules']>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * バリデーション設定を取得
   */
  getConfig(): AppConfig['validationRules'] {
    return { ...this.config };
  }
}