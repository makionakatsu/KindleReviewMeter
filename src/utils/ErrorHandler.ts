/**
 * 統一エラーハンドリングシステム
 * 
 * アプリケーション全体のエラー管理と報告を行う
 */

import { AppError, ErrorCode, EventEmitter } from '../types/index.js';

export interface ErrorHandlerOptions {
  enableConsoleLogging?: boolean;
  enableUserNotification?: boolean;
  enableErrorReporting?: boolean;
  maxErrorHistory?: number;
}

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  timestamp?: number;
  [key: string]: any;
}

export class ErrorHandler {
  private options: Required<ErrorHandlerOptions>;
  private eventEmitter: EventEmitter;
  private errorHistory: AppError[] = [];
  private errorCounts: Map<string, number> = new Map();

  constructor(eventEmitter: EventEmitter, options: ErrorHandlerOptions = {}) {
    this.eventEmitter = eventEmitter;
    this.options = {
      enableConsoleLogging: true,
      enableUserNotification: true,
      enableErrorReporting: false,
      maxErrorHistory: 100,
      ...options,
    };

    this.setupGlobalErrorHandlers();
  }

  /**
   * グローバルエラーハンドラーを設定
   */
  private setupGlobalErrorHandlers(): void {
    // 未処理のエラーをキャッチ
    window.addEventListener('error', (event) => {
      this.handleError(
        this.createError(
          ErrorCode.UNKNOWN_ERROR,
          event.message,
          {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error?.stack,
          }
        )
      );
    });

    // 未処理のPromise rejectionをキャッチ
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(
        this.createError(
          ErrorCode.UNKNOWN_ERROR,
          `Unhandled Promise rejection: ${event.reason}`,
          {
            reason: event.reason,
            promise: event.promise,
          }
        )
      );
    });
  }

  /**
   * エラーを処理
   */
  public handleError(error: Error | AppError, context?: ErrorContext): void {
    const appError = this.normalizeError(error, context);
    
    // エラー履歴に追加
    this.addToHistory(appError);
    
    // エラー数をカウント
    this.incrementErrorCount(appError.code);

    // ログ出力
    if (this.options.enableConsoleLogging) {
      this.logError(appError);
    }

    // ユーザー通知
    if (this.options.enableUserNotification && !this.isRecurringError(appError.code)) {
      this.notifyUser(appError);
    }

    // エラー報告
    if (this.options.enableErrorReporting) {
      this.reportError(appError);
    }

    // イベント発行
    this.eventEmitter.emit('error:occurred', appError);
  }

  /**
   * エラーの正規化
   */
  private normalizeError(error: Error | AppError, context?: ErrorContext): AppError {
    if (this.isAppError(error)) {
      // 追加のコンテキストをマージ
      if (context) {
        error.context = { ...error.context, ...context };
      }
      return error;
    }

    // 通常のErrorをAppErrorに変換
    return this.createError(
      this.categorizeError(error),
      error.message,
      {
        stack: error.stack,
        name: error.name,
        ...context,
      }
    );
  }

  /**
   * AppErrorかどうかを判定
   */
  private isAppError(error: any): error is AppError {
    return error && typeof error === 'object' && 'code' in error && 'recoverable' in error;
  }

  /**
   * エラーをカテゴライズ
   */
  private categorizeError(error: Error): ErrorCode {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (name.includes('network') || message.includes('fetch') || message.includes('network')) {
      return ErrorCode.NETWORK_ERROR;
    }

    if (name.includes('validation') || message.includes('validation') || message.includes('invalid')) {
      return ErrorCode.VALIDATION_ERROR;
    }

    if (message.includes('storage') || message.includes('localstorage') || message.includes('quota')) {
      return ErrorCode.STORAGE_ERROR;
    }

    if (message.includes('extract') || message.includes('author') || message.includes('parse')) {
      return ErrorCode.EXTRACTION_ERROR;
    }

    if (message.includes('render') || message.includes('dom') || message.includes('element')) {
      return ErrorCode.RENDER_ERROR;
    }

    return ErrorCode.UNKNOWN_ERROR;
  }

  /**
   * AppErrorを作成
   */
  public createError(
    code: ErrorCode,
    message: string,
    context?: ErrorContext,
    recoverable: boolean = true
  ): AppError {
    const error = new Error(message) as AppError;
    error.name = 'AppError';
    error.code = code;
    error.context = {
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...context,
    };
    error.timestamp = Date.now();
    error.recoverable = recoverable;

    return error;
  }

  /**
   * エラー履歴に追加
   */
  private addToHistory(error: AppError): void {
    this.errorHistory.unshift(error);
    
    // 履歴サイズを制限
    if (this.errorHistory.length > this.options.maxErrorHistory) {
      this.errorHistory = this.errorHistory.slice(0, this.options.maxErrorHistory);
    }
  }

  /**
   * エラー数をカウント
   */
  private incrementErrorCount(code: string): void {
    const current = this.errorCounts.get(code) || 0;
    this.errorCounts.set(code, current + 1);
  }

  /**
   * 繰り返しエラーかどうかを判定
   */
  private isRecurringError(code: string): boolean {
    const count = this.errorCounts.get(code) || 0;
    return count > 3; // 3回以上同じエラーが発生した場合は繰り返しとみなす
  }

  /**
   * エラーをログ出力
   */
  private logError(error: AppError): void {
    const logLevel = this.getLogLevel(error);
    const logMessage = this.formatLogMessage(error);

    switch (logLevel) {
      case 'error':
        console.error(logMessage, error);
        break;
      case 'warn':
        console.warn(logMessage, error);
        break;
      default:
        console.log(logMessage, error);
    }
  }

  /**
   * ログレベルを決定
   */
  private getLogLevel(error: AppError): 'error' | 'warn' | 'info' {
    if (!error.recoverable) return 'error';
    if (error.code === ErrorCode.NETWORK_ERROR) return 'warn';
    if (error.code === ErrorCode.VALIDATION_ERROR) return 'info';
    return 'error';
  }

  /**
   * ログメッセージをフォーマット
   */
  private formatLogMessage(error: AppError): string {
    const timestamp = new Date(error.timestamp).toISOString();
    const context = error.context?.component ? ` [${error.context.component}]` : '';
    return `[${timestamp}] ${error.code}${context}: ${error.message}`;
  }

  /**
   * ユーザーに通知
   */
  private notifyUser(error: AppError): void {
    const userMessage = this.getUserFriendlyMessage(error);
    
    // 重要でないエラーはコンソール警告のみ
    if (error.code === ErrorCode.VALIDATION_ERROR) {
      console.warn(userMessage);
      return;
    }

    // 重要なエラーはアラートで通知
    if (!error.recoverable || error.code === ErrorCode.STORAGE_ERROR) {
      alert(`エラーが発生しました:\n${userMessage}`);
      return;
    }

    // その他のエラーは将来的にはtoast通知などで表示
    console.error(userMessage);
  }

  /**
   * ユーザー向けのメッセージを生成
   */
  private getUserFriendlyMessage(error: AppError): string {
    switch (error.code) {
      case ErrorCode.NETWORK_ERROR:
        return 'ネットワーク接続に問題があります。しばらく後にお試しください。';
      
      case ErrorCode.VALIDATION_ERROR:
        return '入力内容に問題があります。内容を確認してください。';
      
      case ErrorCode.STORAGE_ERROR:
        return 'データの保存に失敗しました。ブラウザの設定を確認してください。';
      
      case ErrorCode.EXTRACTION_ERROR:
        return '書籍情報の取得に失敗しました。URLを確認するか、手動で入力してください。';
      
      case ErrorCode.RENDER_ERROR:
        return '画面の表示に問題が発生しました。ページを更新してください。';
      
      default:
        return '予期しないエラーが発生しました。ページを更新してお試しください。';
    }
  }

  /**
   * エラーを報告（将来的な実装）
   */
  private reportError(error: AppError): void {
    // 将来的にはエラー報告サービスに送信
    console.log('エラー報告（未実装）:', error);
  }

  /**
   * エラー履歴を取得
   */
  public getErrorHistory(): AppError[] {
    return [...this.errorHistory];
  }

  /**
   * エラー統計を取得
   */
  public getErrorStats(): { code: string; count: number }[] {
    return Array.from(this.errorCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * エラー履歴をクリア
   */
  public clearHistory(): void {
    this.errorHistory = [];
    this.errorCounts.clear();
  }

  /**
   * エラーハンドラー設定を更新
   */
  public updateOptions(options: Partial<ErrorHandlerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 回復可能なエラーの自動回復を試行
   */
  public async attemptRecovery(error: AppError): Promise<boolean> {
    if (!error.recoverable) {
      return false;
    }

    try {
      switch (error.code) {
        case ErrorCode.STORAGE_ERROR:
          return this.recoverFromStorageError();
        
        case ErrorCode.NETWORK_ERROR:
          return this.recoverFromNetworkError();
        
        default:
          return false;
      }
    } catch (recoveryError) {
      console.error('回復処理でエラーが発生:', recoveryError);
      return false;
    }
  }

  /**
   * ストレージエラーからの回復
   */
  private recoverFromStorageError(): boolean {
    try {
      // キャッシュクリアを試行
      localStorage.clear();
      console.log('ローカルストレージをクリアしました');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ネットワークエラーからの回復
   */
  private recoverFromNetworkError(): boolean {
    // ネットワークエラーは通常、時間経過で自動回復
    console.log('ネットワークエラー: 時間をおいて再試行してください');
    return false;
  }

  /**
   * デバッグ情報を取得
   */
  public getDebugInfo(): Record<string, any> {
    return {
      options: this.options,
      errorHistoryCount: this.errorHistory.length,
      errorStats: this.getErrorStats(),
      recentErrors: this.errorHistory.slice(0, 5).map(error => ({
        code: error.code,
        message: error.message,
        timestamp: error.timestamp,
        recoverable: error.recoverable,
      })),
    };
  }
}