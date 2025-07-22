/**
 * ビジュアル表示ページのエントリーポイント
 *
 * プログレス表示とシェア機能を提供
 */
// import { StorageService } from './services/StorageService.js';
import { ShareService } from './services/ShareService.js';
import { ProgressViewer } from './components/ProgressViewer.js';
import { ApplicationEventEmitter } from './utils/EventEmitter.js';
import { ErrorHandler } from './utils/ErrorHandler.js';
import { DOMHelperImpl } from './utils/DOMHelper.js';
import { DEFAULT_CONFIG, DEV_CONFIG } from './utils/constants.js';
/**
 * ビジュアル表示アプリケーションクラス
 */
class VisualDisplayApp {
    constructor() {
        Object.defineProperty(this, "context", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "progressViewer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "shareService", {
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
        // ストレージサービスを作成（読み取り専用モード）
        const storage = {
            get: (key) => {
                try {
                    const data = localStorage.getItem(key);
                    return data ? JSON.parse(data) : null;
                }
                catch {
                    return null;
                }
            },
            set: (key, data) => {
                try {
                    localStorage.setItem(key, JSON.stringify(data));
                    return true;
                }
                catch {
                    return false;
                }
            },
            remove: (key) => {
                try {
                    localStorage.removeItem(key);
                    return true;
                }
                catch {
                    return false;
                }
            },
            clear: () => {
                try {
                    localStorage.clear();
                    return true;
                }
                catch {
                    return false;
                }
            },
            exists: (key) => localStorage.getItem(key) !== null,
            getAllKeys: () => Object.keys(localStorage),
            getDebugInfo: () => ({ keys: Object.keys(localStorage) })
        };
        return {
            eventEmitter,
            domHelper,
            storage,
            // ビジュアル表示では書籍情報取得サービスは不要
            validationService: {},
            bookInfoService: {},
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
            maxErrorHistory: 30,
        });
        // エラーイベントを監視
        this.context.eventEmitter.on('error:occurred', (event) => {
            console.error('Visual app error:', event.payload);
        });
    }
    /**
     * デバッグモードを有効化
     */
    enableDebugMode() {
        // グローバルにコンテキストを公開（デバッグ用）
        window.visualAppContext = this.context;
        window.visualApp = this;
        console.log('🔧 Visual app debug mode enabled');
        console.log('Access context via: window.visualAppContext');
        console.log('Access app via: window.visualApp');
    }
    /**
     * アプリケーションを初期化
     */
    async initialize() {
        if (this.isInitialized) {
            console.warn('Visual app is already initialized');
            return;
        }
        try {
            console.log('🎨 Initializing Visual Display App...');
            // DOM の準備を待つ
            await this.waitForDOM();
            // データの存在確認
            const hasData = this.checkDataAvailability();
            if (!hasData) {
                this.showNoDataMessage();
                return;
            }
            // コンテナ要素を取得
            const container = document.getElementById('app');
            if (!container) {
                throw new Error('App container element not found');
            }
            // シェアサービスを初期化
            this.shareService = new ShareService({
                enableWatermark: true,
                enableTwitterShare: true,
            });
            // プログレス表示コンポーネントを初期化
            this.progressViewer = new ProgressViewer(container, this.context, {
                showMilestones: true,
                enableAnimations: true,
                allowShare: true,
                autoRefresh: false, // 手動更新のみ
            });
            // コンポーネントを初期化
            await this.progressViewer.initialize();
            // シェア機能を設定
            this.setupShareFunctionality();
            // グローバルイベントリスナーを設定
            this.setupGlobalEventListeners();
            // 初期化完了
            this.isInitialized = true;
            this.context.eventEmitter.emit('visual_app:initialized', {
                timestamp: Date.now(),
                version: '2.0.0',
            });
            console.log('✅ Visual app initialized successfully');
        }
        catch (error) {
            console.error('❌ Visual app initialization failed:', error);
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
     * データの可用性をチェック
     */
    checkDataAvailability() {
        try {
            const bookData = this.context.storage.get('amazonReviewTracker');
            console.log('📊 ビジュアル表示 - データ可用性チェック:', {
                hasData: !!bookData,
                bookTitle: bookData?.bookTitle,
                bookAuthor: bookData?.bookAuthor,
                targetReviews: bookData?.targetReviews,
                fullData: bookData
            });
            const isAvailable = !!(bookData && bookData.bookTitle && bookData.targetReviews > 0);
            console.log('📊 データ可用性判定:', {
                result: isAvailable,
                hasTitle: !!bookData?.bookTitle,
                hasTargetReviews: (bookData?.targetReviews || 0) > 0,
                authorValue: bookData?.bookAuthor || '未設定'
            });
            return isAvailable;
        }
        catch (error) {
            console.error('Data availability check failed:', error);
            return false;
        }
    }
    /**
     * データなしメッセージを表示
     */
    showNoDataMessage() {
        const container = document.getElementById('app') || document.body;
        container.innerHTML = `
      <div class="no-data-container">
        <div class="no-data-content">
          <h1>📝 データが設定されていません</h1>
          <p>まず設定ページで書籍情報を登録してください。</p>
          <div class="no-data-actions">
            <a href="index.html" class="btn btn-primary">⚙️ 設定ページへ</a>
          </div>
        </div>
      </div>
    `;
    }
    /**
     * シェア機能を設定
     */
    setupShareFunctionality() {
        if (!this.shareService || !this.progressViewer)
            return;
        // シェアイベントを監視
        this.context.eventEmitter.on('share:started', async (event) => {
            try {
                const { data, options } = event.payload;
                const progressData = this.progressViewer.getProgressData();
                if (!progressData) {
                    throw new Error('プログレスデータがありません');
                }
                // シェア画像を生成
                const result = await this.shareService.generateShareImage(data, progressData, options);
                if (result.success) {
                    // シェアオプションを表示
                    this.showShareOptions(result);
                    this.context.eventEmitter.emit('share:completed', result);
                }
                else {
                    throw new Error(result.error || 'シェア画像の生成に失敗しました');
                }
            }
            catch (error) {
                console.error('Share error:', error);
                this.context.eventEmitter.emit('share:failed', error);
                alert('シェア機能でエラーが発生しました: ' + error.message);
            }
        });
    }
    /**
     * シェアオプションを表示
     */
    showShareOptions(shareResult) {
        // モーダルダイアログを作成
        const modal = document.createElement('div');
        modal.className = 'share-modal';
        modal.innerHTML = `
      <div class="share-modal-content">
        <div class="share-modal-header">
          <h3>📤 シェア</h3>
          <button class="share-modal-close">&times;</button>
        </div>
        <div class="share-modal-body">
          <div class="share-preview">
            <img src="${shareResult.imageUrl}" alt="シェア画像プレビュー" style="max-width: 100%; height: auto;">
          </div>
          <div class="share-actions">
            <button class="btn btn-primary share-download">📥 画像をダウンロード</button>
            <button class="btn btn-secondary share-twitter">🐦 Twitterでシェア</button>
            <button class="btn btn-secondary share-copy">📋 URLをコピー</button>
          </div>
          <div class="share-info">
            <small>
              サイズ: ${shareResult.metadata.width}×${shareResult.metadata.height}px<br>
              ファイルサイズ: ${Math.round(shareResult.metadata.fileSize / 1024)}KB
            </small>
          </div>
        </div>
      </div>
    `;
        // イベントリスナーを設定
        this.setupShareModalEvents(modal, shareResult);
        // モーダルを表示
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('show'), 10);
    }
    /**
     * シェアモーダルのイベントを設定
     */
    setupShareModalEvents(modal, shareResult) {
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        };
        // 閉じるボタン
        modal.querySelector('.share-modal-close')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal)
                closeModal();
        });
        // ダウンロードボタン
        modal.querySelector('.share-download')?.addEventListener('click', () => {
            this.shareService.downloadImage(shareResult.imageUrl, `kindle-review-progress-${Date.now()}.png`);
        });
        // Twitterボタン
        modal.querySelector('.share-twitter')?.addEventListener('click', () => {
            this.shareService.shareToSocial(shareResult.shareUrl, 'twitter');
        });
        // URLコピーボタン
        modal.querySelector('.share-copy')?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(window.location.href);
                alert('URLをクリップボードにコピーしました');
            }
            catch (error) {
                console.error('Clipboard copy failed:', error);
                alert('URLのコピーに失敗しました');
            }
        });
    }
    /**
     * グローバルイベントリスナーを設定
     */
    setupGlobalEventListeners() {
        // キーボードショートカット
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });
        // ウィンドウサイズ変更時の対応
        window.addEventListener('resize', () => {
            // プログレス表示の再描画などを行う
            if (this.progressViewer) {
                this.progressViewer.render();
            }
        });
    }
    /**
     * キーボードショートカットを処理
     */
    handleKeyboardShortcuts(event) {
        // Ctrl+R でデータ更新
        if (event.ctrlKey && event.key === 'r') {
            event.preventDefault();
            if (this.progressViewer) {
                this.progressViewer.refreshData();
            }
        }
        // Ctrl+S でシェア画像生成
        if (event.ctrlKey && event.key === 's') {
            event.preventDefault();
            const shareButton = document.getElementById('shareBtn');
            if (shareButton) {
                shareButton.click();
            }
        }
        // Escapeでモーダルを閉じる
        if (event.key === 'Escape') {
            const modal = document.querySelector('.share-modal.show');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 300);
            }
        }
    }
    /**
     * 初期化エラーを表示
     */
    showInitializationError(error) {
        const container = document.getElementById('app') || document.body;
        container.innerHTML = `
      <div class="error-container">
        <div class="error-content">
          <h1>⚠️ アプリケーションの初期化に失敗しました</h1>
          <p>エラー: ${error.message}</p>
          <div class="error-actions">
            <button onclick="location.reload()" class="btn btn-primary">
              🔄 ページを再読み込み
            </button>
            <a href="index.html" class="btn btn-secondary">
              ⚙️ 設定ページに戻る
            </a>
          </div>
        </div>
      </div>
    `;
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
            if (this.progressViewer) {
                // await this.progressViewer.destroy();
                this.progressViewer = null;
            }
            // サービスを破棄
            this.shareService = null;
            // イベントエミッターをクリーンアップ
            this.context.eventEmitter.removeAllListeners();
            // フラグをリセット
            this.isInitialized = false;
            console.log('🧹 Visual app destroyed');
        }
        catch (error) {
            console.error('Error during visual app destruction:', error);
        }
    }
    /**
     * 現在の状態を取得
     */
    getState() {
        return {
            isInitialized: this.isInitialized,
            hasProgressViewer: !!this.progressViewer,
            hasShareService: !!this.shareService,
            progressData: this.progressViewer?.getProgressData(),
        };
    }
}
/**
 * アプリケーションインスタンスを作成
 */
const visualApp = new VisualDisplayApp();
/**
 * DOM読み込み完了後にアプリを初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await visualApp.initialize();
    }
    catch (error) {
        console.error('Failed to initialize visual app:', error);
    }
});
/**
 * エクスポート（モジュールとして使用する場合）
 */
export { VisualDisplayApp, visualApp as default };
//# sourceMappingURL=visual.js.map