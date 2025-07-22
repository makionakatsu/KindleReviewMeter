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

                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary btn-large">💾 設定を保存</button>
                    </div>
                </form>

                <!-- プログレス表示セクション -->
                <div id="progressSection" class="progress-section" style="display: none;">
                    <h2>📊 進捗状況</h2>
                    <div class="visual-display">
                        <div class="book-header">
                            <div class="book-image">
                                <img id="progressBookImage" alt="書籍画像">
                            </div>
                            <div class="book-info">
                                <h3 id="progressBookTitle"></h3>
                                <p><strong>著者:</strong> <span id="progressBookAuthor"></span></p>
                                <p><strong>目標:</strong> <span id="progressTargetReviews"></span> レビュー</p>
                                <p id="progressStretchGoal" style="display: none;"><strong>ストレッチ目標:</strong> <span></span> レビュー</p>
                            </div>
                        </div>

                        <div class="progress-display">
                            <div class="progress-bar">
                                <div id="progressFill" class="progress-fill"></div>
                                <span id="progressText" class="progress-text"></span>
                            </div>

                            <div class="progress-stats">
                                <div class="stat">
                                    <div id="currentReviewsStat" class="stat-value">0</div>
                                    <div class="stat-label">現在のレビュー数</div>
                                </div>
                                <div class="stat">
                                    <div id="targetReviewsStat" class="stat-value">0</div>
                                    <div class="stat-label">目標レビュー数</div>
                                </div>
                                <div class="stat">
                                    <div id="remainingStat" class="stat-value">0</div>
                                    <div class="stat-label">あと</div>
                                </div>
                            </div>

                            <div id="achievementMessage" class="milestone">
                                📈 目標まであと少し！
                            </div>
                        </div>
                    </div>
                </div>

                <div class="main-actions">
                    <!-- 主要アクション -->
                    <div class="action-group primary-group">
                        <h4 class="action-group-title">📚 書籍管理</h4>
                        <div class="button-row">
                            <button type="button" id="showManualBtn" class="btn btn-secondary">✏️ 手動入力</button>
                            <button type="button" id="showProgressBtn" class="btn btn-secondary" style="display: none;">📊 進捗表示</button>
                        </div>
                    </div>

                    <!-- シェア・データ管理アクション -->
                    <div class="action-group secondary-group">
                        <h4 class="action-group-title">📤 シェア・データ管理</h4>
                        <div class="button-row">
                            <button id="shareBtn" class="btn btn-primary" style="display: none;">📷 スクリーンショット</button>
                            <button id="exportBtn" class="btn btn-secondary">📤 エクスポート</button>
                            <button id="importBtn" class="btn btn-secondary">📥 インポート</button>
                            <input type="file" id="importFile" accept=".json" style="display: none;">
                        </div>
                    </div>

                    <!-- 危険なアクション -->
                    <div class="action-group danger-group">
                        <h4 class="action-group-title">⚠️ システム</h4>
                        <div class="button-row">
                            <button id="clearBtn" class="btn btn-warning">🗑️ データクリア</button>
                        </div>
                    </div>
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

        // 進捗表示ボタン
        document.getElementById('showProgressBtn').addEventListener('click', () => {
            this.toggleProgressDisplay();
        });

        // スクリーンショットボタン
        document.getElementById('shareBtn').addEventListener('click', () => {
            this.takeScreenshot();
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

            // 取得失敗の場合の詳細メッセージ
            if (bookInfo.isMockData || bookInfo.fetchError) {
                const errorDetails = bookInfo.fetchError ? 
                    `\n詳細エラー: ${bookInfo.fetchError}` : 
                    '';
                    
                alert(`⚠️ Amazon から書籍情報を自動取得できませんでした。${errorDetails}\n\n以下の方法で情報を入力できます:\n\n1. 📝「手動入力」ボタンで直接入力\n2. ✏️ 表示された項目をクリックして編集\n3. 🔄 別のAmazon URLで再試行\n\n※ Amazon側のアクセス制限により自動取得が制限される場合があります。`);
                
                // 手動入力セクションを自動で開く
                const manualSection = document.getElementById('manualInputSection');
                if (manualSection && manualSection.style.display === 'none') {
                    this.toggleManualInput();
                }
            }

        } catch (error) {
            console.error('Failed to fetch book info:', error);
            alert(`❌ 書籍情報の取得に失敗しました。\n\n考えられる原因:\n• Amazon URLの形式が正しくない\n• インターネット接続の問題\n• Amazon側のアクセス制限\n\n解決方法:\n• URLを確認してください\n• 「手動入力」で情報を直接入力してください`);
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

        // 自動取得失敗の場合の警告表示
        if (bookInfo.isMockData || !bookInfo.extractionSuccess || bookInfo.fetchError) {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'alert alert-warning';
            
            let warningMessage = '';
            if (bookInfo.isMockData) {
                warningMessage = `
                    <strong>⚠️ Amazon情報の自動取得に失敗しました</strong><br>
                    Amazon側のアクセス制限により情報を取得できませんでした。<br>
                    <small>✏️ タイトルと著者名の横の編集ボタンで修正できます。または「手動入力」をご利用ください。</small>
                `;
            } else if (!bookInfo.extractionSuccess) {
                warningMessage = `
                    <strong>⚠️ 書籍情報の一部を取得できませんでした</strong><br>
                    Amazon ページの構造変更により一部情報が取得できませんでした。<br>
                    <small>✏️ 各項目の編集ボタンで修正してください。</small>
                `;
            }
            
            warningDiv.innerHTML = warningMessage;
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
                
                // 進捗表示ボタンを表示
                const showProgressBtn = document.getElementById('showProgressBtn');
                if (showProgressBtn) {
                    showProgressBtn.style.display = 'inline-block';
                }
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
                
                // 進捗表示ボタンを表示
                const showProgressBtn = document.getElementById('showProgressBtn');
                if (showProgressBtn) {
                    showProgressBtn.style.display = 'inline-block';
                }
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

    /**
     * 進捗表示セクションの表示/非表示を切り替え
     */
    toggleProgressDisplay() {
        const progressSection = document.getElementById('progressSection');
        const showBtn = document.getElementById('showProgressBtn');
        const shareBtn = document.getElementById('shareBtn');
        
        if (!progressSection || !showBtn) return;

        const data = this.storageService.load();
        if (!data || !data.title) {
            alert('📝 まず書籍情報を保存してから進捗を表示してください。');
            return;
        }

        if (progressSection.style.display === 'none') {
            // 進捗データを更新して表示
            this.updateProgressDisplay(data);
            progressSection.style.display = 'block';
            showBtn.textContent = '📁 進捗を閉じる';
            shareBtn.style.display = 'inline-block';
            
            // スムーズスクロール
            progressSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            progressSection.style.display = 'none';
            showBtn.textContent = '📊 進捗表示';
            shareBtn.style.display = 'none';
        }
    }

    /**
     * 進捗表示を更新
     */
    updateProgressDisplay(data) {
        // 書籍情報の表示
        const progressBookImage = document.getElementById('progressBookImage');
        const progressBookTitle = document.getElementById('progressBookTitle');
        const progressBookAuthor = document.getElementById('progressBookAuthor');
        const progressTargetReviews = document.getElementById('progressTargetReviews');
        const progressStretchGoal = document.getElementById('progressStretchGoal');

        if (progressBookImage) {
            progressBookImage.src = data.imageUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150" viewBox="0 0 100 150"><rect width="100" height="150" fill="%23e9ecef"/><text x="50" y="75" text-anchor="middle" font-family="Arial" font-size="12" fill="%236c757d">No Image</text></svg>';
        }
        if (progressBookTitle) progressBookTitle.textContent = data.title || '不明';
        if (progressBookAuthor) progressBookAuthor.textContent = data.author || '不明';
        if (progressTargetReviews) progressTargetReviews.textContent = data.targetReviews || 0;
        
        if (progressStretchGoal && data.stretchGoal) {
            progressStretchGoal.style.display = 'block';
            progressStretchGoal.querySelector('span').textContent = data.stretchGoal;
        } else if (progressStretchGoal) {
            progressStretchGoal.style.display = 'none';
        }

        // 進捗計算
        const progress = this.calculateProgress(data);
        
        // 進捗バーの更新
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        if (progressFill) progressFill.style.width = `${progress.percentage}%`;
        if (progressText) progressText.textContent = `${progress.percentage}%`;

        // 統計の更新
        const currentReviewsStat = document.getElementById('currentReviewsStat');
        const targetReviewsStat = document.getElementById('targetReviewsStat');
        const remainingStat = document.getElementById('remainingStat');
        
        if (currentReviewsStat) currentReviewsStat.textContent = progress.current;
        if (targetReviewsStat) targetReviewsStat.textContent = progress.target;
        if (remainingStat) remainingStat.textContent = progress.remaining;

        // 達成メッセージの更新
        const achievementMessage = document.getElementById('achievementMessage');
        if (achievementMessage) {
            if (progress.achieved) {
                achievementMessage.textContent = '🎉 目標達成おめでとうございます！';
                achievementMessage.className = 'milestone achieved';
            } else if (progress.percentage >= 80) {
                achievementMessage.textContent = '🔥 もうすぐ目標達成です！';
                achievementMessage.className = 'milestone near-completion';
            } else if (progress.percentage >= 50) {
                achievementMessage.textContent = '📈 順調に進んでいます！';
                achievementMessage.className = 'milestone on-track';
            } else {
                achievementMessage.textContent = '💪 目標に向けて頑張りましょう！';
                achievementMessage.className = 'milestone getting-started';
            }
        }
    }

    /**
     * 進捗を計算
     */
    calculateProgress(data) {
        const current = data.reviewCount || 0;
        const target = data.targetReviews || 1;
        
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
     * スクリーンショットを撮影してダウンロード
     */
    async takeScreenshot() {
        const progressSection = document.getElementById('progressSection');
        
        if (!progressSection || progressSection.style.display === 'none') {
            alert('📊 まず進捗表示を開いてからスクリーンショットを撮影してください。');
            return;
        }

        try {
            // HTML2Canvasライブラリが読み込まれているかチェック
            if (typeof html2canvas === 'undefined') {
                alert('📸 スクリーンショット機能を初期化中です...');
                await this.loadHtml2Canvas();
            }

            // スクリーンショット撮影
            const canvas = await html2canvas(progressSection, {
                backgroundColor: '#ffffff',
                scale: 2, // 高解像度
                logging: false,
                useCORS: true,
                allowTaint: true
            });

            // 画像をダウンロード
            const link = document.createElement('a');
            const data = this.storageService.load();
            const filename = `kindle-review-progress-${data.title.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.png`;
            
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();

            // 成功メッセージ
            alert(`📸 スクリーンショットを保存しました！\n\nファイル名: ${filename}\n\nダウンロードフォルダをご確認ください。`);

        } catch (error) {
            console.error('Screenshot failed:', error);
            alert('❌ スクリーンショットの撮影に失敗しました。\n\nブラウザがスクリーンショット機能に対応していない可能性があります。');
        }
    }

    /**
     * HTML2Canvasライブラリを動的に読み込み
     */
    async loadHtml2Canvas() {
        return new Promise((resolve, reject) => {
            if (typeof html2canvas !== 'undefined') {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = () => {
                console.log('✅ HTML2Canvas loaded successfully');
                resolve();
            };
            script.onerror = () => {
                reject(new Error('Failed to load HTML2Canvas library'));
            };
            document.head.appendChild(script);
        });
    }
}