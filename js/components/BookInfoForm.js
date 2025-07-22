/**
 * 書籍情報入力フォームコンポーネント
 */
export class BookInfoForm {
    constructor(container, storageService, bookInfoService, validationService) {
        this.container = container;
        this.storageService = storageService;
        this.bookInfoService = bookInfoService;
        this.validationService = validationService;
        this.isInitialized = false;
    }

    /**
     * フォームを初期化
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            this.render();
            this.setupEventListeners();
            this.loadExistingData();
            this.isInitialized = true;
            console.log('✅ BookInfoForm initialized');
        } catch (error) {
            console.error('❌ BookInfoForm initialization failed:', error);
            throw error;
        }
    }

    /**
     * フォームをレンダリング
     */
    render() {
        this.container.innerHTML = `
            <div class="book-info-form">
                <h1>📚 Amazon書籍レビュー数トラッカー</h1>
                
                <form id="settingsForm">
                    <div class="form-group">
                        <label for="amazonUrl">Amazon書籍URL</label>
                        <input type="url" id="amazonUrl" placeholder="https://www.amazon.co.jp/dp/...">
                        <button type="button" id="fetchBtn" class="btn btn-secondary">自動取得</button>
                    </div>

                    <div class="book-preview" id="bookPreview" style="display: none;">
                        <div class="book-image">
                            <img id="bookImage" alt="書籍画像">
                        </div>
                        <div class="book-details">
                            <h3 id="bookTitle"></h3>
                            <p><strong>著者:</strong> <span id="bookAuthor"></span></p>
                            <p><strong>現在のレビュー数:</strong> <span id="currentReviews">0</span></p>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="targetReviews">目標レビュー数</label>
                        <input type="number" id="targetReviews" min="1" placeholder="100">
                    </div>

                    <div class="form-group">
                        <label for="stretchGoal">ストレッチ目標</label>
                        <input type="number" id="stretchGoal" min="1" placeholder="200">
                    </div>

                    <button type="submit" class="btn btn-primary">設定を保存</button>
                </form>

                <div class="actions">
                    <a href="amazon-review-visual.html" class="btn btn-secondary">📊 ビジュアル表示</a>
                    <button id="clearBtn" class="btn btn-warning">🗑️ データクリア</button>
                </div>
            </div>
        `;
    }

    /**
     * イベントリスナーを設定
     */
    setupEventListeners() {
        // 書籍情報取得ボタン
        document.getElementById('fetchBtn').addEventListener('click', () => {
            this.fetchBookInfo();
        });

        // フォーム送信
        document.getElementById('settingsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        // データクリアボタン
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearData();
        });

        // URL入力でEnterキー
        document.getElementById('amazonUrl').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.fetchBookInfo();
            }
        });
    }

    /**
     * 書籍情報を取得
     */
    async fetchBookInfo() {
        const urlInput = document.getElementById('amazonUrl');
        const fetchBtn = document.getElementById('fetchBtn');
        
        try {
            const validation = this.validationService.validateAmazonUrl(urlInput.value);
            if (!validation.isValid) {
                alert(validation.error);
                return;
            }

            fetchBtn.textContent = '取得中...';
            fetchBtn.disabled = true;

            const bookInfo = await this.bookInfoService.fetchBookInfo(validation.url);
            this.displayBookInfo(bookInfo);

        } catch (error) {
            console.error('Failed to fetch book info:', error);
            alert('書籍情報の取得に失敗しました。URLを確認してください。');
        } finally {
            fetchBtn.textContent = '自動取得';
            fetchBtn.disabled = false;
        }
    }

    /**
     * 書籍情報を表示
     */
    displayBookInfo(bookInfo) {
        const preview = document.getElementById('bookPreview');
        const image = document.getElementById('bookImage');
        const title = document.getElementById('bookTitle');
        const author = document.getElementById('bookAuthor');
        const reviews = document.getElementById('currentReviews');

        if (bookInfo.imageUrl) {
            image.src = bookInfo.imageUrl;
        }
        title.textContent = bookInfo.title || '不明';
        author.textContent = bookInfo.author || '不明';
        reviews.textContent = bookInfo.reviewCount || 0;

        preview.style.display = 'block';
        
        // 一時的に書籍情報を保存
        this.currentBookInfo = bookInfo;
    }

    /**
     * 設定を保存
     */
    saveSettings() {
        try {
            const targetReviews = document.getElementById('targetReviews').value;
            const stretchGoal = document.getElementById('stretchGoal').value;

            const targetValidation = this.validationService.validateTargetReviews(targetReviews);
            if (!targetValidation.isValid) {
                alert(targetValidation.error);
                return;
            }

            const data = {
                ...this.currentBookInfo,
                targetReviews: targetValidation.value,
                stretchGoal: stretchGoal ? parseInt(stretchGoal, 10) : null,
                savedAt: new Date().toISOString()
            };

            if (this.storageService.save(data)) {
                alert('設定を保存しました！');
                console.log('✅ Settings saved:', data);
            } else {
                alert('設定の保存に失敗しました。');
            }

        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('設定の保存中にエラーが発生しました。');
        }
    }

    /**
     * 既存データを読み込み
     */
    loadExistingData() {
        const data = this.storageService.load();
        if (data) {
            document.getElementById('targetReviews').value = data.targetReviews || '';
            document.getElementById('stretchGoal').value = data.stretchGoal || '';
            
            if (data.title) {
                this.displayBookInfo(data);
            }
        }
    }

    /**
     * データをクリア
     */
    clearData() {
        if (confirm('保存されたデータをすべて削除しますか？')) {
            this.storageService.clear();
            location.reload();
        }
    }
}