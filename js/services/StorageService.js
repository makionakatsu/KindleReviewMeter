/**
 * ローカルストレージ管理サービス
 */
export class StorageService {
    constructor() {
        this.storageKey = 'amazonReviewTracker';
    }

    /**
     * データを保存
     */
    save(data) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Failed to save data:', error);
            return false;
        }
    }

    /**
     * データを読み込み
     */
    load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Failed to load data:', error);
            return null;
        }
    }

    /**
     * データを削除
     */
    clear() {
        try {
            localStorage.removeItem(this.storageKey);
            return true;
        } catch (error) {
            console.error('Failed to clear data:', error);
            return false;
        }
    }

    /**
     * データが存在するかチェック
     */
    exists() {
        return localStorage.getItem(this.storageKey) !== null;
    }
}