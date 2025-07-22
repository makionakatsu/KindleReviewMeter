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
                        <div class="input-group">
                            <input type="url" id="amazonUrl" placeholder="https://www.amazon.co.jp/dp/...">
                            <button type="button" id="fetchBtn" class="btn btn-secondary">自動取得</button>
                        </div>
                        <small class="form-text">自動取得に失敗した場合は、下記の「手動入力」ボタンを使用してください</small>
                    </div>

                    <div class="manual-input-section" style="display: none;" id="manualInputSection">
                        <h4>📝 手動入力</h4>
                        <div class="form-group">
                            <label for="manualTitle">書籍タイトル</label>
                            <input type="text" id="manualTitle" placeholder="書籍のタイトルを入力">
                        </div>
                        <div class="form-group">
                            <label for="manualAuthor">著者名</label>
                            <input type="text" id="manualAuthor" placeholder="著者名を入力">
                        </div>
                        <div class="form-group">
                            <label for="manualReviews">現在のレビュー数</label>
                            <input type="number" id="manualReviews" placeholder="0" min="0">
                        </div>
                        <button type="button" id="applyManualBtn" class="btn btn-primary">手動データを適用</button>
                    </div>

                    <div class="book-preview" id="bookPreview" style="display: none;">
                        <div class="book-image">
                            <img id="bookImage" alt="書籍画像">
                        </div>
                        <div class="book-details">
                            <h3 id="bookTitle"></h3>
                            <button type="button" id="editTitleBtn" class="btn-inline" title="タイトルを編集">✏️</button>
                            <p><strong>著者:</strong> 
                                <span id="bookAuthor"></span>
                                <button type="button" id="editAuthorBtn" class="btn-inline" title="著者名を編集">✏️</button>
                            </p>
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
                    <button type="button" id="showManualBtn" class="btn btn-secondary">✏️ 手動入力</button>
                    <a href="amazon-review-visual.html" class="btn btn-secondary">📊 ビジュアル表示</a>
                    <div class="data-management">
                        <button id="exportBtn" class="btn btn-secondary">📤 データエクスポート</button>
                        <button id="importBtn" class="btn btn-secondary">📥 データインポート</button>
                        <input type="file" id="importFile" accept=".json" style="display: none;">
                    </div>
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

        // 手動入力ボタン
        document.getElementById('showManualBtn').addEventListener('click', () => {
            this.toggleManualInput();
        });

        // データエクスポートボタン
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });

        // データインポートボタン
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        // ファイル選択
        document.getElementById('importFile').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.importData(e.target.files[0]);
            }
        });

        // 編集ボタン（動的に追加される要素なので、イベント委譲を使用）
        document.addEventListener('click', (e) => {
            if (e.target.id === 'editAuthorBtn') {
                this.editAuthor();
            } else if (e.target.id === 'editTitleBtn') {
                this.editTitle();
            } else if (e.target.id === 'applyManualBtn') {
                this.applyManualData();
            }
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
        } else {
            image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150" viewBox="0 0 100 150"><rect width="100" height="150" fill="%23e9ecef"/><text x="50" y="75" text-anchor="middle" font-family="Arial" font-size="12" fill="%236c757d">No Image</text></svg>';
        }
        
        title.textContent = bookInfo.title || '不明';
        author.textContent = bookInfo.author || '不明';
        reviews.textContent = bookInfo.reviewCount || 0;

        // モックデータの場合の警告表示
        if (bookInfo.isMockData) {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'alert alert-warning';
            warningDiv.innerHTML = `
                <strong>⚠️ 自動取得に失敗しました</strong><br>
                書籍情報を手動で修正してください。タイトルと著者名をクリックして編集できます。
            `;
            preview.insertBefore(warningDiv, preview.firstChild);
        }

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
     * 手動入力セクションの表示/非表示を切り替え
     */
    toggleManualInput() {
        const section = document.getElementById('manualInputSection');
        const btn = document.getElementById('showManualBtn');
        
        if (section.style.display === 'none') {
            section.style.display = 'block';
            btn.textContent = '📁 手動入力を閉じる';
        } else {
            section.style.display = 'none';
            btn.textContent = '✏️ 手動入力';
        }
    }

    /**
     * 手動入力データを適用
     */
    applyManualData() {
        const title = document.getElementById('manualTitle').value.trim();
        const author = document.getElementById('manualAuthor').value.trim();
        const reviews = parseInt(document.getElementById('manualReviews').value) || 0;

        if (!title || !author) {
            alert('タイトルと著者名は必須です。');
            return;
        }

        const titleValidation = this.validationService.validateBookTitle(title);
        const authorValidation = this.validationService.validateAuthor(author);

        if (!titleValidation.isValid) {
            alert(titleValidation.error);
            return;
        }

        if (!authorValidation.isValid) {
            alert(authorValidation.error);
            return;
        }

        // 手動データを適用
        const bookInfo = {
            title: titleValidation.title,
            author: authorValidation.author,
            reviewCount: reviews,
            imageUrl: '',
            fetchedAt: new Date().toISOString(),
            isManualEntry: true
        };

        this.displayBookInfo(bookInfo);
        
        // 手動入力セクションを閉じる
        this.toggleManualInput();
        
        // 入力フィールドをクリア
        document.getElementById('manualTitle').value = '';
        document.getElementById('manualAuthor').value = '';
        document.getElementById('manualReviews').value = '';
        
        console.log('✅ Manual data applied:', bookInfo);
    }

    /**
     * タイトルを編集
     */
    editTitle() {
        const titleElement = document.getElementById('bookTitle');
        const currentTitle = titleElement.textContent.trim();
        
        const newTitle = prompt('書籍タイトルを入力してください:', currentTitle);
        if (newTitle !== null && newTitle.trim() !== '') {
            const validation = this.validationService.validateBookTitle(newTitle.trim());
            if (validation.isValid) {
                titleElement.textContent = validation.title;
                
                // 現在の書籍情報に反映
                if (this.currentBookInfo) {
                    this.currentBookInfo.title = validation.title;
                }
                
                console.log('✅ Title updated:', validation.title);
            } else {
                alert(validation.error);
            }
        }
    }

    /**
     * 著者名を編集
     */
    editAuthor() {
        const authorSpan = document.getElementById('bookAuthor');
        const currentAuthor = authorSpan.textContent.trim();
        
        const newAuthor = prompt('著者名を入力してください:', currentAuthor);
        if (newAuthor !== null && newAuthor.trim() !== '') {
            const validation = this.validationService.validateAuthor(newAuthor.trim());
            if (validation.isValid) {
                authorSpan.textContent = validation.author;
                
                // 現在の書籍情報に反映
                if (this.currentBookInfo) {
                    this.currentBookInfo.author = validation.author;
                }
                
                console.log('✅ Author updated:', validation.author);
            } else {
                alert(validation.error);
            }
        }
    }

    /**
     * データをエクスポート
     */
    exportData() {
        const result = this.storageService.exportData();
        
        if (result.success) {
            alert(`📤 データをエクスポートしました！\n\nファイル名: ${result.filename}\n\nダウンロードフォルダをご確認ください。`);
        } else {
            alert(`❌ エクスポートに失敗しました\n\n${result.error}`);
        }
    }

    /**
     * データをインポート
     */
    async importData(file) {
        if (!confirm('現在のデータを新しいデータで置き換えますか？\n現在のデータは上書きされます。')) {
            return;
        }

        try {
            const result = await this.storageService.importData(file);
            
            if (result.success) {
                alert(`📥 データをインポートしました！\n\n書籍: ${result.data.title}\n著者: ${result.data.author}\n\nページを再読み込みします。`);
                location.reload();
            } else {
                alert(`❌ インポートに失敗しました\n\n${result.error}`);
            }
        } catch (error) {
            console.error('Import failed:', error);
            alert(`❌ インポートに失敗しました\n\n予期しないエラーが発生しました。`);
        } finally {
            // ファイル選択をリセット
            document.getElementById('importFile').value = '';
        }
    }

    /**
     * データをクリア
     */
    clearData() {
        if (confirm('保存されたデータをすべて削除しますか？\n\n💡 ヒント: 削除前にデータエクスポートでバックアップを作成することをおすすめします。')) {
            this.storageService.clear();
            location.reload();
        }
    }
}