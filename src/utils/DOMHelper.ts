/**
 * DOM操作ヘルパーユーティリティ
 * 
 * 安全で一貫性のあるDOM操作を提供
 */

import { DOMHelper } from '../types/index.js';

export class DOMHelperImpl implements DOMHelper {
  private readonly debugMode: boolean;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
  }

  /**
   * 要素を選択
   */
  select<T extends Element = Element>(selector: string): T | null {
    try {
      return document.querySelector<T>(selector);
    } catch (error) {
      if (this.debugMode) {
        console.warn(`Invalid selector: ${selector}`, error);
      }
      return null;
    }
  }

  /**
   * 複数の要素を選択
   */
  selectAll<T extends Element = Element>(selector: string): T[] {
    try {
      return Array.from(document.querySelectorAll<T>(selector));
    } catch (error) {
      if (this.debugMode) {
        console.warn(`Invalid selector: ${selector}`, error);
      }
      return [];
    }
  }

  /**
   * 要素を作成
   */
  create<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: {
      className?: string;
      textContent?: string;
      attributes?: Record<string, string>;
      innerHTML?: string;
      dataset?: Record<string, string>;
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

    if (options?.dataset) {
      Object.entries(options.dataset).forEach(([key, value]) => {
        element.dataset[key] = value;
      });
    }

    return element;
  }

  /**
   * 要素を非表示
   */
  hide(element: Element): void {
    if (element instanceof HTMLElement) {
      element.style.display = 'none';
      element.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * 要素を表示
   */
  show(element: Element, displayValue: string = ''): void {
    if (element instanceof HTMLElement) {
      element.style.display = displayValue;
      element.removeAttribute('aria-hidden');
    }
  }

  /**
   * 要素の表示を切り替え
   */
  toggle(element: Element, force?: boolean): void {
    if (element instanceof HTMLElement) {
      const isHidden = element.style.display === 'none' || 
                      element.getAttribute('aria-hidden') === 'true';
      
      if (force !== undefined) {
        if (force) {
          this.show(element);
        } else {
          this.hide(element);
        }
      } else {
        if (isHidden) {
          this.show(element);
        } else {
          this.hide(element);
        }
      }
    }
  }

  /**
   * クラスを追加
   */
  addClass(element: Element, ...classNames: string[]): void {
    element.classList.add(...classNames);
  }

  /**
   * クラスを削除
   */
  removeClass(element: Element, ...classNames: string[]): void {
    element.classList.remove(...classNames);
  }

  /**
   * クラスを切り替え
   */
  toggleClass(element: Element, className: string, force?: boolean): boolean {
    return element.classList.toggle(className, force);
  }

  /**
   * クラスが存在するかチェック
   */
  hasClass(element: Element, className: string): boolean {
    return element.classList.contains(className);
  }

  /**
   * 属性を設定
   */
  setAttribute(element: Element, name: string, value: string): void {
    element.setAttribute(name, value);
  }

  /**
   * 属性を取得
   */
  getAttribute(element: Element, name: string): string | null {
    return element.getAttribute(name);
  }

  /**
   * 属性を削除
   */
  removeAttribute(element: Element, name: string): void {
    element.removeAttribute(name);
  }

  /**
   * データ属性を設定
   */
  setData(element: Element, key: string, value: string): void {
    if (element instanceof HTMLElement) {
      element.dataset[key] = value;
    }
  }

  /**
   * データ属性を取得
   */
  getData(element: Element, key: string): string | undefined {
    if (element instanceof HTMLElement) {
      return element.dataset[key];
    }
    return undefined;
  }

  /**
   * 要素を削除
   */
  remove(element: Element): void {
    element.remove();
  }

  /**
   * 子要素をクリア
   */
  clear(element: Element): void {
    element.innerHTML = '';
  }

  /**
   * 要素を追加
   */
  append(parent: Element, ...children: (Element | string)[]): void {
    parent.append(...children);
  }

  /**
   * 要素を先頭に追加
   */
  prepend(parent: Element, ...children: (Element | string)[]): void {
    parent.prepend(...children);
  }

  /**
   * 要素を置換
   */
  replace(oldElement: Element, newElement: Element): void {
    oldElement.replaceWith(newElement);
  }

  /**
   * 要素の前に挿入
   */
  insertBefore(newElement: Element, referenceElement: Element): void {
    referenceElement.parentNode?.insertBefore(newElement, referenceElement);
  }

  /**
   * 要素の後に挿入
   */
  insertAfter(newElement: Element, referenceElement: Element): void {
    referenceElement.parentNode?.insertBefore(newElement, referenceElement.nextSibling);
  }

  /**
   * 親要素を取得
   */
  getParent(element: Element): Element | null {
    return element.parentElement;
  }

  /**
   * 子要素を取得
   */
  getChildren(element: Element): Element[] {
    return Array.from(element.children);
  }

  /**
   * 兄弟要素を取得
   */
  getSiblings(element: Element): Element[] {
    const parent = element.parentElement;
    if (!parent) return [];
    
    return Array.from(parent.children).filter(child => child !== element);
  }

  /**
   * 次の兄弟要素を取得
   */
  getNextSibling(element: Element): Element | null {
    return element.nextElementSibling;
  }

  /**
   * 前の兄弟要素を取得
   */
  getPreviousSibling(element: Element): Element | null {
    return element.previousElementSibling;
  }

  /**
   * 先祖要素から条件に一致する要素を検索
   */
  closest(element: Element, selector: string): Element | null {
    return element.closest(selector);
  }

  /**
   * 要素が別の要素の子孫かチェック
   */
  contains(parent: Element, child: Element): boolean {
    return parent.contains(child);
  }

  /**
   * 要素の位置とサイズを取得
   */
  getBounds(element: Element): DOMRect {
    return element.getBoundingClientRect();
  }

  /**
   * 要素をビューポートにスクロール
   */
  scrollIntoView(element: Element, options?: ScrollIntoViewOptions): void {
    element.scrollIntoView(options);
  }

  /**
   * 要素にフォーカス
   */
  focus(element: Element): void {
    if (element instanceof HTMLElement) {
      element.focus();
    }
  }

  /**
   * 要素からフォーカスを外す
   */
  blur(element: Element): void {
    if (element instanceof HTMLElement) {
      element.blur();
    }
  }

  /**
   * 要素がビューポート内にあるかチェック
   */
  isInViewport(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  /**
   * 要素が表示されているかチェック
   */
  isVisible(element: Element): boolean {
    if (!(element instanceof HTMLElement)) return false;
    
    return !!(
      element.offsetWidth ||
      element.offsetHeight ||
      element.getClientRects().length
    );
  }

  /**
   * CSSスタイルを設定
   */
  setStyle(element: Element, property: string, value: string): void;
  setStyle(element: Element, styles: Partial<CSSStyleDeclaration>): void;
  setStyle(
    element: Element,
    propertyOrStyles: string | Partial<CSSStyleDeclaration>,
    value?: string
  ): void {
    if (!(element instanceof HTMLElement)) return;

    if (typeof propertyOrStyles === 'string') {
      element.style.setProperty(propertyOrStyles, value || '');
    } else {
      Object.entries(propertyOrStyles).forEach(([prop, val]) => {
        if (val !== undefined) {
          element.style.setProperty(prop, String(val));
        }
      });
    }
  }

  /**
   * CSSスタイルを取得
   */
  getStyle(element: Element, property: string): string {
    if (!(element instanceof HTMLElement)) return '';
    
    return window.getComputedStyle(element).getPropertyValue(property);
  }

  /**
   * アニメーション付きでクラスを追加
   */
  async addClassWithAnimation(
    element: Element,
    className: string,
    duration: number = 300
  ): Promise<void> {
    return new Promise((resolve) => {
      this.addClass(element, className);
      
      setTimeout(() => {
        resolve();
      }, duration);
    });
  }

  /**
   * アニメーション付きでクラスを削除
   */
  async removeClassWithAnimation(
    element: Element,
    className: string,
    duration: number = 300
  ): Promise<void> {
    return new Promise((resolve) => {
      this.removeClass(element, className);
      
      setTimeout(() => {
        resolve();
      }, duration);
    });
  }

  /**
   * フェードイン
   */
  async fadeIn(element: Element, duration: number = 300): Promise<void> {
    if (!(element instanceof HTMLElement)) return;

    return new Promise((resolve) => {
      element.style.opacity = '0';
      element.style.display = '';
      element.style.transition = `opacity ${duration}ms ease-in-out`;

      // 次のフレームで透明度を変更
      requestAnimationFrame(() => {
        element.style.opacity = '1';
        
        setTimeout(() => {
          element.style.transition = '';
          resolve();
        }, duration);
      });
    });
  }

  /**
   * フェードアウト
   */
  async fadeOut(element: Element, duration: number = 300): Promise<void> {
    if (!(element instanceof HTMLElement)) return;

    return new Promise((resolve) => {
      element.style.transition = `opacity ${duration}ms ease-in-out`;
      element.style.opacity = '0';

      setTimeout(() => {
        element.style.display = 'none';
        element.style.transition = '';
        element.style.opacity = '';
        resolve();
      }, duration);
    });
  }

  /**
   * スライドダウン
   */
  async slideDown(element: Element, duration: number = 300): Promise<void> {
    if (!(element instanceof HTMLElement)) return;

    return new Promise((resolve) => {
      const height = element.scrollHeight;
      element.style.height = '0';
      element.style.overflow = 'hidden';
      element.style.display = '';
      element.style.transition = `height ${duration}ms ease-in-out`;

      requestAnimationFrame(() => {
        element.style.height = `${height}px`;

        setTimeout(() => {
          element.style.height = '';
          element.style.overflow = '';
          element.style.transition = '';
          resolve();
        }, duration);
      });
    });
  }

  /**
   * スライドアップ
   */
  async slideUp(element: Element, duration: number = 300): Promise<void> {
    if (!(element instanceof HTMLElement)) return;

    return new Promise((resolve) => {
      element.style.height = `${element.scrollHeight}px`;
      element.style.overflow = 'hidden';
      element.style.transition = `height ${duration}ms ease-in-out`;

      requestAnimationFrame(() => {
        element.style.height = '0';

        setTimeout(() => {
          element.style.display = 'none';
          element.style.height = '';
          element.style.overflow = '';
          element.style.transition = '';
          resolve();
        }, duration);
      });
    });
  }

  /**
   * 要素を監視（Intersection Observer）
   */
  observe(
    element: Element,
    callback: (entry: IntersectionObserverEntry) => void,
    options?: IntersectionObserverInit
  ): IntersectionObserver {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(callback);
    }, options);

    observer.observe(element);
    return observer;
  }

  /**
   * 要素のサイズ変更を監視（Resize Observer）
   */
  observeResize(
    element: Element,
    callback: (entry: ResizeObserverEntry) => void
  ): ResizeObserver {
    const observer = new ResizeObserver((entries) => {
      entries.forEach(callback);
    });

    observer.observe(element);
    return observer;
  }

  /**
   * デバウンス付きイベントリスナー
   */
  addDebouncedEventListener<K extends keyof HTMLElementEventMap>(
    element: Element,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    delay: number = 300,
    options?: boolean | AddEventListenerOptions
  ): () => void {
    let timeoutId: NodeJS.Timeout;

    const debouncedListener = function(this: HTMLElement, event: HTMLElementEventMap[K]) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        listener.call(this, event);
      }, delay);
    };

    element.addEventListener(type, debouncedListener as EventListener, options);

    // クリーンアップ関数を返す
    return () => {
      clearTimeout(timeoutId);
      element.removeEventListener(type, debouncedListener as EventListener, options);
    };
  }

  /**
   * 要素のHTMLを安全に設定（XSS対策）
   */
  setSafeHTML(element: Element, html: string): void {
    // 基本的なサニタイゼーション
    const sanitized = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '');

    element.innerHTML = sanitized;
  }

  /**
   * 要素のテキストを安全に設定
   */
  setSafeText(element: Element, text: string): void {
    element.textContent = text;
  }

  /**
   * 要素をコピー
   */
  clone(element: Element, deep: boolean = true): Element {
    return element.cloneNode(deep) as Element;
  }

  /**
   * 要素の完全な削除（イベントリスナーも含む）
   */
  destroy(element: Element): void {
    // 子要素も含めて全ての要素からイベントリスナーを削除
    const allElements = [element, ...this.selectAllInContext('*', element)];
    
    allElements.forEach(el => {
      if (el instanceof HTMLElement) {
        // onXXX形式のイベントハンドラーをクリア
        Object.getOwnPropertyNames(el).forEach(prop => {
          if (prop.startsWith('on') && typeof (el as any)[prop] === 'function') {
            (el as any)[prop] = null;
          }
        });
      }
    });

    // DOM から削除
    element.remove();
  }

  /**
   * 特定のコンテキスト内で要素を選択
   */
  private selectAllInContext<T extends Element = Element>(
    selector: string,
    context: Element = document.documentElement
  ): T[] {
    try {
      return Array.from(context.querySelectorAll<T>(selector));
    } catch (error) {
      if (this.debugMode) {
        console.warn(`Invalid selector: ${selector}`, error);
      }
      return [];
    }
  }
}