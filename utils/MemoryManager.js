/**
 * メモリリーク防止マネージャー
 *
 * 【責任範囲】
 * - イベントリスナーの自動クリーンアップ管理
 * - タイマー（setTimeout/setInterval）の確実な停止
 * - DOM参照の弱参照化による循環参照防止
 * - メモリ使用量の監視とリーク検出
 * - ガベージコレクションの最適化支援
 */
import { logger } from './AILogger.js';
export class MemoryManager {
    constructor() {
        Object.defineProperty(this, "eventListeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "timers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "observers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "weakRefs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "memoryCheckInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "memoryHistory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        this.startMemoryMonitoring();
        this.setupPageUnloadCleanup();
    }
    static getInstance() {
        if (!MemoryManager.instance) {
            MemoryManager.instance = new MemoryManager();
        }
        return MemoryManager.instance;
    }
    /**
     * イベントリスナーの追加（自動管理）
     */
    addEventListener(element, event, listener, options) {
        const id = this.generateId();
        element.addEventListener(event, listener, options);
        this.eventListeners.set(id, { element, event, listener, options });
        logger.debug({
            component: 'MemoryManager',
            method: 'addEventListener',
            operation: 'EVENT_LISTENER_ADDED',
            data: {
                listenerId: id,
                event,
                elementTag: element.tagName,
                totalListeners: this.eventListeners.size
            }
        }, `📡 EVENT_LISTENER_ADDED: ${event} on ${element.tagName}`, ['memory', 'event', 'add']);
        return id;
    }
    /**
     * イベントリスナーの削除
     */
    removeEventListener(id) {
        const listener = this.eventListeners.get(id);
        if (!listener)
            return false;
        listener.element.removeEventListener(listener.event, listener.listener, listener.options);
        this.eventListeners.delete(id);
        logger.debug({
            component: 'MemoryManager',
            method: 'removeEventListener',
            operation: 'EVENT_LISTENER_REMOVED',
            data: {
                listenerId: id,
                event: listener.event,
                remainingListeners: this.eventListeners.size
            }
        }, `🗑️ EVENT_LISTENER_REMOVED: ${listener.event}`, ['memory', 'event', 'remove']);
        return true;
    }
    /**
     * タイマーの作成（自動管理）
     */
    setTimeout(callback, delay) {
        const id = this.generateId();
        const timerId = window.setTimeout(() => {
            callback();
            this.timers.delete(id); // 自動クリーンアップ
        }, delay);
        this.timers.set(id, {
            type: 'timeout',
            id: timerId,
            callback: callback.toString().substring(0, 100)
        });
        logger.debug({
            component: 'MemoryManager',
            method: 'setTimeout',
            operation: 'TIMER_CREATED',
            data: {
                managedId: id,
                delay,
                totalTimers: this.timers.size
            }
        }, `⏰ TIMER_CREATED: setTimeout(${delay}ms)`, ['memory', 'timer', 'timeout']);
        return id;
    }
    /**
     * インターバルの作成（自動管理）
     */
    setInterval(callback, interval) {
        const id = this.generateId();
        const timerId = window.setInterval(callback, interval);
        this.timers.set(id, {
            type: 'interval',
            id: timerId,
            callback: callback.toString().substring(0, 100)
        });
        logger.debug({
            component: 'MemoryManager',
            method: 'setInterval',
            operation: 'INTERVAL_CREATED',
            data: {
                managedId: id,
                interval,
                totalTimers: this.timers.size
            }
        }, `🔄 INTERVAL_CREATED: setInterval(${interval}ms)`, ['memory', 'timer', 'interval']);
        return id;
    }
    /**
     * タイマーの停止
     */
    clearTimer(id) {
        const timer = this.timers.get(id);
        if (!timer)
            return false;
        if (timer.type === 'timeout') {
            clearTimeout(timer.id);
        }
        else {
            clearInterval(timer.id);
        }
        this.timers.delete(id);
        logger.debug({
            component: 'MemoryManager',
            method: 'clearTimer',
            operation: 'TIMER_CLEARED',
            data: {
                managedId: id,
                type: timer.type,
                remainingTimers: this.timers.size
            }
        }, `🛑 TIMER_CLEARED: ${timer.type}`, ['memory', 'timer', 'clear']);
        return true;
    }
    /**
     * Observer の追加（自動管理）
     */
    addObserver(observer, target) {
        const id = this.generateId();
        this.observers.set(id, { observer, target });
        logger.debug({
            component: 'MemoryManager',
            method: 'addObserver',
            operation: 'OBSERVER_ADDED',
            data: {
                observerId: id,
                type: observer.constructor.name,
                totalObservers: this.observers.size
            }
        }, `👁️ OBSERVER_ADDED: ${observer.constructor.name}`, ['memory', 'observer', 'add']);
        return id;
    }
    /**
     * Observer の削除
     */
    removeObserver(id) {
        const observer = this.observers.get(id);
        if (!observer)
            return false;
        observer.observer.disconnect();
        this.observers.delete(id);
        logger.debug({
            component: 'MemoryManager',
            method: 'removeObserver',
            operation: 'OBSERVER_REMOVED',
            data: {
                observerId: id,
                remainingObservers: this.observers.size
            }
        }, `🗑️ OBSERVER_REMOVED`, ['memory', 'observer', 'remove']);
        return true;
    }
    /**
     * 弱参照の追加（循環参照防止）
     */
    addWeakRef(object) {
        // WeakRef is not available in all environments, use simple reference
        const weakRef = object;
        this.weakRefs.add(weakRef);
        logger.debug({
            component: 'MemoryManager',
            method: 'addWeakRef',
            operation: 'WEAK_REF_ADDED',
            data: {
                objectType: object.constructor.name,
                totalWeakRefs: this.weakRefs.size
            }
        }, `🔗 WEAK_REF_ADDED: ${object.constructor.name}`, ['memory', 'weakref', 'add']);
        return weakRef;
    }
    /**
     * 全リソースのクリーンアップ
     */
    cleanup() {
        const startTime = performance.now();
        // イベントリスナークリーンアップ
        const eventCount = this.eventListeners.size;
        this.eventListeners.forEach((listener, id) => {
            listener.element.removeEventListener(listener.event, listener.listener, listener.options);
        });
        this.eventListeners.clear();
        // タイマークリーンアップ
        const timerCount = this.timers.size;
        this.timers.forEach((timer) => {
            if (timer.type === 'timeout') {
                clearTimeout(timer.id);
            }
            else {
                clearInterval(timer.id);
            }
        });
        this.timers.clear();
        // Observer クリーンアップ
        const observerCount = this.observers.size;
        this.observers.forEach((observer) => {
            observer.observer.disconnect();
        });
        this.observers.clear();
        // 弱参照クリーンアップ
        this.cleanupWeakRefs();
        // メモリ監視停止
        if (this.memoryCheckInterval) {
            clearInterval(this.memoryCheckInterval);
            this.memoryCheckInterval = null;
        }
        const executionTime = performance.now() - startTime;
        logger.info({
            component: 'MemoryManager',
            method: 'cleanup',
            operation: 'FULL_CLEANUP',
            data: {
                clearedEvents: eventCount,
                clearedTimers: timerCount,
                clearedObservers: observerCount,
                executionTime
            }
        }, `🧹 FULL_CLEANUP: ${eventCount + timerCount + observerCount} resources cleared (${executionTime.toFixed(2)}ms)`, ['memory', 'cleanup', 'complete']);
    }
    /**
     * メモリリーク疑いのあるリソースを検出
     */
    detectSuspiciousLeaks() {
        const suspects = [];
        const now = Date.now();
        // 長時間残っているイベントリスナー
        this.eventListeners.forEach((listener, id) => {
            const idParts = id.split('_');
            const age = idParts.length > 1 ? now - parseInt(idParts[1] || '0') : 0;
            if (age > 300000) { // 5分以上
                suspects.push({
                    type: 'event',
                    id,
                    element: listener.element,
                    age
                });
            }
        });
        // 長時間動作しているタイマー
        this.timers.forEach((timer, id) => {
            const idParts = id.split('_');
            const age = idParts.length > 1 ? now - parseInt(idParts[1] || '0') : 0;
            if (timer.type === 'interval' && age > 600000) { // 10分以上のインターバル
                suspects.push({
                    type: 'timer',
                    id,
                    age
                });
            }
        });
        // 無効化されていない Observer
        this.observers.forEach((observer, id) => {
            const idParts = id.split('_');
            const age = idParts.length > 1 ? now - parseInt(idParts[1] || '0') : 0;
            if (age > 300000) { // 5分以上
                suspects.push({
                    type: 'observer',
                    id,
                    age
                });
            }
        });
        if (suspects.length > 0) {
            logger.warn({
                component: 'MemoryManager',
                method: 'detectSuspiciousLeaks',
                operation: 'LEAK_SUSPECTS_FOUND',
                data: {
                    suspectCount: suspects.length,
                    suspects: suspects.map(s => ({ type: s.type, age: s.age }))
                }
            }, `⚠️ LEAK_SUSPECTS_FOUND: ${suspects.length} potential memory leaks detected`, ['memory', 'leak', 'detection']);
        }
        return suspects;
    }
    /**
     * 現在のメモリ使用状況を取得
     */
    getMemoryInfo() {
        if (!('memory' in performance)) {
            return null;
        }
        const memory = performance.memory;
        return {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            timestamp: Date.now()
        };
    }
    startMemoryMonitoring() {
        if (!('memory' in performance)) {
            logger.warn({
                component: 'MemoryManager',
                method: 'startMemoryMonitoring',
                operation: 'MEMORY_API_UNAVAILABLE'
            }, '⚠️ MEMORY_API_UNAVAILABLE: Performance memory API not available', ['memory', 'monitoring', 'unavailable']);
            return;
        }
        this.memoryCheckInterval = window.setInterval(() => {
            const memInfo = this.getMemoryInfo();
            if (memInfo) {
                this.memoryHistory.push(memInfo);
                // 履歴を最新100件に制限
                if (this.memoryHistory.length > 100) {
                    this.memoryHistory.shift();
                }
                // メモリ使用量の急激な増加を検出
                if (this.memoryHistory.length > 10) {
                    const recent = this.memoryHistory.slice(-10);
                    const recentLast = recent[recent.length - 1];
                    const recentFirst = recent[0];
                    const growth = (recentLast?.usedJSHeapSize || 0) - (recentFirst?.usedJSHeapSize || 0);
                    const growthRate = growth / (recentFirst?.usedJSHeapSize || 1);
                    if (growthRate > 0.5) { // 50%以上の増加
                        logger.warn({
                            component: 'MemoryManager',
                            method: 'memoryMonitoring',
                            operation: 'MEMORY_GROWTH_DETECTED',
                            data: {
                                growth,
                                growthRate: (growthRate * 100).toFixed(2) + '%',
                                currentUsage: memInfo.usedJSHeapSize,
                                suspects: this.detectSuspiciousLeaks().length
                            }
                        }, `📈 MEMORY_GROWTH_DETECTED: ${(growthRate * 100).toFixed(2)}% growth in 10 samples`, ['memory', 'growth', 'warning']);
                    }
                }
            }
        }, 30000); // 30秒間隔
    }
    cleanupWeakRefs() {
        const before = this.weakRefs.size;
        this.weakRefs.forEach(ref => {
            if (ref.deref() === undefined) {
                this.weakRefs.delete(ref);
            }
        });
        const cleaned = before - this.weakRefs.size;
        if (cleaned > 0) {
            logger.debug({
                component: 'MemoryManager',
                method: 'cleanupWeakRefs',
                operation: 'WEAK_REFS_CLEANED',
                data: { cleaned, remaining: this.weakRefs.size }
            }, `🗑️ WEAK_REFS_CLEANED: ${cleaned} garbage collected references`, ['memory', 'weakref', 'cleanup']);
        }
    }
    setupPageUnloadCleanup() {
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        window.addEventListener('pagehide', () => {
            this.cleanup();
        });
    }
    generateId() {
        return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
// シングルトンインスタンス
export const memoryManager = MemoryManager.getInstance();
//# sourceMappingURL=MemoryManager.js.map