/**
 * イベントエミッターシステム
 * 
 * アプリケーション全体のイベント駆動通信を管理
 */

import { EventEmitter, EventListener, AppEvent } from '../types/index.js';

export class ApplicationEventEmitter implements EventEmitter {
  private listeners: Map<string, Set<EventListener>> = new Map();
  private onceListeners: Map<string, Set<EventListener>> = new Map();
  private eventHistory: AppEvent[] = [];
  private maxHistorySize: number = 100;
  private debugMode: boolean = false;

  constructor(options: { 
    maxHistorySize?: number; 
    debugMode?: boolean; 
  } = {}) {
    this.maxHistorySize = options.maxHistorySize || 100;
    this.debugMode = options.debugMode || false;
  }

  /**
   * イベントリスナーを登録
   */
  on<T = any>(eventType: string, listener: EventListener<T>): void {
    this.validateEventType(eventType);
    this.validateListener(listener);

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType)!.add(listener as EventListener);

    if (this.debugMode) {
      console.log(`📡 Event listener registered: ${eventType}`);
    }
  }

  /**
   * 一度だけ実行されるイベントリスナーを登録
   */
  once<T = any>(eventType: string, listener: EventListener<T>): void {
    this.validateEventType(eventType);
    this.validateListener(listener);

    if (!this.onceListeners.has(eventType)) {
      this.onceListeners.set(eventType, new Set());
    }

    this.onceListeners.get(eventType)!.add(listener as EventListener);

    if (this.debugMode) {
      console.log(`📡 One-time event listener registered: ${eventType}`);
    }
  }

  /**
   * イベントリスナーを削除
   */
  off<T = any>(eventType: string, listener: EventListener<T>): void {
    this.validateEventType(eventType);
    this.validateListener(listener);

    // 通常のリスナーから削除
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener as EventListener);
      if (listeners.size === 0) {
        this.listeners.delete(eventType);
      }
    }

    // once リスナーからも削除
    const onceListeners = this.onceListeners.get(eventType);
    if (onceListeners) {
      onceListeners.delete(listener as EventListener);
      if (onceListeners.size === 0) {
        this.onceListeners.delete(eventType);
      }
    }

    if (this.debugMode) {
      console.log(`📡 Event listener removed: ${eventType}`);
    }
  }

  /**
   * 特定イベントタイプの全リスナーを削除
   */
  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.validateEventType(eventType);
      this.listeners.delete(eventType);
      this.onceListeners.delete(eventType);
      
      if (this.debugMode) {
        console.log(`📡 All listeners removed for: ${eventType}`);
      }
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
      
      if (this.debugMode) {
        console.log('📡 All event listeners removed');
      }
    }
  }

  /**
   * イベントを発行
   */
  emit<T = any>(eventType: string, payload?: T): void {
    this.validateEventType(eventType);

    const event: AppEvent = {
      type: eventType,
      payload,
      timestamp: Date.now(),
      source: this.getCallerInfo(),
    };

    // イベント履歴に追加
    this.addToHistory(event);

    if (this.debugMode) {
      console.log(`🚀 Event emitted: ${eventType}`, payload);
    }

    // 通常のリスナーを実行
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      this.executeListeners(listeners, { ...event, payload: payload || {} });
    }

    // once リスナーを実行して削除
    const onceListeners = this.onceListeners.get(eventType);
    if (onceListeners) {
      this.executeListeners(onceListeners, { ...event, payload: payload || {} });
      this.onceListeners.delete(eventType);
    }

    // グローバルリスナー（'*'）があれば実行
    const globalListeners = this.listeners.get('*');
    if (globalListeners) {
      this.executeListeners(globalListeners, { ...event, payload: payload || {} });
    }
  }

  /**
   * 非同期でイベントを発行
   */
  async emitAsync<T = any>(eventType: string, payload?: T): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.emit(eventType, payload);
        // 次のティックで resolve
        setTimeout(resolve, 0);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 条件付きでイベントを発行
   */
  emitIf<T = any>(
    condition: boolean | (() => boolean),
    eventType: string,
    payload?: T
  ): void {
    const shouldEmit = typeof condition === 'function' ? condition() : condition;
    if (shouldEmit) {
      this.emit(eventType, payload);
    }
  }

  /**
   * 遅延してイベントを発行
   */
  emitAfter<T = any>(
    delay: number,
    eventType: string,
    payload?: T
  ): NodeJS.Timeout {
    return setTimeout(() => {
      this.emit(eventType, payload);
    }, delay);
  }

  /**
   * イベントリスナーの実行
   */
  private executeListeners(listeners: Set<EventListener>, event: AppEvent & { payload: any }): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error(`Error in event listener for ${event.type}:`, error);
        
        // エラーイベントを発行（無限ループを避けるため条件付き）
        if (event.type !== 'error:listener') {
          this.emit('error:listener', {
            originalEvent: event,
            error: error instanceof Error ? error : new Error(String(error)),
            listener: listener.toString(),
          });
        }
      }
    }
  }

  /**
   * イベント履歴に追加
   */
  private addToHistory(event: AppEvent): void {
    this.eventHistory.unshift(event);
    
    // 履歴サイズを制限
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * 呼び出し元の情報を取得
   */
  private getCallerInfo(): string {
    try {
      const stack = new Error().stack;
      if (stack) {
        const lines = stack.split('\n');
        // emit を呼び出した関数の情報を取得（3番目の行）
        const callerLine = lines[3] || 'unknown';
        const match = callerLine.match(/at\s+(.+?)\s+\(/);
        return match?.[1] ?? 'unknown';
      }
    } catch {
      // スタックトレース取得に失敗した場合
    }
    return 'unknown';
  }

  /**
   * イベントタイプのバリデーション
   */
  private validateEventType(eventType: string): void {
    if (typeof eventType !== 'string' || eventType.trim() === '') {
      throw new Error('Event type must be a non-empty string');
    }
  }

  /**
   * リスナーのバリデーション
   */
  private validateListener(listener: EventListener): void {
    if (typeof listener !== 'function') {
      throw new Error('Event listener must be a function');
    }
  }

  /**
   * 登録されているリスナー数を取得
   */
  getListenerCount(eventType?: string): number {
    if (eventType) {
      const regular = this.listeners.get(eventType)?.size || 0;
      const once = this.onceListeners.get(eventType)?.size || 0;
      return regular + once;
    }

    let total = 0;
    for (const listeners of this.listeners.values()) {
      total += listeners.size;
    }
    for (const listeners of this.onceListeners.values()) {
      total += listeners.size;
    }
    return total;
  }

  /**
   * 登録されているイベントタイプ一覧を取得
   */
  getEventTypes(): string[] {
    const types = new Set<string>();
    
    for (const type of this.listeners.keys()) {
      types.add(type);
    }
    for (const type of this.onceListeners.keys()) {
      types.add(type);
    }
    
    return Array.from(types).sort();
  }

  /**
   * イベント履歴を取得
   */
  getEventHistory(eventType?: string, limit?: number): AppEvent[] {
    let history = eventType 
      ? this.eventHistory.filter(event => event.type === eventType)
      : this.eventHistory;

    if (limit && limit > 0) {
      history = history.slice(0, limit);
    }

    return [...history];
  }

  /**
   * イベント統計を取得
   */
  getEventStats(): { type: string; count: number; lastEmitted?: number }[] {
    const stats = new Map<string, { count: number; lastEmitted?: number }>();

    for (const event of this.eventHistory) {
      const current = stats.get(event.type) || { count: 0 };
      stats.set(event.type, {
        count: current.count + 1,
        lastEmitted: Math.max(current.lastEmitted || 0, event.timestamp),
      });
    }

    return Array.from(stats.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * イベント履歴をクリア
   */
  clearHistory(): void {
    this.eventHistory = [];
    
    if (this.debugMode) {
      console.log('📡 Event history cleared');
    }
  }

  /**
   * デバッグモードの切り替え
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    console.log(`📡 Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * パフォーマンス統計を取得
   */
  getPerformanceStats(): {
    totalEvents: number;
    totalListeners: number;
    averageEventsPerSecond: number;
    memoryUsage: number;
  } {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const recentEvents = this.eventHistory.filter(
      event => event.timestamp > oneSecondAgo
    );

    return {
      totalEvents: this.eventHistory.length,
      totalListeners: this.getListenerCount(),
      averageEventsPerSecond: recentEvents.length,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * メモリ使用量の推定
   */
  private estimateMemoryUsage(): number {
    try {
      return JSON.stringify({
        listeners: Array.from(this.listeners.keys()),
        onceListeners: Array.from(this.onceListeners.keys()),
        eventHistory: this.eventHistory,
      }).length * 2; // 文字列の推定バイト数
    } catch {
      return 0;
    }
  }

  /**
   * リソースのクリーンアップ
   */
  destroy(): void {
    this.removeAllListeners();
    this.clearHistory();
    
    if (this.debugMode) {
      console.log('📡 EventEmitter destroyed');
    }
  }

  /**
   * デバッグ情報を取得
   */
  getDebugInfo(): Record<string, any> {
    return {
      eventTypes: this.getEventTypes(),
      listenerCounts: Object.fromEntries(
        this.getEventTypes().map(type => [type, this.getListenerCount(type)])
      ),
      eventStats: this.getEventStats().slice(0, 10),
      performance: this.getPerformanceStats(),
      recentEvents: this.getEventHistory(undefined, 5),
    };
  }
}