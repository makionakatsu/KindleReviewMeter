/**
 * メインアプリケーションエントリーポイント（設定ページ用）
 * Amazon書籍レビュー数トラッカーの設定画面を初期化
 */

import { StorageService } from './services/StorageService.js';
import { BookInfoService } from './services/BookInfoService.js';
import { ValidationService } from './services/ValidationService.js';
import { BookInfoForm } from './components/BookInfoForm.js';

/**
 * アプリケーションクラス
 */
class KindleReviewMeterApp {
    constructor() {
        this.storageService = new StorageService();
        this.bookInfoService = new BookInfoService();
        this.validationService = new ValidationService();
        this.bookInfoForm = null;
        this.isInitialized = false;
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
            this.bookInfoForm = new BookInfoForm(
                container, 
                this.storageService, 
                this.bookInfoService,
                this.validationService
            );

            await this.bookInfoForm.initialize();
            
            // グローバルイベントリスナーを設定
            this.setupGlobalEventListeners();

            // 初期化完了
            this.isInitialized = true;
            console.log('✅ Application initialized successfully');

        } catch (error) {
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
                document.addEventListener('DOMContentLoaded', resolve);
            } else {
                resolve();
            }
        });
    }

    /**
     * グローバルイベントリスナーを設定
     */
    setupGlobalEventListeners() {
        // キーボードショートカット
        document.addEventListener('keydown', (event) => {
            // Ctrl+S で保存
            if (event.ctrlKey && event.key === 's') {
                event.preventDefault();
                if (this.bookInfoForm) {
                    this.bookInfoForm.saveSettings();
                }
            }
            
            // Ctrl+R でリフレッシュ（データ再取得）
            if (event.ctrlKey && event.key === 'r') {
                event.preventDefault();
                if (this.bookInfoForm) {
                    this.bookInfoForm.fetchBookInfo();
                }
            }
        });
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
        
        // HTMLに初期化完了を通知
        window.dispatchEvent(new CustomEvent('app:loaded'));
        
    } catch (error) {
        console.error('Failed to initialize app:', error);
        
        // エラーでも読み込み画面を非表示にする
        window.dispatchEvent(new CustomEvent('app:loaded'));
    }
});

// エクスポート
export default app;