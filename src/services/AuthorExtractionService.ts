/**
 * 著者名抽出サービス
 * 
 * 【責任範囲】
 * - Amazon書籍ページHTMLから著者名を高精度で抽出
 * - 4段階のフォールバック戦略による堅牢な抽出システム
 * - 抽出結果の信頼度評価とメソッド判別
 * - デバッグ情報の詳細記録と失敗時の診断機能
 * - 著者名の正規化とバリデーション
 * 
 * 【抽出戦略（優先度順）】
 * 1. Tier 1 - 構造化データ抽出 (信頼度95%)：JSON-LD、Microdata形式の構造化データから抽出
 * 2. Tier 2 - セマンティックHTML抽出 (信頼度80%)：author、bylineクラス等のセマンティックな要素から抽出  
 * 3. Tier 3 - テキストパターンマッチング (信頼度60%)：正規表現による日本語・英語パターンマッチング
 * 4. Tier 4 - DOM構造解析 (信頼度40%)：HTML構造の文脈分析による抽出
 * 
 * 【技術特徴】
 * - 多言語対応：日本語・英語著者名の適切な処理
 * - ノイズ除去：Follow、商品情報等の無関係テキストを排除
 * - スコアリング：複数候補から最適な著者名を選択
 * - エラー耐性：パース失敗時の詳細診断とロギング
 */

import { 
  AuthorExtractionResult, 
  AuthorExtractionMethod, 
  AuthorExtractionDebug 
} from '../types/index.js';
import { logger } from '../utils/AILogger.js';

export class AuthorExtractionService {
  private readonly DEBUG_MODE: boolean;

  constructor(debugMode: boolean = false) {
    this.DEBUG_MODE = debugMode;
  }

  /**
   * メイン抽出メソッド
   */
  async extractAuthor(html: string, url: string): Promise<AuthorExtractionResult> {
    const correlationId = logger.startOperation('AuthorExtraction', 'extractAuthor', 'FULL_EXTRACTION', { 
      url, 
      htmlLength: html.length 
    });
    const startTime = performance.now();
    const debug: AuthorExtractionDebug = {
      patterns: [],
      htmlSections: [],
      processingTime: 0,
    };

    try {
      // Tier 1: 構造化データの抽出
      logger.trace('AuthorExtraction', 'extractAuthor', 'TIER1_START', { tier: 1, method: 'STRUCTURED_DATA' });
      let result = await this.extractFromStructuredData(html, debug);
      if (result.author) {
        logger.info({
          component: 'AuthorExtraction',
          method: 'extractAuthor', 
          operation: 'TIER1_SUCCESS',
          data: { author: result.author, confidence: 0.95 }
        }, `✅ TIER1_SUCCESS: 構造化データで著者名取得: ${result.author}`, ['tier1', 'success', 'structured-data']);
        
        const finalResult = {
          ...result,
          method: AuthorExtractionMethod.STRUCTURED_DATA,
          confidence: 0.95,
          debug: this.finalizeDebug(debug, startTime)
        };
        logger.endOperation(correlationId, true, performance.now() - startTime, { author: result.author });
        return finalResult;
      }

      // Tier 2: セマンティックHTMLの抽出
      result = await this.extractFromSemanticHTML(html, debug);
      if (result.author) {
        console.log('✅ Tier 2 (セマンティックHTML) で著者名取得:', result.author);
        return {
          ...result,
          method: AuthorExtractionMethod.SEMANTIC_HTML,
          confidence: 0.8,
          debug: this.finalizeDebug(debug, startTime)
        };
      }

      // Tier 3: テキストパターンマッチング
      result = await this.extractFromTextPatterns(html, debug);
      if (result.author) {
        console.log('✅ Tier 3 (テキストパターン) で著者名取得:', result.author);
        return {
          ...result,
          method: AuthorExtractionMethod.TEXT_PATTERNS,
          confidence: 0.6,
          debug: this.finalizeDebug(debug, startTime)
        };
      }

      // Tier 4: DOM構造解析
      result = await this.extractFromDOMAnalysis(html, debug);
      if (result.author) {
        console.log('✅ Tier 4 (DOM解析) で著者名取得:', result.author);
        return {
          ...result,
          method: AuthorExtractionMethod.DOM_ANALYSIS,
          confidence: 0.4,
          debug: this.finalizeDebug(debug, startTime)
        };
      }

      // 全ての手法で失敗
      logger.error({
        component: 'AuthorExtraction',
        method: 'extractAuthor',
        operation: 'ALL_TIERS_FAILED',
        data: { 
          url, 
          htmlLength: html.length,
          patternsAttempted: debug.patterns.length,
          debugInfo: debug 
        }
      }, '❌ ALL_TIERS_FAILED: 全ての手法で著者名取得に失敗', ['extraction', 'failure', 'all-tiers']);
      
      await this.logExtractionFailure(html, url, debug);
      
      const failureResult = {
        author: null,
        confidence: 0,
        method: AuthorExtractionMethod.STRUCTURED_DATA,
        debug: this.finalizeDebug(debug, startTime),
      };
      
      logger.endOperation(correlationId, false, performance.now() - startTime, failureResult);
      return failureResult;

    } catch (error) {
      logger.fatal({
        component: 'AuthorExtraction',
        method: 'extractAuthor',
        operation: 'EXTRACTION_EXCEPTION',
        error: error as Error,
        data: { url, htmlLength: html.length }
      }, `💥 EXTRACTION_EXCEPTION: 著者名抽出で予期しないエラー`, ['extraction', 'exception', 'fatal']);
      
      const errorResult = {
        author: null,
        confidence: 0,
        method: AuthorExtractionMethod.STRUCTURED_DATA,
        debug: this.finalizeDebug(debug, startTime),
      };
      
      logger.endOperation(correlationId, false, performance.now() - startTime, errorResult);
      return errorResult;
    }
  }

