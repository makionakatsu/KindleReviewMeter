/**
 * ベースコンポーネントクラス
 *
 * 【責任範囲】
 * - 全コンポーネントの基底クラスとして統一されたライフサイクル管理を提供
 * - DOM操作の共通メソッド（要素選択、スタイル変更、イベントハンドリング）を提供
 * - アプリケーションコンテキスト（ストレージ、サービス、イベントエミッター）へのアクセスを管理
 * - 初期化（onInit）、破棄（onDestroy）のライフサイクルフックを定義
 * - エラーハンドリングの統一化とロギング機能を提供
 *
 * 【設計原則】
 * - 単一責任：各コンポーネントは特定のUI領域とその状態管理のみに責任を持つ
 * - 疎結合：依存性注入によりサービス層との結合度を下げる
 * - 再利用性：共通のDOM操作やイベント処理を基底クラスで標準化
 *
 * 【使用パターン】
 * 継承して具体的なコンポーネント（BookInfoForm、ProgressViewer等）を作成
 */
import { domBatcher } from '../utils/DOMBatcher.js';
import { logger } from '../utils/AILogger.js';
import { memoryManager } from '../utils/MemoryManager.js';
export class BaseComponent {
    constructor(container, context, id) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "element", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "context", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "eventEmitter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "destroyed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "mounted", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "managedEventListeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "managedTimers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "managedObservers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        // イベントリスナー追跡用
        Object.defineProperty(this, "eventListeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "customEventListeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        this.id = id || this.generateId();
        this.element = container;
        this.context = context;
        this.eventEmitter = context.eventEmitter;
        // 基本的なセットアップ
        this.element.setAttribute('data-component-id', this.id);
        this.element.setAttribute('data-component-type', this.constructor.name);
    }
    /**
     * ユニークIDを生成
     */
    generateId() {
        return `${this.constructor.name.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * コンポーネントの初期化
     */
    async initialize() {
        if (this.destroyed) {
            throw new Error(`Component ${this.id} is already destroyed`);
        }
        try {
            await this.onInit?.();
            this.render();
            await this.onMount?.();
            this.mounted = true;
            console.log(`✅ Component ${this.constructor.name} (${this.id}) initialized`);
        }
        catch (error) {
            console.error(`❌ Failed to initialize component ${this.id}:`, error);
            throw error;
        }
    }
    /**
     * データ更新
     */
    async update(data) {
        if (this.destroyed) {
            console.warn(`Cannot update destroyed component ${this.id}`);
            return;
        }
        try {
            await this.onUpdate?.(data);
            this.render();
        }
        catch (error) {
            console.error(`Failed to update component ${this.id}:`, error);
            this.handleError(error);
        }
    }
    /**
     * コンポーネントの破棄
     */
    async destroy() {
        if (this.destroyed) {
            return;
        }
        try {
            await this.onUnmount?.();
            this.removeAllEventListeners();
            await this.onDestroy?.();
            this.destroyed = true;
            this.mounted = false;
            console.log(`🗑️ Component ${this.constructor.name} (${this.id}) destroyed`);
        }
        catch (error) {
            console.error(`Failed to destroy component ${this.id}:`, error);
        }
    }
    /**
     * イベントリスナーを追加
     */
    addEventListener(type, listener, options) {
        this.element.addEventListener(type, listener, options);
        this.trackEventListener(type, listener);
    }
    /**
     * 子要素にイベントリスナーを追加
     */
    addEventListenerToChild(selector, type, listener, options) {
        const element = this.element.querySelector(selector);
        if (element) {
            element.addEventListener(type, listener, options);
            this.trackEventListener(type, listener, element);
        }
        else {
            console.warn(`Element not found for selector: ${selector}`);
        }
    }
    /**
     * 複数の子要素にイベントリスナーを追加
     */
    addEventListenerToChildren(selector, type, listener, options) {
        const elements = this.element.querySelectorAll(selector);
        elements.forEach(element => {
            element.addEventListener(type, listener, options);
            this.trackEventListener(type, listener, element);
        });
    }
    /**
     * カスタムイベントを発行
     */
    emitEvent(eventType, payload) {
        this.eventEmitter.emit(eventType, {
            componentId: this.id,
            componentType: this.constructor.name,
            ...payload,
        });
    }
    /**
     * カスタムイベントを購読
     */
    subscribeToEvent(eventType, handler) {
        const wrappedHandler = (event) => handler(event.payload);
        this.eventEmitter.on(eventType, wrappedHandler);
        this.trackCustomEventListener(eventType, wrappedHandler);
    }
    /**
     * DOM要素を作成
     */
    createElement(tagName, options) {
        const element = document.createElement(tagName);
        if (options?.className) {
            element.className = options.className;
        }
        if (options?.textContent) {
            element.textContent = options.textContent;
        }
        if (options?.innerHTML) {
            element.innerHTML = options.innerHTML;
        }
        if (options?.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        return element;
    }
    /**
     * 要素を選択
     */
    select(selector) {
        return this.element.querySelector(selector);
    }
    /**
     * 複数の要素を選択
     */
    selectAll(selector) {
        return Array.from(this.element.querySelectorAll(selector));
    }
    /**
     * 要素の表示/非表示を切り替え（パフォーマンス最適化）
     */
    toggle(element, show) {
        domBatcher.setStyle(element, 'display', show ? '' : 'none', 'normal');
    }
    /**
     * 要素を表示（パフォーマンス最適化）
     */
    show(element) {
        domBatcher.setStyle(element, 'display', '', 'normal');
    }
    /**
     * 要素を非表示（パフォーマンス最適化）
     */
    hide(element) {
        domBatcher.setStyle(element, 'display', 'none', 'normal');
    }
    /**
     * クラスの追加/削除（パフォーマンス最適化）
     */
    addClass(element, className) {
        domBatcher.toggleClass(element, className, true, 'normal');
    }
    /**
     * クラスの削除（パフォーマンス最適化）
     */
    removeClass(element, className) {
        domBatcher.toggleClass(element, className, false, 'normal');
    }
    /**
     * テキスト設定（パフォーマンス最適化）
     */
    setText(element, text) {
        domBatcher.setText(element, text, 'normal');
    }
    /**
     * 複数DOM操作のバッチ実行
     */
    batchDOMOperations(operations) {
        const startTime = performance.now();
        operations();
        const metrics = domBatcher.flush();
        logger.performance(this.constructor.name, 'BATCH_DOM_OPERATIONS', performance.now() - startTime, {
            batchMetrics: metrics,
            component: this.constructor.name
        });
    }
    /**
     * メモリ管理対応イベントリスナー追加
     */
    addManagedEventListener(element, event, listener, options) {
        const id = memoryManager.addEventListener(element, event, listener, options);
        this.managedEventListeners.push(id);
    }
    /**
     * メモリ管理対応タイマー作成
     */
    setManagedTimeout(callback, delay) {
        const id = memoryManager.setTimeout(callback, delay);
        this.managedTimers.push(id);
        return id;
    }
    /**
     * メモリ管理対応インターバル作成
     */
    setManagedInterval(callback, interval) {
        const id = memoryManager.setInterval(callback, interval);
        this.managedTimers.push(id);
        return id;
    }
    /**
     * メモリ管理対応Observer追加
     */
    addManagedObserver(observer, target) {
        const id = memoryManager.addObserver(observer, target);
        this.managedObservers.push(id);
        return id;
    }
    /**
     * コンポーネント固有リソースの完全クリーンアップ
     */
    cleanupResources() {
        logger.debug({
            component: this.constructor.name,
            method: 'cleanupResources',
            operation: 'COMPONENT_CLEANUP_START',
            data: {
                eventListeners: this.managedEventListeners.length,
                timers: this.managedTimers.length,
                observers: this.managedObservers.length
            }
        }, `🧹 COMPONENT_CLEANUP_START: ${this.constructor.name}`, ['memory', 'cleanup', 'component']);
        // イベントリスナー清理
        this.managedEventListeners.forEach(id => {
            memoryManager.removeEventListener(id);
        });
        this.managedEventListeners = [];
        // タイマー清理
        this.managedTimers.forEach(id => {
            memoryManager.clearTimer(id);
        });
        this.managedTimers = [];
        // Observer 清理
        this.managedObservers.forEach(id => {
            memoryManager.removeObserver(id);
        });
        this.managedObservers = [];
        logger.info({
            component: this.constructor.name,
            method: 'cleanupResources',
            operation: 'COMPONENT_CLEANUP_COMPLETE'
        }, `✅ COMPONENT_CLEANUP_COMPLETE: ${this.constructor.name}`, ['memory', 'cleanup', 'complete']);
    }
    /**
     * ライフサイクル: コンポーネント破棄時の処理
     */
    async onDestroy() {
        if (this.destroyed)
            return;
        logger.info({
            component: this.constructor.name,
            method: 'onDestroy',
            operation: 'LIFECYCLE_DESTROY'
        }, `💀 LIFECYCLE_DESTROY: ${this.constructor.name}`, ['lifecycle', 'destroy']);
        this.destroyed = true;
        this.cleanupResources();
    }
    /**
     * クラスの追加/削除
     */
    toggleClass(element, className, force) {
        domBatcher.toggleClass(element, className, force !== undefined ? force : true, 'normal');
    }
    /**
     * エラーハンドリング
     */
    handleError(error) {
        console.error(`Component ${this.id} error:`, error);
        this.emitEvent('component:error', {
            error: error.message,
            stack: error.stack,
        });
    }
    /**
     * ローディング状態の管理
     */
    setLoading(loading) {
        this.toggleClass(this.element, 'loading', loading);
        this.element.setAttribute('aria-busy', loading.toString());
    }
    /**
     * エラー状態の管理
     */
    setError(error) {
        this.toggleClass(this.element, 'error', !!error);
        if (error) {
            this.element.setAttribute('aria-invalid', 'true');
            this.element.setAttribute('data-error', error);
        }
        else {
            this.element.removeAttribute('aria-invalid');
            this.element.removeAttribute('data-error');
        }
    }
    /**
     * バリデーション状態の管理
     */
    setValid(valid) {
        this.toggleClass(this.element, 'valid', valid);
        this.toggleClass(this.element, 'invalid', !valid);
        this.element.setAttribute('aria-invalid', (!valid).toString());
    }
    /**
     * イベントリスナーを追跡
     */
    trackEventListener(type, listener, element = this.element) {
        this.eventListeners.push({ element, type, listener });
    }
    /**
     * カスタムイベントリスナーを追跡
     */
    trackCustomEventListener(eventType, handler) {
        this.customEventListeners.push({ eventType, handler });
    }
    /**
     * 全てのイベントリスナーを削除
     */
    removeAllEventListeners() {
        // DOM イベントリスナーを削除
        this.eventListeners.forEach(({ element, type, listener }) => {
            element.removeEventListener(type, listener);
        });
        this.eventListeners = [];
        // カスタムイベントリスナーを削除
        this.customEventListeners.forEach(({ eventType, handler }) => {
            this.eventEmitter.off(eventType, handler);
        });
        this.customEventListeners = [];
    }
    /**
     * デバッグ情報を取得
     */
    getDebugInfo() {
        return {
            id: this.id,
            type: this.constructor.name,
            mounted: this.mounted,
            destroyed: this.destroyed,
            eventListeners: this.eventListeners.length,
            customEventListeners: this.customEventListeners.length,
            elementClasses: Array.from(this.element.classList),
            elementAttributes: Object.fromEntries(Array.from(this.element.attributes).map(attr => [attr.name, attr.value])),
        };
    }
}
//# sourceMappingURL=BaseComponent.js.map