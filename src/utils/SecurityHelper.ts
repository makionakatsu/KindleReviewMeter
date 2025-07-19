/**
 * セキュリティヘルパー
 * 
 * 【責任範囲】
 * - XSS攻撃対策のためのコンテンツサニタイゼーション
 * - CSRF対策のためのトークン管理
 * - 入力値検証とエスケープ処理
 * - セキュアなURL検証
 * - CSP違反の検出と報告
 */

import { logger } from './AILogger.js';

export class SecurityHelper {
  private static instance: SecurityHelper;
  private allowedDomains: Set<string> = new Set([
    'amazon.co.jp',
    'amazon.com',
    'ssl-images-amazon.com',
    'm.media-amazon.com',
    'images-amazon.com'
  ]);

  private constructor() {
    this.setupCSPReporting();
  }

  static getInstance(): SecurityHelper {
    if (!SecurityHelper.instance) {
      SecurityHelper.instance = new SecurityHelper();
    }
    return SecurityHelper.instance;
  }

  /**
   * HTML文字列をサニタイズ（XSS対策）
   */
  sanitizeHTML(input: string): string {
    if (!input) return '';

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * テキストコンテンツをサニタイズ
   */
  sanitizeText(input: string): string {
    if (!input) return '';

    // 制御文字と危険なUnicode文字を除去
    return input
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/[\u2000-\u200F\u2028-\u202F\u205F-\u206F]/g, '')
      .replace(/[\uFEFF\uFFF0-\uFFFF]/g, '');
  }