  /**
   * Tier 1: 構造化データからの抽出
   */
  private async extractFromStructuredData(html: string, debug: AuthorExtractionDebug): Promise<AuthorExtractionResult> {
    logger.debug({
      component: 'AuthorExtraction',
      method: 'extractFromStructuredData',
      operation: 'TIER1_ANALYSIS_START',
      data: { htmlLength: html.length }
    }, '🔍 TIER1_ANALYSIS: 構造化データ解析開始', ['tier1', 'structured-data', 'analysis']);

    // JSON-LD抽出パターン
    const jsonLdPatterns = [
      /"@type"\s*:\s*"Person"[^}]*?"name"\s*:\s*"([^"]+?)"/gi,
      /"author"[^}]*?"name"\s*:\s*"([^"]+?)"/gi,
      /"author"\s*:\s*{\s*"@type"\s*:\s*"Person"[^}]*?"name"\s*:\s*"([^"]+?)"/gi,
      /"authors?"[^[]*?\[\s*{\s*"@type"\s*:\s*"Person"[^}]*?"name"\s*:\s*"([^"]+?)"/gi,
      /"@type"\s*:\s*"Book"[^}]*?"author"[^}]*?"name"\s*:\s*"([^"]+?)"/gi,
    ];

    for (const pattern of jsonLdPatterns) {
      const matches = [...html.matchAll(pattern)];
      const patternInfo: { pattern: string; matches: string[]; selected?: string } = { pattern: pattern.toString(), matches: [] };
      
      for (const match of matches) {
        if (!match[1]) continue;
        const candidate = this.cleanAuthorName(match[1]);
        patternInfo.matches.push(candidate);
        
        if (this.validateAuthorName(candidate)) {
          patternInfo.selected = candidate;
          debug.patterns.push(patternInfo);
          
          logger.info({
            component: 'AuthorExtraction',
            method: 'extractFromStructuredData',
            operation: 'JSON_LD_SUCCESS',
            data: { 
              candidate, 
              pattern: pattern.toString().substring(0, 50) + '...',
              confidence: 0.95 
            }
          }, `✅ JSON_LD_SUCCESS: JSON-LD から著者名抽出: ${candidate}`, ['tier1', 'json-ld', 'success']);
          
          return { 
            author: candidate, 
            confidence: 0.95, 
            method: AuthorExtractionMethod.STRUCTURED_DATA,
            debug: this.finalizeDebug(debug, Date.now())
          };
        }
      }
      
      if (patternInfo.matches.length > 0) {
        debug.patterns.push(patternInfo);
      }
    }

    // Microdata抽出パターン
    const microdataPatterns = [
      /itemprop="author"[^>]*>([^<]+)/gi,
      /itemprop="name"[^>]*>([^<]+)/gi,
      /itemtype="[^"]*Person"[^>]*>[^<]*<[^>]*itemprop="name"[^>]*>([^<]+)/gi,
    ];

    for (const pattern of microdataPatterns) {
      const matches = [...html.matchAll(pattern)];
      const patternInfo: { pattern: string; matches: string[]; selected?: string } = { pattern: pattern.toString(), matches: [] };
      
      for (const match of matches) {
        if (!match[1]) continue;
        const candidate = this.cleanAuthorName(match[1]);
        patternInfo.matches.push(candidate);
        
        if (this.validateAuthorName(candidate)) {
          patternInfo.selected = candidate;
          debug.patterns.push(patternInfo);
          if (this.DEBUG_MODE) console.log('Microdata から著者名抽出:', candidate);
          return { 
            author: candidate, 
            confidence: 0.95, 
            method: AuthorExtractionMethod.STRUCTURED_DATA,
            debug: this.finalizeDebug(debug, Date.now())
          };
        }
      }
      
      if (patternInfo.matches.length > 0) {
        debug.patterns.push(patternInfo);
      }
    }

    return { 
      author: null, 
      confidence: 0, 
      method: AuthorExtractionMethod.STRUCTURED_DATA,
      debug: this.finalizeDebug(debug, Date.now())
    };
  }

  /**
   * Tier 2: セマンティックHTMLからの抽出
   */
  private async extractFromSemanticHTML(html: string, debug: AuthorExtractionDebug): Promise<AuthorExtractionResult> {
    if (this.DEBUG_MODE) console.log('🔍 Tier 2: セマンティックHTML解析');

    const semanticPatterns = [
      // author/byline系のクラス・ID
      /<[^>]*(?:class|id)="[^"]*author[^"]*"[^>]*>(?:<[^>]*>)*([^<]+?)(?:<\/[^>]*>)*<\/[^>]+>/gi,
      /<[^>]*(?:class|id)="[^"]*byline[^"]*"[^>]*>(?:<[^>]*>)*([^<]+?)(?:<\/[^>]*>)*<\/[^>]+>/gi,
      /<[^>]*(?:class|id)="[^"]*contributor[^"]*"[^>]*>(?:<[^>]*>)*([^<]+?)(?:<\/[^>]*>)*<\/[^>]+>/gi,
      
      // data属性ベース
      /<[^>]*data-[^=]*author[^=]*="[^"]*"[^>]*>([^<]+?)<\/[^>]+>/gi,
      /<[^>]*data-testid="[^"]*author[^"]*"[^>]*>([^<]+?)<\/[^>]+>/gi,
      
      // aria属性ベース
      /<[^>]*aria-label="[^"]*author[^"]*"[^>]*>([^<]+?)<\/[^>]+>/gi,
      /<[^>]*role="[^"]*author[^"]*"[^>]*>([^<]+?)<\/[^>]+>/gi,
      
      // 著者専用タグ（HTML5）
      /<address[^>]*>([^<]+?)<\/address>/gi,
      
      // link要素のauthor
      /<link[^>]*rel="author"[^>]*title="([^"]+?)"/gi,
    ];

    for (const pattern of semanticPatterns) {
      const matches = [...html.matchAll(pattern)];
      const patternInfo: { pattern: string; matches: string[]; selected?: string } = { pattern: pattern.toString(), matches: [] };
      
      for (const match of matches) {
        if (!match[1]) continue;
        const candidate = this.cleanAuthorName(match[1]);
        patternInfo.matches.push(candidate);
        
        if (this.validateAuthorName(candidate)) {
          patternInfo.selected = candidate;
          debug.patterns.push(patternInfo);
          if (this.DEBUG_MODE) console.log('セマンティックHTML から著者名抽出:', candidate);
          return { 
            author: candidate, 
            confidence: 0.95, 
            method: AuthorExtractionMethod.STRUCTURED_DATA,
            debug: this.finalizeDebug(debug, Date.now())
          };
        }
      }
      
      if (patternInfo.matches.length > 0) {
        debug.patterns.push(patternInfo);
      }
    }

    return { 
      author: null, 
      confidence: 0, 
      method: AuthorExtractionMethod.SEMANTIC_HTML,
      debug: this.finalizeDebug(debug, Date.now())
    };
  }

  /**
   * Tier 3: テキストパターンマッチング
   */
  private async extractFromTextPatterns(html: string, debug: AuthorExtractionDebug): Promise<AuthorExtractionResult> {
    if (this.DEBUG_MODE) console.log('🔍 Tier 3: テキストパターン解析');

    const textPatterns = [
      // 日本語パターン（優先度高）
      /著者[：:\s]*([あ-んア-ンー\u4e00-\u9faf\s]{2,30}?)(?:\s*[（(]|<|$)/gi,
      /作者[：:\s]*([あ-んア-ンー\u4e00-\u9faf\s]{2,30}?)(?:\s*[（(]|<|$)/gi,
      /([あ-んア-ンー\u4e00-\u9faf]{2,}[あ-んア-ンー\u4e00-\u9faf\s]*?)\s*(?:著|\(著\)|Author)/gi,
      
      // 英語パターン
      /By:?\s+([A-Z][a-zA-Z\s.'-]{1,40}?)(?:\s*[,(]|<|$)/gi,
      /Author:?\s+([A-Z][a-zA-Z\s.'-]{1,40}?)(?:\s*[,(]|<|$)/gi,
      /Written by\s+([A-Z][a-zA-Z\s.'-]{1,40}?)(?:\s*[,(]|<|$)/gi,
      
      // byline内のパターン
      /<[^>]*(?:byline|author)[^>]*>.*?([A-Z][a-zA-Z\s.'-]{1,40}?)(?:\s*Follow|\s*フォロー|<\/|$)/gi,
      /<[^>]*(?:byline|author)[^>]*>.*?([あ-んア-ンー\u4e00-\u9faf]{2,}[あ-んア-ンー\u4e00-\u9faf\s]*?)(?:\s*Follow|\s*フォロー|<\/|$)/gi,
      
      // aタグ内（Follow除外）
      /<a[^>]*>\s*([A-Z][a-zA-Z\s.'-]{1,40}?)\s*<\/a>(?!\s*Follow)/gi,
      /<a[^>]*>\s*([あ-んア-ンー\u4e00-\u9faf]{2,}[あ-んア-ンー\u4e00-\u9faf\s]*?)\s*<\/a>(?!\s*Follow)/gi,
      
      // 複数著者対応
      /Authors?[：:\s]*([A-Z][a-zA-Z\s.'-]+(?:,\s*[A-Z][a-zA-Z\s.'-]+)*?)(?:\s*[,(]|<|$)/gi,
      /著者[：:\s]*([あ-んア-ンー\u4e00-\u9faf\s]+(?:、\s*[あ-んア-ンー\u4e00-\u9faf\s]+)*?)(?:\s*[（(]|<|$)/gi,
    ];

    let bestCandidate = null;
    let bestScore = 0;

    for (const pattern of textPatterns) {
      const matches = [...html.matchAll(pattern)];
      const patternInfo: { pattern: string; matches: string[]; selected?: string } = { pattern: pattern.toString(), matches: [] };
      
      for (const match of matches) {
        if (!match[1]) continue;
        const candidate = this.cleanAuthorName(match[1]);
        patternInfo.matches.push(candidate);
        
        if (this.validateAuthorName(candidate)) {
          const score = this.scoreAuthorName(candidate);
          if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
            patternInfo.selected = candidate;
          }
        }
      }
      
      if (patternInfo.matches.length > 0) {
        debug.patterns.push(patternInfo);
      }
    }

    if (bestCandidate) {
      if (this.DEBUG_MODE) console.log('テキストパターン から著者名抽出:', bestCandidate, 'スコア:', bestScore);
      return { 
        author: bestCandidate, 
        confidence: 0.6, 
        method: AuthorExtractionMethod.TEXT_PATTERNS,
        debug: this.finalizeDebug(debug, Date.now())
      };
    }

    return { 
      author: null, 
      confidence: 0, 
      method: AuthorExtractionMethod.TEXT_PATTERNS,
      debug: this.finalizeDebug(debug, Date.now())
    };
  }

  /**
   * Tier 4: DOM構造解析
   */
  private async extractFromDOMAnalysis(html: string, debug: AuthorExtractionDebug): Promise<AuthorExtractionResult> {
    if (this.DEBUG_MODE) console.log('🔍 Tier 4: DOM構造解析');

    const structuralPatterns = [
      // タイトル近辺の構造解析
      /<h1[^>]*>.*?<\/h1>[\s\S]{0,500}?([A-Z][a-zA-Z\s.'-]{2,40}?)(?:<|\(|$)/gi,
      /<h1[^>]*>.*?<\/h1>[\s\S]{0,500}?([あ-んア-ンー\u4e00-\u9faf]{2,}[あ-んア-ンー\u4e00-\u9faf\s]*?)(?:<|\(|$)/gi,
      
      // テーブル構造での著者情報
      /<t[rd][^>]*>.*?(?:著者|Author|By)[^<]*<\/t[rd]>[\s]*<t[rd][^>]*>([^<]+?)<\/t[rd]>/gi,
      
      // リスト内の著者情報
      /<li[^>]*>.*?(?:著者|Author|By)[^<]*([A-Z][a-zA-Z\s.'-]{2,40}?)<\/li>/gi,
      /<li[^>]*>.*?(?:著者|Author|By)[^<]*([あ-んア-ンー\u4e00-\u9faf]{2,}[あ-んア-ンー\u4e00-\u9faf\s]*?)<\/li>/gi,
    ];

    for (const pattern of structuralPatterns) {
      const matches = [...html.matchAll(pattern)];
      const patternInfo: { pattern: string; matches: string[]; selected?: string } = { pattern: pattern.toString(), matches: [] };
      
      for (const match of matches) {
        if (!match[1]) continue;
        const candidate = this.cleanAuthorName(match[1]);
        patternInfo.matches.push(candidate);
        
        if (this.validateAuthorName(candidate)) {
          patternInfo.selected = candidate;
          debug.patterns.push(patternInfo);
          if (this.DEBUG_MODE) console.log('DOM構造解析 から著者名抽出:', candidate);
          return { 
            author: candidate, 
            confidence: 0.95, 
            method: AuthorExtractionMethod.STRUCTURED_DATA,
            debug: this.finalizeDebug(debug, Date.now())
          };
        }
      }
      
      if (patternInfo.matches.length > 0) {
        debug.patterns.push(patternInfo);
      }
    }

    return { 
      author: null, 
      confidence: 0, 
      method: AuthorExtractionMethod.DOM_ANALYSIS,
      debug: this.finalizeDebug(debug, Date.now())
    };
  }

  /**
   * 著者名のクリーニング
   */
  private cleanAuthorName(rawName: string): string {
    if (!rawName) return '';

    return rawName
      .replace(/\s*\(著\)/g, '')
      .replace(/\s*\(Author\)/g, '')
      .replace(/\s*著$/g, '')
      .replace(/\s*Author$/g, '')
      .replace(/Follow/gi, '')
      .replace(/フォロー/g, '')
      .replace(/\s*\([^)]*\)\s*/g, ' ') // 括弧内を削除
      .replace(/[""''""]/g, '') // 引用符を削除
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 著者名の検証
   */
  private validateAuthorName(name: string): boolean {
    if (!name || name.length < 2 || name.length > 50) return false;

    // 無効な用語をチェック
    const invalidTerms = [
      'follow', 'more', 'see', 'clothing', 'store', 'shop', 'brand',
      'kindle', 'amazon', 'paperback', 'hardcover', 'format',
      'page', 'pages', 'price', 'buy', 'purchase', 'cart', 'wishlist',
      'review', 'reviews', 'customer', 'rating', 'star', 'stars',
      'visit', 'website', 'profile', 'biography', 'bio', 'more info'
    ];

    const lowerName = name.toLowerCase();
    if (invalidTerms.some(term => lowerName.includes(term))) return false;

    // 数字のみや記号のみを除外
    if (/^\d+$/.test(name) || /^[^\w\s]*$/.test(name)) return false;

    // 空白のみを除外
    if (name.trim() === '') return false;

    return true;
  }

  /**
   * 著者名のスコアリング（優先度付け）
   */
  private scoreAuthorName(name: string): number {
    let score = 0;

    // 日本語名を優先
    if (/[あ-んア-ンー\u4e00-\u9faf]/.test(name)) score += 10;

    // 適切な長さ
    if (name.length >= 3 && name.length <= 20) score += 5;

    // 大文字で始まる英語名
    if (/^[A-Z][a-z]/.test(name)) score += 3;

    // スペースを含む（フルネーム）
    if (/\s/.test(name) && name.split(' ').length <= 4) score += 2;

    return score;
  }

  /**
   * 抽出失敗時のログ出力
   */
  private async logExtractionFailure(html: string, url: string, debug: AuthorExtractionDebug): Promise<void> {
    console.log('=== 著者名抽出失敗の詳細分析 ===');

    // 関連するHTML構造を詳細表示
    const relevantSections = [
      html.match(/<[^>]*(?:byline|author|contributor)[^>]*>[\s\S]{0,300}/gi),
      html.match(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi),
      html.match(/<[^>]*(?:class|id)="[^"]*author[^"]*"[^>]*>[\s\S]{0,200}/gi),
    ].filter(Boolean).flat();

    debug.htmlSections = relevantSections.map(section => 
      section ? section.substring(0, 200) + '...' : ''
    );

    console.log('関連HTML構造:');
    debug.htmlSections.forEach((section, index) => {
      console.log(`構造 ${index + 1}:`, section);
    });

    // URL情報
    console.log('対象URL:', url);
    console.log('HTMLサイズ:', html.length, '文字');

    // パターンマッチング結果の要約
    console.log('試行したパターン数:', debug.patterns.length);
    console.log('検出された候補数:', debug.patterns.reduce((sum, p) => sum + p.matches.length, 0));
  }

  /**
   * デバッグ情報の最終化
   */
  private finalizeDebug(debug: AuthorExtractionDebug, startTime: number): AuthorExtractionDebug {
    debug.processingTime = performance.now() - startTime;
    return debug;
  }

  /**
   * 手動で著者名を設定
   */
  setManualAuthor(author: string): AuthorExtractionResult {
    const cleanedAuthor = this.cleanAuthorName(author);
    
    return {
      author: this.validateAuthorName(cleanedAuthor) ? cleanedAuthor : null,
      confidence: 1.0,
      method: AuthorExtractionMethod.MANUAL,
      debug: {
        patterns: [],
        htmlSections: [],
        processingTime: 0,
      },
    };
  }
}