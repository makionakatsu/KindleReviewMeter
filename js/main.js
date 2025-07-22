/**
 * メインアプリケーションエントリーポイント（設定ページ用）
 *
 * Amazon書籍レビュー数トラッカーの設定画面を初期化
 */
import { createStorageService } from './services/StorageService.js';
import { AmazonBookInfoService } from './services/BookInfoService.js';
import { AuthorExtractionService } from './services/AuthorExtractionService.js';
import { BookValidationService } from './services/ValidationService.js';
import { BookInfoForm } from './components/BookInfoForm.js';
import { ApplicationEventEmitter } from './utils/EventEmitter.js';
import { ErrorHandler } from './utils/ErrorHandler.js';
import { DOMHelperImpl } from './utils/DOMHelper.js';
import { DEFAULT_CONFIG, DEV_CONFIG } from './utils/constants.js';
/**
 * アプリケーションクラス
 */
class KindleReviewMeterApp {
    constructor() {
        Object.defineProperty(this, "context", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bookInfoForm", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "isInitialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        // アプリケーションコンテキストを初期化
        this.context = this.createApplicationContext();
        // エラーハンドリングをセットアップ
        this.setupErrorHandling();
        // 開発モードの設定
        if (DEV_CONFIG.DEBUG_MODE) {
            this.enableDebugMode();
        }
    }
    /**
     * アプリケーションコンテキストを作成
     */
    createApplicationContext() {
        // イベントエミッターを作成
        const eventEmitter = new ApplicationEventEmitter({
            maxHistorySize: 100,
            debugMode: DEV_CONFIG.DEBUG_MODE,
        });
        // DOM ヘルパーを作成
        const domHelper = new DOMHelperImpl(DEV_CONFIG.DEBUG_MODE);
        // ストレージサービスを作成
        const storage = createStorageService(true);
        // バリデーションサービスを作成
        const validationService = new BookValidationService(DEFAULT_CONFIG.validationRules);
        // 著者抽出サービスを作成
        const authorExtractionService = new AuthorExtractionService(DEV_CONFIG.DEBUG_MODE);
        // 書籍情報サービスを作成
        const bookInfoService = new AmazonBookInfoService({
            timeout: DEFAULT_CONFIG.timeout,
            maxRetries: DEFAULT_CONFIG.maxRetries,
            debugMode: DEV_CONFIG.DEBUG_MODE,
        });
        return {
            eventEmitter,
            domHelper,
            storage,
            validationService,
            bookInfoService,
            config: DEFAULT_CONFIG,
        };
    }
    /**
     * エラーハンドリングをセットアップ
     */
    setupErrorHandling() {
        const errorHandler = new ErrorHandler(this.context.eventEmitter, {
            enableConsoleLogging: true,
            enableUserNotification: true,
            enableErrorReporting: DEV_CONFIG.DEBUG_MODE,
            maxErrorHistory: 50,
        });
        // グローバルエラーイベントを監視
        this.context.eventEmitter.on('error:occurred', (event) => {
            console.error('Application error:', event.payload);
        });
        // パフォーマンス監視（開発モード）
        if (DEV_CONFIG.ENABLE_PERFORMANCE_MONITORING) {
            this.setupPerformanceMonitoring();
        }
    }
    /**
     * パフォーマンス監視をセットアップ
     */
    setupPerformanceMonitoring() {
        // ページロード時間を測定
        window.addEventListener('load', () => {
            const loadTime = performance.now();
            console.log(`📊 Page load time: ${loadTime.toFixed(2)}ms`);
            this.context.eventEmitter.emit('performance:page_load', {
                loadTime,
                timestamp: Date.now(),
            });
        });
        // メモリ使用量を定期的に監視
        setInterval(() => {
            if ('memory' in performance) {
                const memory = performance.memory;
                const usage = {
                    used: memory.usedJSHeapSize,
                    total: memory.totalJSHeapSize,
                    limit: memory.jsHeapSizeLimit,
                };
                console.log('📊 Memory usage:', usage);
                this.context.eventEmitter.emit('performance:memory_usage', usage);
            }
        }, 60000); // 1分ごと
    }
    /**
     * デバッグモードを有効化
     */
    enableDebugMode() {
        // グローバルにコンテキストを公開（デバッグ用）
        window.appContext = this.context;
        window.app = this;
        console.log('🔧 Debug mode enabled');
        console.log('Access app context via: window.appContext');
        console.log('Access app instance via: window.app');
        // デバッグ情報を定期的に出力
        setInterval(() => {
            const debugInfo = {
                eventEmitter: 'ApplicationEventEmitter initialized',
                storage: 'StorageService initialized',
                performance: 'Performance tracking enabled',
            };
            console.log('🔍 Debug info:', debugInfo);
        }, 30000); // 30秒ごと
    }
    /**
     * アプリケーションを初期化
     */
    async initialize() {
        if (this.isInitialized) {
            console.warn('Application is already initialized');
            return;
        }
        try {
            console.log('🚀 Initializing Kindle Review Meter App...');
            // DOM の準備を待つ
            await this.waitForDOM();
            // コンテナ要素を取得
            const container = document.getElementById('app');
            if (!container) {
                throw new Error('App container element not found');
            }
            // 書籍情報フォームを初期化
            this.bookInfoForm = new BookInfoForm(container, this.context, {
                autoSave: true,
                showPreview: true,
                allowManualEdit: true,
            });
            // フォームを初期化して表示
            await this.bookInfoForm.initialize();
            // グローバルイベントリスナーを設定
            this.setupGlobalEventListeners();
            // 初期化完了
            this.isInitialized = true;
            this.context.eventEmitter.emit('app:initialized', {
                timestamp: Date.now(),
                version: '2.0.0',
            });
            console.log('✅ Application initialized successfully');
        }
        catch (error) {
            console.error('❌ Application initialization failed:', error);
            this.showInitializationError(error);
            throw error;
        }
    }
    /**
     * DOM の準備を待つ
     */
    waitForDOM() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => resolve());
            }
            else {
                resolve();
            }
        });
    }
    /**
     * グローバルイベントリスナーを設定
     */
    setupGlobalEventListeners() {
        // ページ離脱前の確認
        window.addEventListener('beforeunload', (event) => {
            if (this.hasUnsavedChanges()) {
                event.preventDefault();
                event.returnValue = '保存されていない変更があります。ページを離れますか？';
            }
        });
        // キーボードショートカット
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });
        // オンライン/オフライン状態の監視
        window.addEventListener('online', () => {
            this.context.eventEmitter.emit('network:online');
            console.log('🌐 Network: Online');
        });
        window.addEventListener('offline', () => {
            this.context.eventEmitter.emit('network:offline');
            console.log('📴 Network: Offline');
        });
    }
    /**
     * キーボードショートカットを処理
     */
    handleKeyboardShortcuts(event) {
        // Ctrl+S で保存
        if (event.ctrlKey && event.key === 's') {
            event.preventDefault();
            if (this.bookInfoForm) {
                // フォーム送信をトリガー
                const form = document.getElementById('settingsForm');
                if (form) {
                    form.dispatchEvent(new Event('submit'));
                }
            }
        }
        // Ctrl+R でリフレッシュ（データ再取得）
        if (event.ctrlKey && event.key === 'r') {
            event.preventDefault();
            const fetchButton = document.getElementById('fetchAllBtn');
            if (fetchButton) {
                fetchButton.click();
            }
        }
        // F1 でヘルプ（将来の機能）
        if (event.key === 'F1') {
            event.preventDefault();
            this.showHelp();
        }
    }
    /**
     * 未保存の変更があるかチェック
     */
    hasUnsavedChanges() {
        // 実装：フォームの変更状態をチェック
        return false; // 暫定的にfalseを返す
    }
    /**
     * 初期化エラーを表示
     */
    showInitializationError(error) {
        const container = document.getElementById('app') || document.body;
        container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #e74c3c;">
        <h1>⚠️ アプリケーションの初期化に失敗しました</h1>
        <p>エラー: ${error.message}</p>
        <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 10px;">
          🔄 ページを再読み込み
        </button>
      </div>
    `;
    }
    /**
     * ヘルプを表示
     */
    showHelp() {
        alert(`
📚 Amazon書籍レビュー数トラッカー

【使い方】
1. Amazon書籍のURLを入力
2. 「自動取得」ボタンをクリック
3. 目標レビュー数を設定
4. 「設定を保存」をクリック
5. ビジュアル表示ページで進捗を確認

【キーボードショートカット】
- Ctrl+S: 設定を保存
- Ctrl+R: データを再取得
- F1: このヘルプを表示
    `);
    }
    /**
     * アプリケーションを破棄
     */
    async destroy() {
        if (!this.isInitialized) {
            return;
        }
        try {
            // コンポーネントを破棄
            if (this.bookInfoForm) {
                await this.bookInfoForm.destroy();
                this.bookInfoForm = null;
            }
            // イベントエミッターをクリーンアップ
            this.context.eventEmitter.destroy?.();
            // フラグをリセット
            this.isInitialized = false;
            console.log('🧹 Application destroyed');
        }
        catch (error) {
            console.error('Error during application destruction:', error);
        }
    }
    /**
     * 現在の状態を取得
     */
    getState() {
        return {
            isInitialized: this.isInitialized,
            hasBookInfoForm: !!this.bookInfoForm,
            storageKeys: [],
            eventStats: [],
        };
    }
}
/**
 * アプリケーションインスタンスを作成
 */
const app = new KindleReviewMeterApp();
/**
 * DOM読み込み完了後にアプリを初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await app.initialize();
        console.log('✅ Application initialized successfully');
        // Notify HTML that app is loaded
        window.dispatchEvent(new CustomEvent('app:loaded'));
    }
    catch (error) {
        console.error('Failed to initialize app:', error);
        // Still dispatch event to hide loading screen
        window.dispatchEvent(new CustomEvent('app:loaded'));
    }
});
/**
 * エクスポート（モジュールとして使用する場合）
 */
export { KindleReviewMeterApp, app as default };
//# sourceMappingURL=main.js.map