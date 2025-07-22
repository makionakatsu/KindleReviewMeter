/**
 * DOM操作ヘルパーユーティリティ
 *
 * 安全で一貫性のあるDOM操作を提供
 */
export class DOMHelperImpl {
    constructor(debugMode = false) {
        Object.defineProperty(this, "debugMode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.debugMode = debugMode;
    }
    /**
     * 要素を選択
     */
    select(selector) {
        try {
            return document.querySelector(selector);
        }
        catch (error) {
            if (this.debugMode) {
                console.warn(`Invalid selector: ${selector}`, error);
            }
            return null;
        }
    }
    /**
     * 複数の要素を選択
     */
    selectAll(selector) {
        try {
            return Array.from(document.querySelectorAll(selector));
        }
        catch (error) {
            if (this.debugMode) {
                console.warn(`Invalid selector: ${selector}`, error);
            }
            return [];
        }
    }
    /**
     * 要素を作成
     */
    create(tagName, options) {
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
    hide(element) {
        if (element instanceof HTMLElement) {
            element.style.display = 'none';
            element.setAttribute('aria-hidden', 'true');
        }
    }
    /**
     * 要素を表示
     */
    show(element, displayValue = '') {
        if (element instanceof HTMLElement) {
            element.style.display = displayValue;
            element.removeAttribute('aria-hidden');
        }
    }
    /**
     * 要素の表示を切り替え
     */
    toggle(element, force) {
        if (element instanceof HTMLElement) {
            const isHidden = element.style.display === 'none' ||
                element.getAttribute('aria-hidden') === 'true';
            if (force !== undefined) {
                if (force) {
                    this.show(element);
                }
                else {
                    this.hide(element);
                }
            }
            else {
                if (isHidden) {
                    this.show(element);
                }
                else {
                    this.hide(element);
                }
            }
        }
    }
    /**
     * クラスを追加
     */
    addClass(element, ...classNames) {
        element.classList.add(...classNames);
    }
    /**
     * クラスを削除
     */
    removeClass(element, ...classNames) {
        element.classList.remove(...classNames);
    }
    /**
     * クラスを切り替え
     */
    toggleClass(element, className, force) {
        return element.classList.toggle(className, force);
    }
    /**
     * クラスが存在するかチェック
     */
    hasClass(element, className) {
        return element.classList.contains(className);
    }
    /**
     * 属性を設定
     */
    setAttribute(element, name, value) {
        element.setAttribute(name, value);
    }
    /**
     * 属性を取得
     */
    getAttribute(element, name) {
        return element.getAttribute(name);
    }
    /**
     * 属性を削除
     */
    removeAttribute(element, name) {
        element.removeAttribute(name);
    }
    /**
     * データ属性を設定
     */
    setData(element, key, value) {
        if (element instanceof HTMLElement) {
            element.dataset[key] = value;
        }
    }
    /**
     * データ属性を取得
     */
    getData(element, key) {
        if (element instanceof HTMLElement) {
            return element.dataset[key];
        }
        return undefined;
    }
    /**
     * 要素を削除
     */
    remove(element) {
        element.remove();
    }
    /**
     * 子要素をクリア
     */
    clear(element) {
        element.innerHTML = '';
    }
    /**
     * 要素を追加
     */
    append(parent, ...children) {
        parent.append(...children);
    }
    /**
     * 要素を先頭に追加
     */
    prepend(parent, ...children) {
        parent.prepend(...children);
    }
    /**
     * 要素を置換
     */
    replace(oldElement, newElement) {
        oldElement.replaceWith(newElement);
    }
    /**
     * 要素の前に挿入
     */
    insertBefore(newElement, referenceElement) {
        referenceElement.parentNode?.insertBefore(newElement, referenceElement);
    }
    /**
     * 要素の後に挿入
     */
    insertAfter(newElement, referenceElement) {
        referenceElement.parentNode?.insertBefore(newElement, referenceElement.nextSibling);
    }
    /**
     * 親要素を取得
     */
    getParent(element) {
        return element.parentElement;
    }
    /**
     * 子要素を取得
     */
    getChildren(element) {
        return Array.from(element.children);
    }
    /**
     * 兄弟要素を取得
     */
    getSiblings(element) {
        const parent = element.parentElement;
        if (!parent)
            return [];
        return Array.from(parent.children).filter(child => child !== element);
    }
    /**
     * 次の兄弟要素を取得
     */
    getNextSibling(element) {
        return element.nextElementSibling;
    }
    /**
     * 前の兄弟要素を取得
     */
    getPreviousSibling(element) {
        return element.previousElementSibling;
    }
    /**
     * 先祖要素から条件に一致する要素を検索
     */
    closest(element, selector) {
        return element.closest(selector);
    }
    /**
     * 要素が別の要素の子孫かチェック
     */
    contains(parent, child) {
        return parent.contains(child);
    }
    /**
     * 要素の位置とサイズを取得
     */
    getBounds(element) {
        return element.getBoundingClientRect();
    }
    /**
     * 要素をビューポートにスクロール
     */
    scrollIntoView(element, options) {
        element.scrollIntoView(options);
    }
    /**
     * 要素にフォーカス
     */
    focus(element) {
        if (element instanceof HTMLElement) {
            element.focus();
        }
    }
    /**
     * 要素からフォーカスを外す
     */
    blur(element) {
        if (element instanceof HTMLElement) {
            element.blur();
        }
    }
    /**
     * 要素がビューポート内にあるかチェック
     */
    isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth));
    }
    /**
     * 要素が表示されているかチェック
     */
    isVisible(element) {
        if (!(element instanceof HTMLElement))
            return false;
        return !!(element.offsetWidth ||
            element.offsetHeight ||
            element.getClientRects().length);
    }
    setStyle(element, propertyOrStyles, value) {
        if (!(element instanceof HTMLElement))
            return;
        if (typeof propertyOrStyles === 'string') {
            element.style.setProperty(propertyOrStyles, value || '');
        }
        else {
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
    getStyle(element, property) {
        if (!(element instanceof HTMLElement))
            return '';
        return window.getComputedStyle(element).getPropertyValue(property);
    }
    /**
     * アニメーション付きでクラスを追加
     */
    async addClassWithAnimation(element, className, duration = 300) {
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
    async removeClassWithAnimation(element, className, duration = 300) {
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
    async fadeIn(element, duration = 300) {
        if (!(element instanceof HTMLElement))
            return;
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
    async fadeOut(element, duration = 300) {
        if (!(element instanceof HTMLElement))
            return;
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
    async slideDown(element, duration = 300) {
        if (!(element instanceof HTMLElement))
            return;
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
    async slideUp(element, duration = 300) {
        if (!(element instanceof HTMLElement))
            return;
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
    observe(element, callback, options) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(callback);
        }, options);
        observer.observe(element);
        return observer;
    }
    /**
     * 要素のサイズ変更を監視（Resize Observer）
     */
    observeResize(element, callback) {
        const observer = new ResizeObserver((entries) => {
            entries.forEach(callback);
        });
        observer.observe(element);
        return observer;
    }
    /**
     * デバウンス付きイベントリスナー
     */
    addDebouncedEventListener(element, type, listener, delay = 300, options) {
        let timeoutId;
        const debouncedListener = function (event) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                listener.call(this, event);
            }, delay);
        };
        element.addEventListener(type, debouncedListener, options);
        // クリーンアップ関数を返す
        return () => {
            clearTimeout(timeoutId);
            element.removeEventListener(type, debouncedListener, options);
        };
    }
    /**
     * 要素のHTMLを安全に設定（XSS対策）
     */
    setSafeHTML(element, html) {
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
    setSafeText(element, text) {
        element.textContent = text;
    }
    /**
     * 要素をコピー
     */
    clone(element, deep = true) {
        return element.cloneNode(deep);
    }
    /**
     * 要素の完全な削除（イベントリスナーも含む）
     */
    destroy(element) {
        // 子要素も含めて全ての要素からイベントリスナーを削除
        const allElements = [element, ...this.selectAllInContext('*', element)];
        allElements.forEach(el => {
            if (el instanceof HTMLElement) {
                // onXXX形式のイベントハンドラーをクリア
                Object.getOwnPropertyNames(el).forEach(prop => {
                    if (prop.startsWith('on') && typeof el[prop] === 'function') {
                        el[prop] = null;
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
    selectAllInContext(selector, context = document.documentElement) {
        try {
            return Array.from(context.querySelectorAll(selector));
        }
        catch (error) {
            if (this.debugMode) {
                console.warn(`Invalid selector: ${selector}`, error);
            }
            return [];
        }
    }
}
//# sourceMappingURL=DOMHelper.js.map