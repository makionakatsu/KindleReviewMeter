/**
 * ログレベル制御ユーティリティ
 * 開発環境と本番環境でログ出力を制御
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enabled: boolean;
}

class Logger {
  private config: LoggerConfig;

  constructor() {
    // 環境に応じたデフォルト設定
    this.config = {
      level: process.env.NODE_ENV === 'development' ? 'debug' : 'error',
      enabled: true,
    };
  }

  /**
   * ログレベル設定
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * ログ有効/無効設定
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * レベル判定
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const targetLevelIndex = levels.indexOf(level);
    
    return targetLevelIndex >= currentLevelIndex;
  }

  /**
   * デバッグログ（開発環境のみ）
   */
  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      console.log(`🐛 [DEBUG] ${message}`, data || '');
    }
  }

  /**
   * 情報ログ
   */
  info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      console.info(`ℹ️ [INFO] ${message}`, data || '');
    }
  }

  /**
   * 警告ログ
   */
  warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(`⚠️ [WARN] ${message}`, data || '');
    }
  }

  /**
   * エラーログ
   */
  error(message: string, error?: any): void {
    if (this.shouldLog('error')) {
      console.error(`❌ [ERROR] ${message}`, error || '');
    }
  }

  /**
   * パフォーマンス測定開始
   */
  time(label: string): void {
    if (this.shouldLog('debug')) {
      console.time(`⏱️ [PERF] ${label}`);
    }
  }

  /**
   * パフォーマンス測定終了
   */
  timeEnd(label: string): void {
    if (this.shouldLog('debug')) {
      console.timeEnd(`⏱️ [PERF] ${label}`);
    }
  }
}

export const logger = new Logger();