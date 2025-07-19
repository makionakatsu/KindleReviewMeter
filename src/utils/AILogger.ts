/**
 * AI特化Logger
 * 
 * 【設計思想】
 * - AIが問題を瞬時に特定できる構造化ログ
 * - パターン認識しやすい一貫したフォーマット
 * - コンテキスト情報の最大化
 * - トレース可能性の完全保証
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogContext {
  component: string;
  method: string;
  operation: string;
  data?: any;
  error?: Error;
  duration?: number;
  stack?: string;
  url?: string;
  userAgent?: string;
  timestamp?: number;
}

export interface StructuredLog {
  level: LogLevel;
  timestamp: number;
  sessionId: string;
  sequence: number;
  context: LogContext;
  message: string;
  tags: string[];
  correlationId?: string;
}

export class AILogger {
  private static instance: AILogger;
  private sessionId: string;
  private sequence: number = 0;
  private logLevel: LogLevel = LogLevel.DEBUG;
  private logBuffer: StructuredLog[] = [];
  private correlationStack: string[] = [];

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.logSystemInfo();
  }

  static getInstance(): AILogger {
    if (!AILogger.instance) {
      AILogger.instance = new AILogger();
    }
    return AILogger.instance;
  }

  /**
   * AI分析用: デバッグログ - 詳細な実行トレース
   */
  debug(context: LogContext, message: string, tags: string[] = []): void {
    this.log(LogLevel.DEBUG, context, message, tags);
  }

  /**
   * AI分析用: 情報ログ - 正常フロー追跡
   */
  info(context: LogContext, message: string, tags: string[] = []): void {
    this.log(LogLevel.INFO, context, message, tags);
  }

  /**
   * AI分析用: 警告ログ - 異常検知
   */
  warn(context: LogContext, message: string, tags: string[] = []): void {
    this.log(LogLevel.WARN, context, message, tags);
  }

  /**
   * AI分析用: エラーログ - 障害分析
   */
  error(context: LogContext, message: string, tags: string[] = []): void {
    this.log(LogLevel.ERROR, context, message, tags);
  }

  /**
   * AI分析用: 致命的エラー - 即座対応必要
   */
  fatal(context: LogContext, message: string, tags: string[] = []): void {
    this.log(LogLevel.FATAL, context, message, tags);
  }

  /**
   * AI分析用: 操作開始 - パフォーマンス追跡開始
   */
  startOperation(component: string, method: string, operation: string, data?: any): string {
    const correlationId = this.generateCorrelationId();
    this.correlationStack.push(correlationId);
    
    this.info({
      component,
      method,
      operation: `START_${operation}`,
      data
    }, `🚀 OPERATION_START: ${operation}`, ['operation', 'start', 'performance']);
    
    return correlationId;
  }

  /**
   * AI分析用: 操作終了 - パフォーマンス追跡終了
   */
  endOperation(correlationId: string, success: boolean, duration: number, result?: any): void {
    const index = this.correlationStack.indexOf(correlationId);
    if (index > -1) {
      this.correlationStack.splice(index, 1);
    }

    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const emoji = success ? '✅' : '❌';
    
    this.log(level, {
      component: 'OPERATION',
      method: 'endOperation',
      operation: success ? 'SUCCESS' : 'FAILURE',
      duration,
      data: result
    }, `${emoji} OPERATION_END: ${success ? 'SUCCESS' : 'FAILURE'} (${duration}ms)`, 
    ['operation', 'end', 'performance', success ? 'success' : 'failure'], correlationId);
  }

  /**
   * AI分析用: フロートレース - データフロー追跡
   */
  trace(component: string, method: string, phase: string, data: any): void {
    this.debug({
      component,
      method,
      operation: `TRACE_${phase}`,
      data: this.sanitizeData(data)
    }, `🔍 TRACE: ${phase}`, ['trace', 'flow', phase.toLowerCase()]);
  }

  /**
   * AI分析用: 状態変更 - アプリケーション状態追跡
   */
  stateChange(component: string, from: string, to: string, trigger: string, data?: any): void {
    this.info({
      component,
      method: 'stateChange',
      operation: 'STATE_TRANSITION',
      data: { from, to, trigger, ...data }
    }, `🔄 STATE_CHANGE: ${from} → ${to} (${trigger})`, ['state', 'transition', from, to]);
  }

  /**
   * AI分析用: API呼び出し - 外部依存性追跡
   */
  apiCall(url: string, method: string, duration?: number, status?: number, error?: Error): void {
    const isSuccess = status && status >= 200 && status < 300;
    const level = error ? LogLevel.ERROR : (isSuccess ? LogLevel.INFO : LogLevel.WARN);
    const emoji = error ? '❌' : (isSuccess ? '✅' : '⚠️');

    this.log(level, {
      component: 'API',
      method: 'fetch',
      operation: method,
      url,
      duration,
      data: { status, method },
      error
    }, `${emoji} API_CALL: ${method} ${url} [${status || 'UNKNOWN'}] (${duration || 0}ms)`, 
    ['api', 'network', method.toLowerCase(), isSuccess ? 'success' : 'failure']);
  }

  /**
   * AI分析用: パフォーマンス測定
   */
  performance(component: string, operation: string, duration: number, metadata?: any): void {
    const level = duration > 1000 ? LogLevel.WARN : LogLevel.INFO;
    const emoji = duration > 1000 ? '🐌' : '⚡';
    
    this.log(level, {
      component,
      method: 'performance',
      operation,
      duration,
      data: metadata
    }, `${emoji} PERFORMANCE: ${operation} took ${duration}ms`, ['performance', 'timing']);
  }

  /**
   * AI分析用: ユーザーアクション追跡
   */
  userAction(action: string, element: string, data?: any): void {
    this.info({
      component: 'USER',
      method: 'interaction',
      operation: action,
      data: { element, ...data }
    }, `👤 USER_ACTION: ${action} on ${element}`, ['user', 'interaction', action]);
  }

  /**
   * AI分析用: 現在のログバッファをダンプ（デバッグ時）
   */
  dump(): StructuredLog[] {
    return [...this.logBuffer];
  }

  /**
   * AI分析用: 特定タグのログフィルタリング
   */
  getLogsByTags(tags: string[]): StructuredLog[] {
    return this.logBuffer.filter(log => 
      tags.some(tag => log.tags.includes(tag))
    );
  }

  /**
   * AI分析用: エラー関連ログの集約
   */
  getErrorContext(): StructuredLog[] {
    return this.logBuffer.filter(log => 
      log.level >= LogLevel.ERROR || log.tags.includes('error')
    );
  }

  private log(level: LogLevel, context: LogContext, message: string, tags: string[] = [], correlationId?: string): void {
    if (level < this.logLevel) return;

    const log: StructuredLog = {
      level,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      sequence: ++this.sequence,
      context: {
        ...context,
        timestamp: Date.now(),
        stack: level >= LogLevel.ERROR ? new Error().stack : undefined
      },
      message,
      tags: [...tags, LogLevel[level].toLowerCase()],
      correlationId: correlationId || this.correlationStack[this.correlationStack.length - 1]
    };

    this.logBuffer.push(log);
    
    // 循環バッファ（メモリ制限）
    if (this.logBuffer.length > 1000) {
      this.logBuffer.shift();
    }

    // AI読みやすい構造化出力
    this.outputStructuredLog(log);
  }

  private outputStructuredLog(log: StructuredLog): void {
    const timestamp = new Date(log.timestamp).toISOString();
    const level = LogLevel[log.level].padEnd(5);
    const component = log.context.component.padEnd(15);
    const method = log.context.method?.padEnd(20) || ''.padEnd(20);
    const correlation = log.correlationId ? ` [${log.correlationId.slice(-8)}]` : '';
    
    // AI解析用の構造化フォーマット
    const output = `${timestamp} ${level} ${component} ${method} ${log.message}${correlation}`;
    
    switch (log.level) {
      case LogLevel.DEBUG:
        console.debug(output, log.context.data ? { data: log.context.data } : '');
        break;
      case LogLevel.INFO:
        console.info(output, log.context.data ? { data: log.context.data } : '');
        break;
      case LogLevel.WARN:
        console.warn(output, log.context.data ? { data: log.context.data } : '');
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(output, { 
          data: log.context.data, 
          error: log.context.error?.message,
          stack: log.context.stack 
        });
        break;
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCorrelationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeData(data: any): any {
    if (!data) return data;
    
    // 機密情報の除去
    const sanitized = JSON.parse(JSON.stringify(data));
    if (typeof sanitized === 'object') {
      delete sanitized.password;
      delete sanitized.token;
      delete sanitized.apiKey;
    }
    return sanitized;
  }

  private logSystemInfo(): void {
    this.info({
      component: 'SYSTEM',
      method: 'init',
      operation: 'STARTUP',
      userAgent: navigator.userAgent,
      url: window.location.href,
      data: {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        language: navigator.language,
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine
      }
    }, '🌟 SYSTEM_STARTUP', ['system', 'startup', 'environment']);
  }
}

// AI解析用のグローバルエクスポート
export const logger = AILogger.getInstance();