/**
 * ビジュアル表示アプリケーション - 簡易版
 */

// 設定
const STORAGE_KEY = 'amazonReviewTracker';

// ストレージサービス
class StorageService {
    set(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Storage error:', error);
            return false;
        }
    }

    get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Storage retrieval error:', error);
            return null;
        }
    }
}

// プログレス計算
class ProgressCalculator {
    static calculate(data) {
        if (!data || !data.targetReviews) {
            return {
                currentReviews: 0,
                targetReviews: 0,
                stretchReviews: 0,
                achievementRate: 0,
                progressPercentage: 0,
                remainingToTarget: 0,
                remainingToStretch: 0
            };
        }

        const currentReviews = data.currentReviews || 0;
        const targetReviews = data.targetReviews || 0;
        const stretchReviews = data.stretchReviews || 0;
        
        const achievementRate = targetReviews > 0 ? 
            Math.min(Math.round((currentReviews / targetReviews) * 100), 100) : 0;
        
        const progressPercentage = stretchReviews > 0 ? 
            Math.min((currentReviews / stretchReviews) * 100, 100) : 0;

        return {
            currentReviews,
            targetReviews,
            stretchReviews,
            achievementRate,
            progressPercentage,
            remainingToTarget: Math.max(targetReviews - currentReviews, 0),
            remainingToStretch: Math.max(stretchReviews - currentReviews, 0)
        };
    }
}

// ビジュアル表示アプリケーション
class VisualDisplayApp {
    constructor() {
        this.storage = new StorageService();
        this.isInitialized = false;
        this.currentData = null;
        this.progressData = null;
    }

    async init() {
        if (this.isInitialized) return;

        console.log('ビジュアル表示アプリ初期化開始...');

        try {
            await this.waitForDOM();
            
            if (!this.checkDataAvailability()) {
                this.showNoDataMessage();
                return;
            }

            this.loadData();
            this.setupEventListeners();
            this.render();
            
            this.isInitialized = true;
            console.log('ビジュアル表示アプリ初期化完了');
            
        } catch (error) {
            console.error('初期化エラー:', error);
            this.showError('アプリケーションの初期化に失敗しました: ' + error.message);
        }
    }