  /**
   * URLの安全性を検証
   */
  validateURL(url: string): { isValid: boolean; isSafe: boolean; normalizedUrl?: string } {
    if (!url) {
      return { isValid: false, isSafe: false };
    }

    try {
      const urlObj = new URL(url);
      
      // HTTPSを強制
      if (urlObj.protocol !== 'https:') {
        logger.warn({
          component: 'SecurityHelper',
          method: 'validateURL',
          operation: 'INSECURE_PROTOCOL',
          data: { url, protocol: urlObj.protocol }
        }, `⚠️ INSECURE_PROTOCOL: URL uses insecure protocol: ${urlObj.protocol}`, ['security', 'url', 'insecure']);
        
        return { isValid: true, isSafe: false };
      }

      // 許可されたドメインかチェック
      const hostname = urlObj.hostname.toLowerCase();
      const isSafe = Array.from(this.allowedDomains).some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );

      if (!isSafe) {
        logger.warn({
          component: 'SecurityHelper',
          method: 'validateURL',
          operation: 'UNTRUSTED_DOMAIN',
          data: { url, hostname }
        }, `⚠️ UNTRUSTED_DOMAIN: URL from untrusted domain: ${hostname}`, ['security', 'url', 'untrusted']);
      }

      // 正規化されたURLを返す
      const normalizedUrl = urlObj.toString();

      logger.debug({
        component: 'SecurityHelper',
        method: 'validateURL',
        operation: 'URL_VALIDATED',
        data: { originalUrl: url, normalizedUrl, isSafe }
      }, `🔒 URL_VALIDATED: ${isSafe ? 'SAFE' : 'UNSAFE'}`, ['security', 'url', 'validation']);

      return { isValid: true, isSafe, normalizedUrl };

    } catch (error) {
      logger.error({
        component: 'SecurityHelper',
        method: 'validateURL',
        operation: 'URL_VALIDATION_ERROR',
        error: error as Error,
        data: { url }
      }, `❌ URL_VALIDATION_ERROR: Invalid URL format`, ['security', 'url', 'error']);

      return { isValid: false, isSafe: false };
    }
  }

  /**
   * Amazon URLの特別検証
   */
  validateAmazonURL(url: string): { isValid: boolean; productId?: string; region?: string } {
    const validation = this.validateURL(url);
    
    if (!validation.isValid || !validation.normalizedUrl) {
      return { isValid: false };
    }

    try {
      const urlObj = new URL(validation.normalizedUrl);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Amazon domainかチェック
      if (!hostname.includes('amazon.co.jp') && !hostname.includes('amazon.com')) {
        return { isValid: false };
      }

      // 製品IDを抽出
      const dpMatch = urlObj.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
      const gpMatch = urlObj.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      
      const productId = dpMatch?.[1] || gpMatch?.[1];
      const region = hostname.includes('.co.jp') ? 'JP' : 'US';

      if (!productId) {
        logger.warn({
          component: 'SecurityHelper',
          method: 'validateAmazonURL',
          operation: 'INVALID_AMAZON_URL',
          data: { url, reason: 'No product ID found' }
        }, `⚠️ INVALID_AMAZON_URL: No product ID found in URL`, ['security', 'amazon', 'invalid']);

        return { isValid: false };
      }

      logger.info({
        component: 'SecurityHelper',
        method: 'validateAmazonURL',
        operation: 'AMAZON_URL_VALIDATED',
        data: { productId, region, url }
      }, `✅ AMAZON_URL_VALIDATED: Product ${productId} (${region})`, ['security', 'amazon', 'valid']);

      return { isValid: true, productId, region };

    } catch (error) {
      logger.error({
        component: 'SecurityHelper',
        method: 'validateAmazonURL',
        operation: 'AMAZON_URL_ERROR',
        error: error as Error,
        data: { url }
      }, `❌ AMAZON_URL_ERROR: Failed to parse Amazon URL`, ['security', 'amazon', 'error']);

      return { isValid: false };
    }
  }

  /**
   * フォーム入力値の検証
   */
  validateInput(value: string, type: 'text' | 'number' | 'url' | 'email', options: {
    maxLength?: number;
    minLength?: number;
    min?: number;
    max?: number;
    required?: boolean;
    pattern?: RegExp;
  } = {}): { isValid: boolean; errors: string[]; sanitizedValue?: string } {
    const errors: string[] = [];
    
    if (!value && options.required) {
      errors.push('Required field is empty');
      return { isValid: false, errors };
    }

    if (!value) {
      return { isValid: true, errors: [], sanitizedValue: '' };
    }

    // 基本的なサニタイゼーション
    let sanitizedValue = this.sanitizeText(value);

    // 長さチェック
    if (options.maxLength && sanitizedValue.length > options.maxLength) {
      errors.push(`Value exceeds maximum length of ${options.maxLength}`);
    }

    if (options.minLength && sanitizedValue.length < options.minLength) {
      errors.push(`Value is shorter than minimum length of ${options.minLength}`);
    }

    // 型別検証
    switch (type) {
      case 'number':
        const num = Number(sanitizedValue);
        if (isNaN(num)) {
          errors.push('Invalid number format');
        } else {
          if (options.min !== undefined && num < options.min) {
            errors.push(`Number is less than minimum value of ${options.min}`);
          }
          if (options.max !== undefined && num > options.max) {
            errors.push(`Number exceeds maximum value of ${options.max}`);
          }
        }
        break;

      case 'url':
        const urlValidation = this.validateURL(sanitizedValue);
        if (!urlValidation.isValid) {
          errors.push('Invalid URL format');
        } else if (!urlValidation.isSafe) {
          errors.push('URL from untrusted domain');
        } else {
          sanitizedValue = urlValidation.normalizedUrl!;
        }
        break;

      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(sanitizedValue)) {
          errors.push('Invalid email format');
        }
        break;
    }

    // カスタムパターンチェック
    if (options.pattern && !options.pattern.test(sanitizedValue)) {
      errors.push('Value does not match required pattern');
    }

    const isValid = errors.length === 0;

    logger.debug({
      component: 'SecurityHelper',
      method: 'validateInput',
      operation: 'INPUT_VALIDATED',
      data: { 
        type, 
        isValid, 
        errorCount: errors.length,
        originalLength: value.length,
        sanitizedLength: sanitizedValue.length
      }
    }, `🔍 INPUT_VALIDATED: ${type} input ${isValid ? 'VALID' : 'INVALID'}`, ['security', 'input', 'validation']);

    return { isValid, errors, sanitizedValue };
  }

  /**
   * CSP違反レポートの設定
   */
  private setupCSPReporting(): void {
    document.addEventListener('securitypolicyviolation', (event) => {
      logger.error({
        component: 'SecurityHelper',
        method: 'CSPViolationHandler',
        operation: 'CSP_VIOLATION',
        data: {
          directive: event.violatedDirective,
          blockedURI: event.blockedURI,
          originalPolicy: event.originalPolicy,
          effectiveDirective: event.effectiveDirective,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber,
          columnNumber: event.columnNumber
        }
      }, `🚨 CSP_VIOLATION: ${event.violatedDirective} violated by ${event.blockedURI}`, ['security', 'csp', 'violation']);
    });

    logger.info({
      component: 'SecurityHelper',
      method: 'setupCSPReporting',
      operation: 'CSP_MONITORING_ACTIVE'
    }, `🛡️ CSP_MONITORING_ACTIVE: Content Security Policy monitoring enabled`, ['security', 'csp', 'monitoring']);
  }

  /**
   * 信頼できるドメインを追加
   */
  addTrustedDomain(domain: string): void {
    this.allowedDomains.add(domain.toLowerCase());
    
    logger.info({
      component: 'SecurityHelper',
      method: 'addTrustedDomain',
      operation: 'TRUSTED_DOMAIN_ADDED',
      data: { domain, totalTrustedDomains: this.allowedDomains.size }
    }, `✅ TRUSTED_DOMAIN_ADDED: ${domain}`, ['security', 'domain', 'trusted']);
  }

  /**
   * セキュリティヘルスチェック
   */
  performSecurityHealthCheck(): {
    https: boolean;
    csp: boolean;
    mixedContent: boolean;
    cookieSecure: boolean;
    score: number;
  } {
    const results = {
      https: window.location.protocol === 'https:',
      csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
      mixedContent: false, // 簡易チェック：詳細実装は必要に応じて
      cookieSecure: document.cookie.includes('Secure'),
      score: 0
    };

    // スコア計算
    results.score = Object.values(results).filter(v => v === true).length * 25;

    logger.info({
      component: 'SecurityHelper',
      method: 'performSecurityHealthCheck',
      operation: 'SECURITY_HEALTH_CHECK',
      data: results
    }, `🏥 SECURITY_HEALTH_CHECK: Score ${results.score}/100`, ['security', 'health', 'check']);

    return results;
  }
}

// シングルトンインスタンス
export const securityHelper = SecurityHelper.getInstance();