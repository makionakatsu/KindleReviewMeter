/**
 * ログレベル制御ユーティリティ
 * 開発環境と本番環境でログ出力を制御
 */
class Logger {
    constructor() {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // 環境に応じたデフォルト設定
        this.config = {
            level: process.env.NODE_ENV === 'development' ? 'debug' : 'error',
            enabled: true,
        };
    }
    /**
     * ログレベル設定
     */
    setLevel(level) {
        this.config.level = level;
    }
    /**
     * ログ有効/無効設定
     */
    setEnabled(enabled) {
        this.config.enabled = enabled;
    }
    /**
     * レベル判定
     */
    shouldLog(level) {
        if (!this.config.enabled)
            return false;
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.config.level);
        const targetLevelIndex = levels.indexOf(level);
        return targetLevelIndex >= currentLevelIndex;
    }
    /**
     * デバッグログ（開発環境のみ）
     */
    debug(message, data) {
        if (this.shouldLog('debug')) {
            console.log(`🐛 [DEBUG] ${message}`, data || '');
        }
    }
    /**
     * 情報ログ
     */
    info(message, data) {
        if (this.shouldLog('info')) {
            console.info(`ℹ️ [INFO] ${message}`, data || '');
        }
    }
    /**
     * 警告ログ
     */
    warn(message, data) {
        if (this.shouldLog('warn')) {
            console.warn(`⚠️ [WARN] ${message}`, data || '');
        }
    }
    /**
     * エラーログ
     */
    error(message, error) {
        if (this.shouldLog('error')) {
            console.error(`❌ [ERROR] ${message}`, error || '');
        }
    }
    /**
     * パフォーマンス測定開始
     */
    time(label) {
        if (this.shouldLog('debug')) {
            console.time(`⏱️ [PERF] ${label}`);
        }
    }
    /**
     * パフォーマンス測定終了
     */
    timeEnd(label) {
        if (this.shouldLog('debug')) {
            console.timeEnd(`⏱️ [PERF] ${label}`);
        }
    }
}
export const logger = new Logger();
//# sourceMappingURL=logger.js.map