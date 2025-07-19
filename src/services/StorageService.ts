/**
 * ローカルストレージ管理サービス
 * 
 * ブラウザのlocalStorageを安全に操作し、
 * 型安全性とエラーハンドリングを提供します
 */

import { StorageService, AppError, ErrorCode } from '../types/index.js';

export class LocalStorageService implements StorageService {
  private readonly prefix: string;

  constructor(prefix: string = 'amazonReviewTracker') {
    this.prefix = prefix;
    this.validateStorageAvailability();
  }

  /**
   * ローカルストレージの利用可能性をチェック
   */
  private validateStorageAvailability(): void {
    try {
      const testKey = `${this.prefix}_test`;
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (error) {
      throw this.createError(
        'LOCAL_STORAGE_UNAVAILABLE',
        'ローカルストレージが利用できません',
        { originalError: error }
      );
    }
  }

  /**
   * キーにプレフィックスを付与
   */
  private getFullKey(key: string): string {
    return `${this.prefix}_${key}`;
  }

  /**
   * データを取得
   */
  get<T>(key: string): T | null {
    try {
      const fullKey = this.getFullKey(key);
      const item = localStorage.getItem(fullKey);
      
      if (item === null) {
        return null;
      }

      return JSON.parse(item) as T;
    } catch (error) {
      console.error(`Storage get error for key "${key}":`, error);
      throw this.createError(
        'STORAGE_GET_ERROR',
        `データの取得に失敗しました: ${key}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * データを保存
   */
  set<T>(key: string, value: T): boolean {
    try {
      const fullKey = this.getFullKey(key);
      const serialized = JSON.stringify(value);
      
      localStorage.setItem(fullKey, serialized);
      return true;
    } catch (error) {
      console.error(`Storage set error for key "${key}":`, error);
      
      // QuotaExceededErrorの特別な処理
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw this.createError(
          'STORAGE_QUOTA_EXCEEDED',
          'ストレージ容量が不足しています',
          { key, value, originalError: error }
        );
      }
      
      throw this.createError(
        'STORAGE_SET_ERROR',
        `データの保存に失敗しました: ${key}`,
        { key, value, originalError: error }
      );
    }
  }

  /**
   * データを削除
   */
  remove(key: string): boolean {
    try {
      const fullKey = this.getFullKey(key);
      localStorage.removeItem(fullKey);
      return true;
    } catch (error) {
      console.error(`Storage remove error for key "${key}":`, error);
      throw this.createError(
        'STORAGE_REMOVE_ERROR',
        `データの削除に失敗しました: ${key}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * 全データをクリア（プレフィックス付きのもののみ）
   */
  clear(): boolean {
    try {
      const keysToRemove: string[] = [];
      
      // プレフィックス付きのキーのみを収集
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${this.prefix}_`)) {
          keysToRemove.push(key);
        }
      }
      
      // 収集したキーを削除
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      throw this.createError(
        'STORAGE_CLEAR_ERROR',
        'データのクリアに失敗しました',
        { originalError: error }
      );
    }
  }

  /**
   * キーの存在確認
   */
  exists(key: string): boolean {
    try {
      const fullKey = this.getFullKey(key);
      return localStorage.getItem(fullKey) !== null;
    } catch (error) {
      console.error(`Storage exists check error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * ストレージ使用量を取得（概算）
   */
  getStorageSize(): number {
    try {
      let totalSize = 0;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${this.prefix}_`)) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += key.length + value.length;
          }
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('Storage size calculation error:', error);
      return 0;
    }
  }

  /**
   * プレフィックス付きの全キーを取得
   */
  getAllKeys(): string[] {
    try {
      const keys: string[] = [];
      const prefixLength = `${this.prefix}_`.length;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${this.prefix}_`)) {
          keys.push(key.substring(prefixLength));
        }
      }
      
      return keys;
    } catch (error) {
      console.error('Get all keys error:', error);
      return [];
    }
  }

  /**
   * データのバックアップを作成
   */
  backup(): Record<string, any> {
    try {
      const backup: Record<string, any> = {};
      const keys = this.getAllKeys();
      
      keys.forEach(key => {
        try {
          backup[key] = this.get(key);
        } catch (error) {
          console.warn(`Failed to backup key "${key}":`, error);
        }
      });
      
      return backup;
    } catch (error) {
      console.error('Backup creation error:', error);
      throw this.createError(
        'STORAGE_BACKUP_ERROR',
        'バックアップの作成に失敗しました',
        { originalError: error }
      );
    }
  }

  /**
   * バックアップからデータを復元
   */
  restore(backup: Record<string, any>): boolean {
    try {
      let successCount = 0;
      let errorCount = 0;
      
      Object.entries(backup).forEach(([key, value]) => {
        try {
          this.set(key, value);
          successCount++;
        } catch (error) {
          console.warn(`Failed to restore key "${key}":`, error);
          errorCount++;
        }
      });
      
      if (errorCount > 0) {
        console.warn(`Restoration completed with ${errorCount} errors out of ${successCount + errorCount} items`);
      }
      
      return errorCount === 0;
    } catch (error) {
      console.error('Restoration error:', error);
      throw this.createError(
        'STORAGE_RESTORE_ERROR',
        'バックアップの復元に失敗しました',
        { originalError: error }
      );
    }
  }

  /**
   * エラーオブジェクトを作成
   */
  private createError(code: string, message: string, context?: Record<string, any>): AppError {
    const error = new Error(message) as AppError;
    error.name = 'StorageError';
    error.code = code;
    error.context = context ?? {};
    error.timestamp = Date.now();
    error.recoverable = code !== 'LOCAL_STORAGE_UNAVAILABLE';
    
    return error;
  }
}

/**
 * メモリベースのストレージサービス（テスト用・フォールバック用）
 */
export class MemoryStorageService implements StorageService {
  private storage: Map<string, string> = new Map();
  private readonly prefix: string;

  constructor(prefix: string = 'amazonReviewTracker') {
    this.prefix = prefix;
  }

  private getFullKey(key: string): string {
    return `${this.prefix}_${key}`;
  }

  get<T>(key: string): T | null {
    try {
      const fullKey = this.getFullKey(key);
      const item = this.storage.get(fullKey);
      
      if (item === undefined) {
        return null;
      }

      return JSON.parse(item) as T;
    } catch (error) {
      console.error(`Memory storage get error for key "${key}":`, error);
      return null;
    }
  }

  set<T>(key: string, value: T): boolean {
    try {
      const fullKey = this.getFullKey(key);
      const serialized = JSON.stringify(value);
      
      this.storage.set(fullKey, serialized);
      return true;
    } catch (error) {
      console.error(`Memory storage set error for key "${key}":`, error);
      return false;
    }
  }

  remove(key: string): boolean {
    try {
      const fullKey = this.getFullKey(key);
      return this.storage.delete(fullKey);
    } catch (error) {
      console.error(`Memory storage remove error for key "${key}":`, error);
      return false;
    }
  }

  clear(): boolean {
    try {
      const keysToDelete = Array.from(this.storage.keys())
        .filter(key => key.startsWith(`${this.prefix}_`));
      
      keysToDelete.forEach(key => this.storage.delete(key));
      return true;
    } catch (error) {
      console.error('Memory storage clear error:', error);
      return false;
    }
  }

  exists(key: string): boolean {
    const fullKey = this.getFullKey(key);
    return this.storage.has(fullKey);
  }
}

/**
 * ストレージサービスのファクトリ
 */
export function createStorageService(useMemoryFallback: boolean = true): StorageService {
  try {
    return new LocalStorageService();
  } catch (error) {
    if (useMemoryFallback) {
      console.warn('LocalStorage unavailable, falling back to memory storage:', error);
      return new MemoryStorageService();
    }
    throw error;
  }
}