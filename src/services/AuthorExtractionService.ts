/**
 * 著者名抽出サービス
 * 
 * Amazon書籍ページから著者名を抽出する高度なエンジン
 * 4段階のフォールバック戦略を使用
 */

import { 
  AuthorExtractionResult, 
  AuthorExtractionMethod, 
  AuthorExtractionDebug 
} from '../types/index.js';

export class AuthorExtractionService {
  private readonly DEBUG_MODE: boolean;

  constructor(debugMode: boolean = false) {
    this.DEBUG_MODE = debugMode;
  }

  /**
   * メイン抽出メソッド
   */
  async extractAuthor(html: string, url: string): Promise<AuthorExtractionResult> {
    console.log('🔍 改良版著者名抽出エンジン開始');
    const startTime = performance.now();
    const debug: AuthorExtractionDebug = {
      patterns: [],
      htmlSections: [],
      processingTime: 0,
    };

    try {
      // Tier 1: 構造化データの抽出
      let result = await this.extractFromStructuredData(html, debug);
      if (result.author) {
        result.method = AuthorExtractionMethod.STRUCTURED_DATA;
        result.confidence = 0.95;
        result.debug = this.finalizeDebug(debug, startTime);
        console.log('✅ Tier 1 (構造化データ) で著者名取得:', result.author);
        return result;
      }

      // Tier 2: セマンティックHTMLの抽出
      result = await this.extractFromSemanticHTML(html, debug);
      if (result.author) {
        result.method = AuthorExtractionMethod.SEMANTIC_HTML;
        result.confidence = 0.8;
        result.debug = this.finalizeDebug(debug, startTime);
        console.log('✅ Tier 2 (セマンティックHTML) で著者名取得:', result.author);
        return result;
      }

      // Tier 3: テキストパターンマッチング
      result = await this.extractFromTextPatterns(html, debug);
      if (result.author) {
        result.method = AuthorExtractionMethod.TEXT_PATTERNS;
        result.confidence = 0.6;
        result.debug = this.finalizeDebug(debug, startTime);
        console.log('✅ Tier 3 (テキストパターン) で著者名取得:', result.author);
        return result;
      }

      // Tier 4: DOM構造解析
      result = await this.extractFromDOMAnalysis(html, debug);
      if (result.author) {
        result.method = AuthorExtractionMethod.DOM_ANALYSIS;
        result.confidence = 0.4;
        result.debug = this.finalizeDebug(debug, startTime);
        console.log('✅ Tier 4 (DOM解析) で著者名取得:', result.author);
        return result;
      }

      // 全ての手法で失敗
      console.log('❌ 全ての手法で著者名取得に失敗');
      await this.logExtractionFailure(html, url, debug);
      
      return {
        author: null,
        confidence: 0,
        method: AuthorExtractionMethod.STRUCTURED_DATA,
        debug: this.finalizeDebug(debug, startTime),
      };

    } catch (error) {
      console.error('著者名抽出でエラーが発生:', error);
      return {
        author: null,
        confidence: 0,
        method: AuthorExtractionMethod.STRUCTURED_DATA,
        debug: this.finalizeDebug(debug, startTime),
      };
    }
  }

  /**
   * Tier 1: 構造化データからの抽出
   */
  private async extractFromStructuredData(html: string, debug: AuthorExtractionDebug): Promise<{ author: string | null }> {
    if (this.DEBUG_MODE) console.log('🔍 Tier 1: 構造化データ解析');

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
        const candidate = this.cleanAuthorName(match[1]);
        patternInfo.matches.push(candidate);
        
        if (this.validateAuthorName(candidate)) {
          patternInfo.selected = candidate;
          debug.patterns.push(patternInfo);
          if (this.DEBUG_MODE) console.log('JSON-LD から著者名抽出:', candidate);
          return { author: candidate };
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
        const candidate = this.cleanAuthorName(match[1]);
        patternInfo.matches.push(candidate);
        
        if (this.validateAuthorName(candidate)) {
          patternInfo.selected = candidate;
          debug.patterns.push(patternInfo);
          if (this.DEBUG_MODE) console.log('Microdata から著者名抽出:', candidate);
          return { author: candidate };
        }
      }
      
      if (patternInfo.matches.length > 0) {
        debug.patterns.push(patternInfo);
      }
    }

    return { author: null };
  }

  /**
   * Tier 2: セマンティックHTMLからの抽出
   */
  private async extractFromSemanticHTML(html: string, debug: AuthorExtractionDebug): Promise<{ author: string | null }> {
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
        const candidate = this.cleanAuthorName(match[1]);
        patternInfo.matches.push(candidate);
        
        if (this.validateAuthorName(candidate)) {
          patternInfo.selected = candidate;
          debug.patterns.push(patternInfo);
          if (this.DEBUG_MODE) console.log('セマンティックHTML から著者名抽出:', candidate);
          return { author: candidate };
        }
      }
      
      if (patternInfo.matches.length > 0) {
        debug.patterns.push(patternInfo);
      }
    }

    return { author: null };
  }

  /**
   * Tier 3: テキストパターンマッチング
   */
  private async extractFromTextPatterns(html: string, debug: AuthorExtractionDebug): Promise<{ author: string | null }> {
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
      return { author: bestCandidate };
    }

    return { author: null };
  }

  /**
   * Tier 4: DOM構造解析
   */
  private async extractFromDOMAnalysis(html: string, debug: AuthorExtractionDebug): Promise<{ author: string | null }> {
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
        const candidate = this.cleanAuthorName(match[1]);
        patternInfo.matches.push(candidate);
        
        if (this.validateAuthorName(candidate)) {
          patternInfo.selected = candidate;
          debug.patterns.push(patternInfo);
          if (this.DEBUG_MODE) console.log('DOM構造解析 から著者名抽出:', candidate);
          return { author: candidate };
        }
      }
      
      if (patternInfo.matches.length > 0) {
        debug.patterns.push(patternInfo);
      }
    }

    return { author: null };
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