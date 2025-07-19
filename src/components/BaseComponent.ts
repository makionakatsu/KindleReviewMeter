/**
 * ベースコンポーネントクラス
 * 
 * 全てのUIコンポーネントの基底クラス
 * ライフサイクル管理、イベント処理、DOM操作を提供
 */

import { Component, Lifecycle, EventEmitter, ApplicationContext } from '../types/index.js';

export abstract class BaseComponent {
  public readonly id: string;
  public readonly element: HTMLElement;
  protected context: ApplicationContext;
  protected eventEmitter: EventEmitter;
  protected destroyed: boolean = false;
  protected mounted: boolean = false;

  constructor(container: HTMLElement, context: ApplicationContext, id?: string) {
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
  private generateId(): string {
    return `${this.constructor.name.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * コンポーネントの初期化
   */
  async initialize(): Promise<void> {
    if (this.destroyed) {
      throw new Error(`Component ${this.id} is already destroyed`);
    }

    try {
      await this.onInit?.();
      this.render();
      await this.onMount?.();
      this.mounted = true;
      
      console.log(`✅ Component ${this.constructor.name} (${this.id}) initialized`);
    } catch (error) {
      console.error(`❌ Failed to initialize component ${this.id}:`, error);
      throw error;
    }
  }

  /**
   * レンダリング（サブクラスで実装）
   */
  abstract render(): void;

  /**
   * データ更新
   */
  async update(data?: any): Promise<void> {
    if (this.destroyed) {
      console.warn(`Cannot update destroyed component ${this.id}`);
      return;
    }

    try {
      await this.onUpdate?.(data);
      this.render();
    } catch (error) {
      console.error(`Failed to update component ${this.id}:`, error);
      this.handleError(error as Error);
    }
  }

  /**
   * コンポーネントの破棄
   */
  async destroy(): Promise<void> {
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
    } catch (error) {
      console.error(`Failed to destroy component ${this.id}:`, error);
    }
  }

  /**
   * イベントリスナーを追加
   */
  protected addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.element.addEventListener(type, listener, options);
    this.trackEventListener(type, listener);
  }

  /**
   * 子要素にイベントリスナーを追加
   */
  protected addEventListenerToChild(
    selector: string,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    const element = this.element.querySelector(selector) as HTMLElement;
    if (element) {
      element.addEventListener(type, listener, options);
      this.trackEventListener(type, listener, element);
    } else {
      console.warn(`Element not found for selector: ${selector}`);
    }
  }

  /**
   * 複数の子要素にイベントリスナーを追加
   */
  protected addEventListenerToChildren(
    selector: string,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    const elements = this.element.querySelectorAll(selector) as NodeListOf<HTMLElement>;
    elements.forEach(element => {
      element.addEventListener(type, listener, options);
      this.trackEventListener(type, listener, element);
    });
  }

  /**
   * カスタムイベントを発行
   */
  protected emitEvent<T = any>(eventType: string, payload?: T): void {
    this.eventEmitter.emit(eventType, {
      componentId: this.id,
      componentType: this.constructor.name,
      ...payload,
    });
  }

  /**
   * カスタムイベントを購読
   */
  protected subscribeToEvent<T = any>(eventType: string, handler: (payload: T) => void): void {
    const wrappedHandler = (event: any) => handler(event.payload);
    this.eventEmitter.on(eventType, wrappedHandler);
    this.trackCustomEventListener(eventType, wrappedHandler);
  }

  /**
   * DOM要素を作成
   */
  protected createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: {
      className?: string;
      textContent?: string;
      attributes?: Record<string, string>;
      innerHTML?: string;
    }
  ): HTMLElementTagNameMap[K] {
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
  protected select<T extends Element = Element>(selector: string): T | null {
    return this.element.querySelector<T>(selector);
  }

  /**
   * 複数の要素を選択
   */
  protected selectAll<T extends Element = Element>(selector: string): T[] {
    return Array.from(this.element.querySelectorAll<T>(selector));
  }

  /**
   * 要素の表示/非表示を切り替え
   */
  protected toggle(element: HTMLElement, show?: boolean): void {
    if (show === undefined) {
      element.style.display = element.style.display === 'none' ? '' : 'none';
    } else {
      element.style.display = show ? '' : 'none';
    }
  }

  /**
   * 要素を表示
   */
  protected show(element: HTMLElement): void {
    element.style.display = '';
  }

  /**
   * 要素を非表示
   */
  protected hide(element: HTMLElement): void {
    element.style.display = 'none';
  }

  /**
   * クラスの追加/削除
   */
  protected toggleClass(element: HTMLElement, className: string, force?: boolean): void {
    element.classList.toggle(className, force);
  }

  /**
   * エラーハンドリング
   */
  protected handleError(error: Error): void {
    console.error(`Component ${this.id} error:`, error);
    this.emitEvent('component:error', {
      error: error.message,
      stack: error.stack,
    });
  }

  /**
   * ローディング状態の管理
   */
  protected setLoading(loading: boolean): void {
    this.toggleClass(this.element, 'loading', loading);
    this.element.setAttribute('aria-busy', loading.toString());
  }

  /**
   * エラー状態の管理
   */
  protected setError(error: string | null): void {
    this.toggleClass(this.element, 'error', !!error);
    
    if (error) {
      this.element.setAttribute('aria-invalid', 'true');
      this.element.setAttribute('data-error', error);
    } else {
      this.element.removeAttribute('aria-invalid');
      this.element.removeAttribute('data-error');
    }
  }

  /**
   * バリデーション状態の管理
   */
  protected setValid(valid: boolean): void {
    this.toggleClass(this.element, 'valid', valid);
    this.toggleClass(this.element, 'invalid', !valid);
    this.element.setAttribute('aria-invalid', (!valid).toString());
  }

  // イベントリスナー追跡用
  private eventListeners: Array<{
    element: HTMLElement;
    type: string;
    listener: EventListener;
  }> = [];

  private customEventListeners: Array<{
    eventType: string;
    handler: Function;
  }> = [];

  /**
   * イベントリスナーを追跡
   */
  private trackEventListener(type: string, listener: EventListener, element: HTMLElement = this.element): void {
    this.eventListeners.push({ element, type, listener });
  }

  /**
   * カスタムイベントリスナーを追跡
   */
  private trackCustomEventListener(eventType: string, handler: Function): void {
    this.customEventListeners.push({ eventType, handler });
  }

  /**
   * 全てのイベントリスナーを削除
   */
  private removeAllEventListeners(): void {
    // DOM イベントリスナーを削除
    this.eventListeners.forEach(({ element, type, listener }) => {
      element.removeEventListener(type, listener);
    });
    this.eventListeners = [];

    // カスタムイベントリスナーを削除
    this.customEventListeners.forEach(({ eventType, handler }) => {
      this.eventEmitter.off(eventType, handler as any);
    });
    this.customEventListeners = [];
  }

  /**
   * デバッグ情報を取得
   */
  public getDebugInfo(): Record<string, any> {
    return {
      id: this.id,
      type: this.constructor.name,
      mounted: this.mounted,
      destroyed: this.destroyed,
      eventListeners: this.eventListeners.length,
      customEventListeners: this.customEventListeners.length,
      elementClasses: Array.from(this.element.classList),
      elementAttributes: Object.fromEntries(
        Array.from(this.element.attributes).map(attr => [attr.name, attr.value])
      ),
    };
  }

  // ライフサイクルメソッド（サブクラスでオーバーライド可能）
  protected async onInit?(): Promise<void>;
  protected async onMount?(): Promise<void>;
  protected async onUpdate?(data?: any): Promise<void>;
  protected async onUnmount?(): Promise<void>;
  protected async onDestroy?(): Promise<void>;
}