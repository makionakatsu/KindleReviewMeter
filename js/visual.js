/**
 * ビジュアル表示ページのエントリーポイント
 * プログレス表示とシェア機能を提供
 */

import { StorageService } from './services/StorageService.js';

/**
 * ビジュアル表示アプリケーションクラス
 */
class VisualDisplayApp {
    constructor() {
        this.storageService = new StorageService();
        this.isInitialized = false;
        this.bookData = null;
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
            
            // データを読み込み
            this.bookData = this.storageService.load();
            
            if (!this.bookData || !this.bookData.title) {
                this.showNoDataMessage();
                return;
            }

            // ビジュアル表示をレンダリング
            this.render();
            this.setupEventListeners();

            // 初期化完了
            this.isInitialized = true;
            console.log('✅ Visual app initialized successfully');

        } catch (error) {
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
                document.addEventListener('DOMContentLoaded', resolve);
            } else {
                resolve();
            }
        });
    }

    /**
     * ビジュアル表示をレンダリング
     */
    render() {
        const container = document.getElementById('app');
        
        const progress = this.calculateProgress();
        
        container.innerHTML = `
            <div class="visual-display">
                <div class="book-header">
                    <div class="book-image">
                        <img src="${this.bookData.imageUrl || ''}" alt="書籍画像">
                    </div>
                    <div class="book-info">
                        <h1>${this.bookData.title}</h1>
                        <p><strong>著者:</strong> ${this.bookData.author}</p>
                        <p><strong>目標:</strong> ${this.bookData.targetReviews} レビュー</p>
                        ${this.bookData.stretchGoal ? `<p><strong>ストレッチ目標:</strong> ${this.bookData.stretchGoal} レビュー</p>` : ''}
                    </div>
                </div>

                <div class="progress-section">
                    <h2>進捗状況</h2>
                    
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress.percentage}%"></div>
                        <span class="progress-text">${progress.percentage}%</span>
                    </div>

                    <div class="progress-stats">
                        <div class="stat">
                            <div class="stat-value">${this.bookData.reviewCount || 0}</div>
                            <div class="stat-label">現在のレビュー数</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value">${this.bookData.targetReviews}</div>
                            <div class="stat-label">目標レビュー数</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value">${progress.remaining}</div>
                            <div class="stat-label">あと</div>
                        </div>
                    </div>

                    <div class="milestone ${progress.achieved ? 'achieved' : ''}">
                        ${progress.achieved ? '🎉 目標達成！' : '📈 目標まであと少し！'}
                    </div>
                </div>

                <div class="actions">
                    <button id="updateBtn" class="btn btn-primary">🔄 データ更新</button>
                    <button id="shareBtn" class="btn btn-secondary">📤 シェア</button>
                    <a href="index.html" class="btn btn-secondary">⚙️ 設定に戻る</a>
                </div>
            </div>
        `;
    }

    /**
     * 進捗を計算
     */
    calculateProgress() {
        const current = this.bookData.reviewCount || 0;
        const target = this.bookData.targetReviews || 1;
        
        const percentage = Math.min(Math.round((current / target) * 100), 100);
        const remaining = Math.max(target - current, 0);
        const achieved = current >= target;

        return {
            percentage,
            remaining,
            achieved,
            current,
            target
        };
    }

    /**
     * イベントリスナーを設定
     */
    setupEventListeners() {
        // データ更新ボタン
        document.getElementById('updateBtn').addEventListener('click', () => {
            alert('データ更新機能は開発中です。設定ページで最新データを取得してください。');
        });

        // シェアボタン
        document.getElementById('shareBtn').addEventListener('click', () => {
            this.shareProgress();
        });

        // キーボードショートカット
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 's') {
                event.preventDefault();
                this.shareProgress();
            }
        });
    }

    /**
     * 進捗をシェア
     */
    shareProgress() {
        const progress = this.calculateProgress();
        const text = `📚 ${this.bookData.title} のレビュー進捗: ${progress.current}/${progress.target} (${progress.percentage}%) #KindleReviewMeter`;
        const url = window.location.href;

        if (navigator.share) {
            navigator.share({
                title: 'Kindle Review Meter',
                text: text,
                url: url
            });
        } else {
            // フォールバック: クリップボードにコピー
            navigator.clipboard.writeText(`${text} ${url}`).then(() => {
                alert('シェア用テキストをクリップボードにコピーしました！');
            }).catch(() => {
                alert(`シェア用テキスト:\\n${text}\\n${url}`);
            });
        }
    }

    /**
     * データなしメッセージを表示
     */
    showNoDataMessage() {
        const container = document.getElementById('app');
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
const visualApp = new VisualDisplayApp();

/**
 * DOM読み込み完了後にアプリを初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await visualApp.initialize();
        console.log('✅ Visual application initialized successfully');
        
        // HTMLに初期化完了を通知
        window.dispatchEvent(new CustomEvent('app:loaded'));
        
    } catch (error) {
        console.error('Failed to initialize visual app:', error);
        
        // エラーでも読み込み画面を非表示にする
        window.dispatchEvent(new CustomEvent('app:loaded'));
    }
});

// エクスポート
export default visualApp;