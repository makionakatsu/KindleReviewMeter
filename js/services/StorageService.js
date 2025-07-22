/**
 * ローカルストレージ管理サービス
 */
export class StorageService {
    constructor() {
        this.storageKey = 'amazonReviewTracker';
        this.isStorageAvailable = this.checkStorageAvailability();
    }

    /**
     * ローカルストレージの利用可能性をチェック
     */
    checkStorageAvailability() {
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (error) {
            console.warn('LocalStorage is not available:', error);
            return false;
        }
    }

    /**
     * データを保存
     */
    save(data) {
        if (!this.isStorageAvailable) {
            console.warn('LocalStorage not available, using fallback');
            this.fallbackData = data;
            return true;
        }
        
        try {
            const serializedData = JSON.stringify(data);
            
            // データサイズをチェック（5MB制限）
            if (serializedData.length > 5 * 1024 * 1024) {
                throw new Error('Data too large for localStorage');
            }
            
            localStorage.setItem(this.storageKey, serializedData);
            console.log('✅ Data saved successfully');
            return true;
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.error('Storage quota exceeded');
                alert('ストレージ容量が不足しています。不要なデータを削除してください。');
            } else {
                console.error('Failed to save data:', error);
            }
            return false;
        }
    }

    /**
     * データを読み込み
     */
    load() {
        if (!this.isStorageAvailable) {
            return this.fallbackData || null;
        }
        
        try {
            const data = localStorage.getItem(this.storageKey);
            if (!data) return null;
            
            const parsed = JSON.parse(data);
            
            // データの整合性をチェック
            if (parsed && typeof parsed === 'object') {
                return parsed;
            } else {
                console.warn('Invalid data format found, clearing storage');
                this.clear();
                return null;
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            // 破損したデータを削除
            this.clear();
            return null;
        }
    }

    /**
     * データを削除
     */
    clear() {
        if (!this.isStorageAvailable) {
            this.fallbackData = null;
            return true;
        }
        
        try {
            localStorage.removeItem(this.storageKey);
            console.log('✅ Data cleared successfully');
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
        if (!this.isStorageAvailable) {
            return this.fallbackData !== null && this.fallbackData !== undefined;
        }
        
        return localStorage.getItem(this.storageKey) !== null;
    }

    /**
     * ストレージ使用量を取得
     */
    getStorageInfo() {
        if (!this.isStorageAvailable) {
            return { available: false, used: 0, total: 0 };
        }
        
        try {
            let used = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    used += localStorage[key].length + key.length;
                }
            }
            
            return {
                available: true,
                used: used,
                total: 5 * 1024 * 1024, // 5MB approximation
                percentage: Math.round((used / (5 * 1024 * 1024)) * 100)
            };
        } catch (error) {
            console.error('Failed to get storage info:', error);
            return { available: false, used: 0, total: 0 };
        }
    }

    /**
     * データをJSONファイルとしてエクスポート
     */
    exportData() {
        try {
            const data = this.load();
            if (!data) {
                throw new Error('エクスポートするデータがありません');
            }

            // メタデータを追加
            const exportData = {
                version: '1.0',
                exported_at: new Date().toISOString(),
                app_name: 'Amazon書籍レビュー数トラッカー',
                data: data
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            
            // ファイル名を生成（日付付き）
            const today = new Date().toISOString().split('T')[0];
            const filename = `kindle_review_meter_backup_${today}.json`;
            
            // ダウンロードを開始
            this.downloadFile(blob, filename);
            
            console.log('✅ Data exported successfully');
            return { success: true, filename: filename };
            
        } catch (error) {
            console.error('❌ Failed to export data:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * JSONファイルからデータをインポート
     */
    async importData(file) {
        try {
            if (!file || file.type !== 'application/json') {
                throw new Error('JSONファイルを選択してください');
            }

            const fileContent = await this.readFileContent(file);
            const importData = JSON.parse(fileContent);
            
            // データ構造の検証
            if (!importData.data || typeof importData.data !== 'object') {
                throw new Error('無効なデータ形式です');
            }

            const data = importData.data;
            
            // 基本的なデータ検証
            if (!data.title && !data.author) {
                throw new Error('有効な書籍データが見つかりません');
            }

            // 現在のデータをバックアップ
            const currentData = this.load();
            
            // 新しいデータを保存
            const saved = this.save(data);
            if (!saved) {
                throw new Error('データの保存に失敗しました');
            }

            console.log('✅ Data imported successfully');
            return { 
                success: true, 
                data: data,
                backup: currentData,
                imported_at: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Failed to import data:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * ファイル内容を読み取り
     */
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsText(file);
        });
    }

    /**
     * ファイルダウンロードを実行
     */
    downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // メモリ解放
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
}