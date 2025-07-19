/**
 * メインアプリケーション - 簡易版
 */

// 設定
const STORAGE_KEY = 'amazonReviewTracker';
const DEFAULT_CONFIG = {
    proxyUrl: 'https://api.allorigins.win/raw?url=',
    timeout: 30000,
    maxRetries: 3
};

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

// 書籍情報サービス
class BookInfoService {
    constructor() {
        this.storage = new StorageService();
    }

    async fetchBookInfo(url) {
        try {
            console.log('Fetching book info for:', url);
            
            // プロキシURL経由でAmazonページを取得
            const proxyUrl = DEFAULT_CONFIG.proxyUrl + encodeURIComponent(url);
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const html = await response.text();
            console.log('HTML取得完了、解析開始...');
            
            const result = this.parseBookInfo(html, url);
            
            console.log('解析結果:', result);
            return result;
            
        } catch (error) {
            console.error('書籍情報取得エラー:', error);
            return {
                success: false,
                errors: [error.message],
                data: null
            };
        }
    }

    parseBookInfo(html, url) {
        const result = {
            success: true,
            errors: [],
            data: {
                bookTitle: '',
                bookAuthor: '',
                currentReviews: 0,
                bookCoverUrl: ''
            },
            metadata: {
                extractedFields: []
            }
        };

        try {
            // タイトル抽出
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) {
                let title = titleMatch[1].replace(/\s*-\s*Amazon[^-]*$/, '').trim();
                if (title) {
                    result.data.bookTitle = title;
                    result.metadata.extractedFields.push('タイトル');
                }
            }

            // 著者名抽出（複数パターン）
            const authorPatterns = [
                /<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/span>/gi,
                /<a[^>]*href="[^"]*\/author\/[^"]*"[^>]*>([^<]+)<\/a>/gi,
                /著者[：:]\s*([^<\n]+)/gi,
                /Author[：:]\s*([^<\n]+)/gi
            ];

            for (const pattern of authorPatterns) {
                const matches = [...html.matchAll(pattern)];
                if (matches.length > 0) {
                    const author = matches[0][1].trim();
                    if (author && author.length > 2 && author.length < 100) {
                        result.data.bookAuthor = author;
                        result.metadata.extractedFields.push('著者名');
                        break;
                    }
                }
            }

            // レビュー数抽出
            const reviewPatterns = [
                /(\d+)\s*個?の?評価/g,
                /(\d+)\s*reviews?/gi,
                /(\d+)\s*カスタマーレビュー/g
            ];

            for (const pattern of reviewPatterns) {
                const matches = [...html.matchAll(pattern)];
                if (matches.length > 0) {
                    const reviews = parseInt(matches[0][1], 10);
                    if (!isNaN(reviews) && reviews >= 0) {
                        result.data.currentReviews = reviews;
                        result.metadata.extractedFields.push('レビュー数');
                        break;
                    }
                }
            }

            // 書籍カバー画像抽出
            const imagePatterns = [
                /<img[^>]*src="([^"]*)"[^>]*id="[^"]*cover[^"]*"/gi,
                /<img[^>]*id="[^"]*cover[^"]*"[^>]*src="([^"]*)"/gi,
                /<img[^>]*src="(https:\/\/[^"]*amazon[^"]*\.jpg)"/gi
            ];

            for (const pattern of imagePatterns) {
                const matches = [...html.matchAll(pattern)];
                if (matches.length > 0) {
                    const imageUrl = matches[0][1];
                    if (imageUrl && imageUrl.startsWith('http')) {
                        result.data.bookCoverUrl = imageUrl;
                        result.metadata.extractedFields.push('書籍カバー');
                        break;
                    }
                }
            }

            // 更新日時を設定
            result.data.lastUpdated = new Date().toISOString();

        } catch (error) {
            console.error('解析エラー:', error);
            result.errors.push('データ解析中にエラーが発生しました');
        }

        return result;
    }

    validateUrl(url) {
        const amazonPattern = /amazon\.(co\.jp|com)/;
        const productPattern = /\/(dp|gp\/product)\/[A-Z0-9]{10}/;
        return amazonPattern.test(url) && productPattern.test(url);
    }
}

