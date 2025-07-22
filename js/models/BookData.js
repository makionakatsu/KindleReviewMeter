/**
 * 書籍データモデル
 *
 * 【責任範囲】
 * - 書籍情報の状態管理と整合性保証
 * - プログレス計算ロジック（達成率、残り目標等）の実装
 * - データバリデーションと正規化処理
 * - モデルの永続化状態とビューの同期管理
 * - ビジネスルールの実装（目標設定の制約、マイルストーン管理）
 *
 * 【管理データ】
 * - 書籍基本情報：タイトル、著者、URL、書影
 * - レビュー関連：現在数、目標数、ストレッチ目標
 * - メタデータ：最終更新日時、データソース
 *
 * 【計算機能】
 * - 達成率：現在レビュー数 / 目標レビュー数 × 100
 * - プログレス率：グラフ表示用の正規化値
 * - マイルストーン判定：各中間目標の達成状況
 * - 残り目標：目標達成までの必要レビュー数
 *
 * 【データ整合性】
 * - 必須フィールドの検証
 * - 数値範囲の妥当性チェック
 * - 目標値の論理的制約（ストレッチ > 基本目標）
 */
export class BookDataModel {
    constructor(data) {
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.data = this.initializeData(data);
    }
    /**
     * データの初期化
     */
    initializeData(data) {
        const defaultData = {
            bookUrl: '',
            bookTitle: '',
            bookAuthor: '',
            currentReviews: 0,
            targetReviews: 0,
            stretchReviews: 0,
            bookCoverUrl: '',
            lastUpdated: new Date().toISOString(),
        };
        return { ...defaultData, ...data };
    }
    /**
     * 現在のデータを取得
     */
    getData() {
        return { ...this.data };
    }
    /**
     * データを更新
     */
    updateData(updates) {
        this.data = {
            ...this.data,
            ...updates,
            lastUpdated: new Date().toISOString(),
        };
    }
    /**
     * 書籍情報を更新
     */
    updateBookInfo(info) {
        console.log('📚 BookDataModel.updateBookInfo() 開始');
        console.log('📥 入力データ:', info);
        console.log('📊 現在のモデル状態:', {
            bookTitle: this.data.bookTitle,
            bookAuthor: this.data.bookAuthor,
            currentReviews: this.data.currentReviews,
            bookCoverUrl: this.data.bookCoverUrl
        });
        const updates = {};
        if (info.bookTitle !== undefined) {
            updates.bookTitle = info.bookTitle;
            console.log('✏️ タイトル更新:', info.bookTitle);
        }
        if (info.bookAuthor !== undefined) {
            updates.bookAuthor = info.bookAuthor;
            console.log('✏️ 著者名更新:', info.bookAuthor);
        }
        if (info.currentReviews !== undefined) {
            updates.currentReviews = info.currentReviews;
            console.log('✏️ レビュー数更新:', info.currentReviews);
        }
        if (info.bookCoverUrl !== undefined) {
            updates.bookCoverUrl = info.bookCoverUrl;
            console.log('✏️ 書影URL更新:', info.bookCoverUrl);
        }
        console.log('🔄 適用する更新:', updates);
        this.updateData(updates);
        console.log('📤 更新後のモデル状態:', {
            bookTitle: this.data.bookTitle,
            bookAuthor: this.data.bookAuthor,
            currentReviews: this.data.currentReviews,
            bookCoverUrl: this.data.bookCoverUrl
        });
        console.log('✅ BookDataModel.updateBookInfo() 完了');
    }
    /**
     * 進捗データを計算
     */
    calculateProgress() {
        const { currentReviews, targetReviews, stretchReviews } = this.data;
        // 達成率の計算
        const achievementRate = targetReviews > 0
            ? Math.min(Math.round((currentReviews / targetReviews) * 100), 100)
            : 0;
        // 残り数の計算
        const remainingToTarget = Math.max(targetReviews - currentReviews, 0);
        const remainingToStretch = Math.max(stretchReviews - currentReviews, 0);
        // マイルストーンの生成
        const milestones = this.generateMilestones();
        return {
            currentReviews,
            targetReviews,
            stretchReviews,
            achievementRate,
            remainingToTarget,
            remainingToStretch,
            milestones,
            progressPercentage: achievementRate,
        };
    }
    /**
     * マイルストーンを生成
     */
    generateMilestones() {
        const milestones = [];
        const { currentReviews, targetReviews, stretchReviews } = this.data;
        // 目標マイルストーン
        if (targetReviews > 0) {
            milestones.push({
                value: targetReviews,
                icon: '🎁',
                isTarget: true,
                isStretch: false,
                isAchieved: currentReviews >= targetReviews,
                type: 'target',
            });
        }
        // ストレッチ目標マイルストーン
        if (stretchReviews > 0 && stretchReviews > targetReviews) {
            milestones.push({
                value: stretchReviews,
                icon: '🌟',
                isTarget: false,
                isStretch: true,
                isAchieved: currentReviews >= stretchReviews,
                type: 'stretch',
            });
        }
        // 値でソート
        return milestones.sort((a, b) => a.value - b.value);
    }
    /**
     * データが有効かチェック
     */
    isValid() {
        return (this.data.bookTitle.trim().length > 0 &&
            this.data.bookUrl.trim().length > 0 &&
            this.data.targetReviews > 0 &&
            this.data.stretchReviews > this.data.targetReviews);
    }
    /**
     * データが設定済みかチェック
     */
    isConfigured() {
        return this.isValid() && this.data.currentReviews >= 0;
    }
    /**
     * 目標達成状況を取得
     */
    getAchievementStatus() {
        const { currentReviews, targetReviews, stretchReviews } = this.data;
        return {
            targetAchieved: currentReviews >= targetReviews,
            stretchAchieved: currentReviews >= stretchReviews,
            overAchieved: currentReviews > stretchReviews,
        };
    }
    /**
     * 進捗率を取得（ストレッチ目標基準）
     */
    getProgressPercentage() {
        const { currentReviews, stretchReviews } = this.data;
        return stretchReviews > 0
            ? Math.min((currentReviews / stretchReviews) * 100, 100)
            : 0;
    }
    /**
     * JSON形式でエクスポート
     */
    toJSON() {
        return this.getData();
    }
    /**
     * JSONからインポート
     */
    static fromJSON(json) {
        try {
            const data = typeof json === 'string' ? JSON.parse(json) : json;
            return new BookDataModel(data);
        }
        catch (error) {
            throw new Error(`Invalid JSON data: ${error}`);
        }
    }
    /**
     * データをリセット
     */
    reset() {
        this.data = this.initializeData();
    }
    /**
     * 特定のフィールドをクリア
     */
    clearField(field) {
        const updates = {};
        switch (field) {
            case 'bookTitle':
            case 'bookAuthor':
            case 'bookUrl':
            case 'bookCoverUrl':
                updates[field] = '';
                break;
            case 'currentReviews':
            case 'targetReviews':
            case 'stretchReviews':
                updates[field] = 0;
                break;
            default:
                return;
        }
        this.updateData(updates);
    }
    /**
     * データのクローンを作成
     */
    clone() {
        return new BookDataModel(this.data);
    }
    /**
     * 他のBookDataModelと比較
     */
    equals(other) {
        const thisData = this.getData();
        const otherData = other.getData();
        return JSON.stringify(thisData) === JSON.stringify(otherData);
    }
    /**
     * 変更が必要な最小限のフィールドを取得
     */
    getDiff(other) {
        const thisData = this.getData();
        const otherData = other.getData();
        const diff = {};
        Object.keys(thisData).forEach(key => {
            if (thisData[key] !== otherData[key]) {
                diff[key] = thisData[key];
            }
        });
        return diff;
    }
    /**
     * データのサマリーを取得
     */
    getSummary() {
        const { bookTitle, bookAuthor, currentReviews, targetReviews } = this.data;
        const achievementRate = this.calculateProgress().achievementRate;
        let status = 'not_started';
        if (achievementRate >= 100)
            status = 'completed';
        else if (achievementRate > 0)
            status = 'in_progress';
        return {
            title: bookTitle || '未設定',
            author: bookAuthor || '未設定',
            progress: `${currentReviews} / ${targetReviews} (${achievementRate}%)`,
            status,
        };
    }
}
//# sourceMappingURL=BookData.js.map