    waitForDOM() {
        return new Promise(resolve => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve);
            } else {
                resolve();
            }
        });
    }

    checkDataAvailability() {
        const data = this.storage.get(STORAGE_KEY);
        return !!(data && data.bookTitle && data.targetReviews > 0);
    }

    loadData() {
        this.currentData = this.storage.get(STORAGE_KEY);
        if (this.currentData) {
            this.progressData = ProgressCalculator.calculate(this.currentData);
        }
    }

    setupEventListeners() {
        // 戻るボタン
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        }

        // 更新ボタン
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', this.handleRefresh.bind(this));
        }

        // シェアボタン
        const shareBtn = document.getElementById('shareBtn');
        if (shareBtn) {
            shareBtn.addEventListener('click', this.handleShare.bind(this));
        }
    }

    render() {
        if (!this.currentData || !this.progressData) return;

        this.renderBookInfo();
        this.renderProgress();
        this.renderMilestones();
        this.renderStats();
        this.renderLastUpdated();
    }

    renderBookInfo() {
        const data = this.currentData;
        
        // タイトル
        const titleEl = document.getElementById('bookTitle');
        if (titleEl) {
            titleEl.textContent = data.bookTitle || 'タイトル未設定';
        }

        // 著者
        const authorEl = document.getElementById('bookAuthor');
        if (authorEl) {
            if (data.bookAuthor && data.bookAuthor.trim() && data.bookAuthor !== '未設定') {
                authorEl.textContent = data.bookAuthor;
                authorEl.style.display = 'block';
            } else {
                authorEl.style.display = 'none';
            }
        }

        // 書籍カバー
        const coverEl = document.getElementById('bookCover');
        const placeholderEl = document.getElementById('bookCoverPlaceholder');
        
        if (data.bookCoverUrl && coverEl && placeholderEl) {
            coverEl.src = data.bookCoverUrl;
            coverEl.style.display = 'block';
            placeholderEl.style.display = 'none';
            
            coverEl.onerror = () => {
                coverEl.style.display = 'none';
                placeholderEl.style.display = 'flex';
            };
        }
    }

    renderProgress() {
        const data = this.progressData;
        
        // レビュー数のアニメーション
        this.animateNumber('currentReviews', data.currentReviews);
        
        // プログレスバー
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.style.width = data.progressPercentage + '%';
        }

        // 達成メッセージ
        this.renderAchievementMessage();
    }

    renderMilestones() {
        const milestonesContainer = document.getElementById('milestoneList');
        if (!milestonesContainer || !this.progressData) return;

        const currentReviews = this.currentData.currentReviews;
        const milestones = [
            { value: this.currentData.targetReviews, icon: '🎁', label: '目標' },
            { value: this.currentData.stretchReviews, icon: '🌟', label: 'ストレッチ' }
        ];

        const milestonesHTML = milestones.map(milestone => {
            const isAchieved = currentReviews >= milestone.value;
            return `
                <div class="milestone-item ${isAchieved ? 'achieved' : 'pending'}">
                    <div class="milestone-icon">${milestone.icon}</div>
                    <div class="milestone-info">
                        <div class="milestone-value">${milestone.value.toLocaleString()}</div>
                        <div class="milestone-label">${milestone.label}</div>
                        <div class="milestone-status">
                            ${isAchieved ? '達成済み' : `あと${(milestone.value - currentReviews).toLocaleString()}`}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        milestonesContainer.innerHTML = milestonesHTML;
    }

    renderStats() {
        const data = this.progressData;
        
        const updates = [
            ['currentReviews', data.currentReviews.toLocaleString()],
            ['targetReviews', data.targetReviews.toLocaleString()],
            ['stretchReviews', data.stretchReviews.toLocaleString()],
            ['progressText', `${data.achievementRate}%`]
        ];

        updates.forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = text;
            }
        });
    }

    renderAchievementMessage() {
        const messageEl = document.getElementById('achievementMessage');
        if (!messageEl || !this.progressData) return;

        const rate = this.progressData.achievementRate;
        let message = '';
        let className = '';

        if (rate >= 100) {
            message = `🎉 目標達成おめでとうございます！ (${rate}%)`;
            className = 'complete';
        } else if (rate >= 75) {
            message = `🚀 もう少しで目標達成です！ (${rate}%)`;
            className = 'near-complete';
        } else if (rate >= 50) {
            message = `💪 順調に進んでいます！ (${rate}%)`;
            className = 'good';
        } else if (rate > 0) {
            message = `📈 スタートを切りました！ (${rate}%)`;
            className = 'start';
        } else {
            message = '📚 レビュー数が取得されていません。設定ページで更新してください。';
            className = 'no-data';
        }

        messageEl.textContent = message;
        messageEl.className = `achievement-message ${className}`;
    }

    renderLastUpdated() {
        const lastUpdatedEl = document.getElementById('lastUpdated');
        if (!lastUpdatedEl || !this.currentData) return;

        if (this.currentData.lastUpdated) {
            const date = new Date(this.currentData.lastUpdated);
            const formattedDate = date.toLocaleString('ja-JP');
            lastUpdatedEl.textContent = `最終更新: ${formattedDate}`;
        } else {
            lastUpdatedEl.textContent = '最終更新: 未取得';
        }
    }

    animateNumber(elementId, targetValue) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const currentValue = parseInt(element.textContent) || 0;
        const difference = Math.abs(targetValue - currentValue);
        
        if (difference === 0) return;

        const duration = Math.min(difference * 20, 2000); // 最大2秒
        const steps = Math.min(difference, 50);
        const increment = (targetValue - currentValue) / steps;
        
        let current = currentValue;
        let step = 0;
        
        const timer = setInterval(() => {
            step++;
            current += increment;
            
            if (step >= steps) {
                current = targetValue;
                clearInterval(timer);
            }
            
            element.textContent = Math.round(current).toLocaleString();
        }, duration / steps);
    }

    async handleRefresh() {
        const refreshBtn = document.getElementById('refreshBtn');
        if (!refreshBtn) return;

        try {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 更新中...';

            // 実際のアプリでは書籍情報を再取得
            // デモでは少し待機してからデータを更新
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.loadData();
            this.render();
            
            this.showToast('更新完了しました！', 'success');
            
        } catch (error) {
            console.error('更新エラー:', error);
            this.showToast('更新に失敗しました', 'error');
        } finally {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 更新';
            }
        }
    }

    handleShare() {
        if (!this.progressData) {
            this.showToast('シェアできるデータがありません', 'error');
            return;
        }

        // 実際のアプリではCanvas APIでシェア画像を生成
        const text = `📚「${this.currentData.bookTitle}」
⭐ レビュー数: ${this.currentData.currentReviews}件
🎯 達成率: ${this.progressData.achievementRate}%
💪 目標まであと${this.progressData.remainingToTarget}件

#書籍レビュー #Amazon #読書記録`;

        const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(tweetUrl, '_blank');
        
        this.showToast('Twitterでシェアします', 'success');
    }

    showNoDataMessage() {
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.innerHTML = `
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
    }

    showError(message) {
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.innerHTML = `
                <div class="error-container">
                    <div class="error-content">
                        <h1>⚠️ エラーが発生しました</h1>
                        <p>${message}</p>
                        <div class="error-actions">
                            <button onclick="location.reload()" class="btn btn-primary">
                                🔄 再読み込み
                            </button>
                            <a href="index.html" class="btn btn-secondary">
                                ⚙️ 設定ページに戻る
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;

        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// アプリケーション開始
const visualApp = new VisualDisplayApp();

// DOM読み込み完了後に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => visualApp.init());
} else {
    visualApp.init();
}

// デバッグ用
window.visualApp = visualApp;

export default visualApp;