// メインアプリケーション
class KindleReviewMeterApp {
    constructor() {
        this.storage = new StorageService();
        this.bookInfoService = new BookInfoService();
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        console.log('アプリケーション初期化開始...');

        try {
            await this.waitForDOM();
            this.setupEventListeners();
            this.loadExistingData();
            
            this.isInitialized = true;
            console.log('アプリケーション初期化完了');
            
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

    setupEventListeners() {
        // フォーム送信
        const form = document.getElementById('settingsForm');
        if (form) {
            form.addEventListener('submit', this.handleFormSubmit.bind(this));
        }

        // 自動取得ボタン
        const fetchBtn = document.getElementById('fetchAllBtn');
        if (fetchBtn) {
            fetchBtn.addEventListener('click', this.handleAutoFetch.bind(this));
        }

        // 著者名編集ボタン
        const editAuthorBtn = document.getElementById('editAuthorBtn');
        if (editAuthorBtn) {
            editAuthorBtn.addEventListener('click', this.handleAuthorEdit.bind(this));
        }
    }

    async handleFormSubmit(event) {
        event.preventDefault();
        
        try {
            const formData = this.getFormData();
            const validation = this.validateFormData(formData);
            
            if (!validation.isValid) {
                this.showValidationErrors(validation.errors);
                return;
            }

            this.storage.set(STORAGE_KEY, formData);
            alert('設定が保存されました！\n\nビジュアル表示ページで確認してください。');
            
        } catch (error) {
            console.error('保存エラー:', error);
            alert('設定の保存に失敗しました: ' + error.message);
        }
    }

    async handleAutoFetch(event) {
        event.preventDefault();
        
        const urlInput = document.getElementById('bookUrl');
        const statusDiv = document.getElementById('fetchAllStatus');
        const fetchBtn = document.getElementById('fetchAllBtn');
        
        if (!urlInput || !statusDiv || !fetchBtn) return;
        
        const url = urlInput.value.trim();
        
        if (!url) {
            this.showStatus('error', 'URLを入力してください');
            return;
        }

        if (!this.bookInfoService.validateUrl(url)) {
            this.showStatus('error', '有効なAmazonのURLを入力してください');
            return;
        }

        try {
            fetchBtn.disabled = true;
            fetchBtn.textContent = '🚀 取得中...';
            this.showStatus('loading', '書籍情報を取得中...');
            
            const result = await this.bookInfoService.fetchBookInfo(url);
            
            if (result.success && result.data) {
                this.populateFormWithData(result.data);
                this.showStatus('success', `取得完了: ${result.metadata.extractedFields.join('、')} (${result.metadata.extractedFields.length}/4項目)`);
                
                // 著者名編集ボタンの表示
                const editAuthorBtn = document.getElementById('editAuthorBtn');
                if (editAuthorBtn && result.data.bookTitle) {
                    editAuthorBtn.style.display = 'inline-block';
                }
                
            } else {
                this.showStatus('error', result.errors.join(', ') || '情報を取得できませんでした');
            }
            
        } catch (error) {
            console.error('取得エラー:', error);
            this.showStatus('error', '取得に失敗しました。しばらく後にお試しください。');
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.textContent = '🚀 自動取得';
        }
    }

    handleAuthorEdit(event) {
        event.preventDefault();
        
        const currentData = this.storage.get(STORAGE_KEY) || {};
        const currentAuthor = currentData.bookAuthor || '';
        const newAuthor = prompt('著者名を入力・修正してください:\n（空白にすると「未設定」になります）', currentAuthor);
        
        if (newAuthor !== null) {
            const authorInput = document.getElementById('previewAuthor');
            if (authorInput) {
                if (newAuthor.trim() !== '') {
                    authorInput.textContent = newAuthor;
                    currentData.bookAuthor = newAuthor;
                } else {
                    authorInput.textContent = '未設定';
                    currentData.bookAuthor = '';
                }
                
                this.storage.set(STORAGE_KEY, currentData);
                this.showStatus('success', `著者名を更新しました`);
            }
        }
    }

    getFormData() {
        return {
            bookUrl: document.getElementById('bookUrl')?.value || '',
            targetReviews: parseInt(document.getElementById('targetReviews')?.value || '0', 10),
            stretchReviews: parseInt(document.getElementById('stretchReviews')?.value || '0', 10),
            bookTitle: document.getElementById('previewTitle')?.textContent || '',
            bookAuthor: document.getElementById('previewAuthor')?.textContent || '',
            currentReviews: parseInt(document.getElementById('previewCurrent')?.textContent || '0', 10),
            bookCoverUrl: document.getElementById('bookCover')?.src || '',
            lastUpdated: new Date().toISOString()
        };
    }

    validateFormData(data) {
        const errors = {};
        
        if (!data.bookUrl || !this.bookInfoService.validateUrl(data.bookUrl)) {
            errors.bookUrl = '有効なAmazonのURLを入力してください';
        }
        
        if (!data.targetReviews || data.targetReviews < 1) {
            errors.targetReviews = '1以上の整数を入力してください';
        }
        
        if (!data.stretchReviews || data.stretchReviews <= data.targetReviews) {
            errors.stretchReviews = '目標レビュー数より大きい整数を入力してください';
        }
        
        return {
            isValid: Object.keys(errors).length === 0,
            errors
        };
    }

    showValidationErrors(errors) {
        // エラー表示をリセット
        document.querySelectorAll('.error').forEach(el => el.style.display = 'none');
        document.querySelectorAll('input').forEach(el => el.classList.remove('input-error'));
        
        // エラーを表示
        Object.entries(errors).forEach(([field, message]) => {
            const errorEl = document.getElementById(field + 'Error');
            const inputEl = document.getElementById(field);
            
            if (errorEl) {
                errorEl.textContent = message;
                errorEl.style.display = 'block';
            }
            
            if (inputEl) {
                inputEl.classList.add('input-error');
            }
        });
    }

    populateFormWithData(data) {
        // プレビュー要素を更新
        const elements = {
            previewTitle: data.bookTitle || '未設定',
            previewAuthor: data.bookAuthor || '未設定',
            previewCurrent: data.currentReviews?.toString() || '0',
            previewAutoFetch: data.bookTitle ? '取得済み' : '未取得'
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
        
        // 書籍カバー画像
        if (data.bookCoverUrl) {
            const img = document.getElementById('bookCover');
            if (img) {
                img.src = data.bookCoverUrl;
                img.style.display = 'block';
            }
        }
    }

    showStatus(type, message) {
        const statusEl = document.getElementById('fetchAllStatus');
        if (!statusEl) return;
        
        statusEl.className = `fetch-status ${type}`;
        statusEl.textContent = message;
        statusEl.style.display = 'block';
        
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }
    }

    loadExistingData() {
        const savedData = this.storage.get(STORAGE_KEY);
        if (savedData) {
            // フォームに既存データを設定
            const urlInput = document.getElementById('bookUrl');
            const targetInput = document.getElementById('targetReviews');
            const stretchInput = document.getElementById('stretchReviews');
            
            if (urlInput) urlInput.value = savedData.bookUrl || '';
            if (targetInput) targetInput.value = savedData.targetReviews || '';
            if (stretchInput) stretchInput.value = savedData.stretchReviews || '';
            
            this.populateFormWithData(savedData);
            
            // 著者名編集ボタンの表示
            const editAuthorBtn = document.getElementById('editAuthorBtn');
            if (editAuthorBtn && savedData.bookTitle) {
                editAuthorBtn.style.display = 'inline-block';
            }
        }
    }

    showError(message) {
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #e74c3c;">
                    <h1>⚠️ エラー</h1>
                    <p>${message}</p>
                    <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 10px;">
                        🔄 再読み込み
                    </button>
                </div>
            `;
        }
    }
}

// アプリケーション開始
const app = new KindleReviewMeterApp();

// DOM読み込み完了後に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

// デバッグ用
window.app = app;

export default app;