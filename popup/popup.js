/**
 * Chrome Extension Popup Script for Kindle Review Meter
 * Optimized for Manifest V3 and Content Security Policy compliance
 * 
 * This file contains the main popup logic for the Chrome extension, handling:
 * - User interface interactions
 * - Amazon book data fetching and processing
 * - Data storage and retrieval
 * - Image generation for social media sharing
 * - X (Twitter) posting integration
 */

/**
 * StorageService - Chrome Extension Storage Service
 * 
 * Responsibilities:
 * - Manage persistent storage of book data using Chrome Storage API
 * - Provide fallback to localStorage for testing environments
 * - Handle storage errors gracefully
 * - Ensure data consistency across extension components
 * 
 * Key Features:
 * - Cross-platform storage abstraction
 * - Error handling with detailed logging
 * - Support for both Chrome extension and web contexts
 */
class StorageService {
  constructor(key = 'kindleReviewMeter') {
    this.storageKey = key;
  }

  handleStorageError(operation, error) {
    console.error(`Storage ${operation} failed:`, error);
    return operation === 'save' || operation === 'clear' ? false : null;
  }

  async save(data) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ [this.storageKey]: data });
      } else {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
      }
      return true;
    } catch (error) {
      return this.handleStorageError('save', error);
    }
  }

  async load() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get([this.storageKey]);
        return result[this.storageKey] || null;
      } else {
        const data = localStorage.getItem(this.storageKey);
        return data ? JSON.parse(data) : null;
      }
    } catch (error) {
      return this.handleStorageError('load', error);
    }
  }

  async clear() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.remove([this.storageKey]);
      } else {
        localStorage.removeItem(this.storageKey);
      }
      return true;
    } catch (error) {
      return this.handleStorageError('clear', error);
    }
  }
}

/**
 * ToastService - User Notification System
 * 
 * Responsibilities:
 * - Display contextual notifications to users
 * - Manage toast lifecycle (creation, display, dismissal)
 * - Provide consistent UI feedback across the application
 * - Handle different notification types (success, error, warning, info)
 * 
 * Key Features:
 * - Customizable appearance and duration
 * - Auto-dismissal with configurable timing
 * - Manual dismissal via close button
 * - Animation support for smooth user experience
 * - Queue management for multiple notifications
 */
class ToastService {
  constructor() {
    this.container = null;
    this.toasts = [];
    this.init();
  }

  init() {
    this.container = document.getElementById('toast-container');
  }

  show(message, type = 'info', options = {}) {
    const {
      title = this.getDefaultTitle(type),
      duration = 4000,
      closable = true
    } = options;

    const toast = this.createToast(message, type, title, closable);
    this.container.appendChild(toast);
    
    this.toasts.push(toast);
    
    // Animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(toast);
      }, duration);
    }

    return toast;
  }

  createToast(message, type, title, closable) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = this.getIcon(type);
    
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">${icon}</div>
        <div class="toast-body">
          <div class="toast-title">${title}</div>
          <div class="toast-message">${message}</div>
        </div>
        ${closable ? '<button class="toast-close" aria-label="Close">×</button>' : ''}
      </div>
    `;

    // Close button event
    if (closable) {
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', () => this.dismiss(toast));
    }

    return toast;
  }

  dismiss(toast) {
    if (!toast || !toast.parentNode) return;

    const index = this.toasts.indexOf(toast);
    if (index > -1) {
      this.toasts.splice(index, 1);
    }

    toast.classList.add('removing');
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  getDefaultTitle(type) {
    const titles = {
      success: '成功',
      error: 'エラー',
      warning: '警告',
      info: '情報'
    };
    return titles[type] || '通知';
  }

  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || 'ℹ';
  }

  success(message, options = {}) {
    return this.show(message, 'success', options);
  }

  error(message, options = {}) {
    return this.show(message, 'error', options);
  }

  warning(message, options = {}) {
    return this.show(message, 'warning', options);
  }

  info(message, options = {}) {
    return this.show(message, 'info', options);
  }
}

/**
 * App - Main Application Controller
 * 
 * Responsibilities:
 * - Orchestrate all popup functionality and user interactions
 * - Manage application lifecycle (initialization, data loading, cleanup)
 * - Coordinate between StorageService and ToastService
 * - Handle Amazon book data fetching and processing
 * - Manage image generation and social media sharing workflows
 * - Process user input validation and form management
 * 
 * Key Features:
 * - Amazon URL normalization and validation
 * - Automatic and manual data saving
 * - Progress image generation for social media
 * - X (Twitter) integration with automatic image attachment
 * - Comprehensive error handling and user feedback
 * - Visual feedback with animations and transitions
 * 
 * Data Flow:
 * 1. User inputs Amazon URL → fetchAmazonData() → populateBookData() → auto-save
 * 2. User clicks save → saveData() → StorageService persistence
 * 3. User clicks export → exportProgressImage() → Background script → Image generation
 * 4. User clicks X share → shareToX() → Background script → Image + Tweet creation
 */
class App {
  constructor() {
    this.storage = new StorageService();
    this.toast = new ToastService();
    this.init();
  }

  async init() {
    console.log('App initializing...');
    this.bindEvents();
    await this.loadData();
    await this.checkPendingUrl();
    
    // Welcome message
    setTimeout(() => {
      this.toast.info('Chrome拡張版 Kindle Review Meter へようこそ！', {
        title: 'ようこそ',
        duration: 4000
      });
    }, 500);
    
    console.log('App initialized successfully');
  }

  // Debug method to check current state
  async debugCurrentState() {
    console.log('=== DEBUG: Current State ===');
    const data = await this.storage.load();
    console.log('Storage data:', data);
    
    // Check form values
    const formData = {
      amazonUrl: document.getElementById('amazonUrl')?.value,
      title: document.getElementById('title')?.value,
      author: document.getElementById('author')?.value,
      imageUrl: document.getElementById('imageUrl')?.value,
      reviewCount: document.getElementById('reviewCount')?.value,
      targetReviews: document.getElementById('targetReviews')?.value
    };
    console.log('Form data:', formData);
    
    // Check if export button exists
    const exportBtn = document.getElementById('exportBtn');
    console.log('Export button exists:', !!exportBtn);
    console.log('Export button:', exportBtn);
    
    return { storageData: data, formData, hasExportBtn: !!exportBtn };
  }

  async checkPendingUrl() {
    // Check if there's a pending URL from context menu
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.local.get(['pendingUrl']);
        if (result.pendingUrl) {
          document.getElementById('amazonUrl').value = result.pendingUrl;
          // Clear the pending URL
          await chrome.storage.local.remove(['pendingUrl']);
        }
      } catch (error) {
        console.error('Failed to check pending URL:', error);
      }
    }
  }

  bindEvents() {
    const buttons = [
      { id: 'fetchAmazonBtn', handler: () => this.fetchAmazonData(), name: 'Fetch' },
      { id: 'saveBtn', handler: () => this.saveData(), name: 'Save' },
      { id: 'clearBtn', handler: () => this.clearData(), name: 'Clear' },
      { id: 'exportBtn', handler: () => this.exportProgressImage(), name: 'Export' },
      { id: 'shareToXBtn', handler: () => this.shareToX(), name: 'Share to X' }
    ];

    buttons.forEach(({ id, handler, name }) => {
      const button = document.getElementById(id);
      if (button) {
        button.addEventListener('click', () => {
          console.log(`${name} button clicked`);
          handler();
        });
        console.log(`${name} button event bound`);
      } else {
        console.error(`${name} button not found`);
      }
    });

    // Auto-save Associate ID on input with debounce
    const associateInput = document.getElementById('associateTag');
    if (associateInput) {
      const debounced = this.debounce(async () => {
        await this.saveAssociateId(associateInput.value.trim());
      }, 500);
      associateInput.addEventListener('input', debounced);
      console.log('Associate ID auto-save binding set');
    }

    // Associate URL Toggle functionality
    const associateToggle = document.getElementById('associateEnabled');
    const associateContainer = document.getElementById('associateInputContainer');
    if (associateToggle && associateContainer) {
      associateToggle.addEventListener('change', async () => {
        await this.handleAssociateToggle();
      });
      console.log('Associate toggle event bound');
    }
  }

  /**
   * Amazon Book Data Fetching
   * 
   * Fetches book information from Amazon product pages via background script.
   * Includes URL validation, normalization, and automatic data saving.
   * 
   * Process:
   * 1. Validate and normalize Amazon URL
   * 2. Send fetch request to background script
   * 3. Populate UI with retrieved data
   * 4. Auto-save data to storage
   * 5. Provide user feedback
   */
  async fetchAmazonData() {
    const urlInput = document.getElementById('amazonUrl');
    const fetchBtn = document.getElementById('fetchAmazonBtn');
    const url = urlInput.value.trim();

    if (!url) {
      this.toast.warning('Amazon URLを入力してください', {
        title: '入力が必要です'
      });
      this.animateInputError('amazonUrl');
      return;
    }

    // Basic URL validation (detailed validation and normalization done in background)
    if (!url.includes('amazon')) {
      this.toast.error('有効なAmazon書籍URLを入力してください。\n例: https://www.amazon.co.jp/dp/XXXXXXXXXX', {
        title: 'URL形式エラー',
        duration: 6000
      });
      this.animateInputError('amazonUrl');
      return;
    }

    fetchBtn.classList.add('loading');
    fetchBtn.disabled = true;

    try {
      this.toast.info('Amazon商品ページから情報を取得中...', {
        title: 'データ取得中',
        duration: 3000
      });

      // Send message to background script for Amazon scraping
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        const response = await chrome.runtime.sendMessage({
          action: 'fetchAmazonData',
          url: url
        });

        if (response && response.success && response.data) {
          this.populateBookData(response.data);
          
          // Show normalized URL if different from input
          if (response.data.normalizedUrl && response.data.normalizedUrl !== url) {
            urlInput.value = response.data.normalizedUrl;
            this.toast.info('URLを正規化しました', {
              title: '情報',
              duration: 3000
            });
          }
          
          // 自動取得完了後に自動保存
          await this.saveData();
          
          this.toast.success(`「${response.data.title}」の情報を取得・保存しました`, {
            title: '取得・保存完了',
            duration: 5000
          });
        } else {
          throw new Error(response?.error || '書籍情報の取得に失敗しました');
        }
      } else {
        // Fallback for testing without extension context
        throw new Error('Chrome拡張機能コンテキストが必要です');
      }
    } catch (error) {
      this.handleError('Amazon data fetch', error);
    } finally {
      fetchBtn.classList.remove('loading');
      fetchBtn.disabled = false;
    }
  }



  populateBookData(bookData) {
    const fields = [
      { id: 'title', value: bookData.title },
      { id: 'author', value: bookData.author },
      { id: 'imageUrl', value: bookData.imageUrl },
      { id: 'reviewCount', value: bookData.currentReviews || 0 }
    ];

    // Set values immediately so subsequent save sees them
    fields.forEach((field) => {
      const element = document.getElementById(field.id);
      if (element) {
        element.value = field.value;
      }
    });

    // Then run staggered animations for visual feedback
    fields.forEach((field, index) => {
      setTimeout(() => {
        const element = document.getElementById(field.id);
        if (element) {
          element.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(52, 211, 153, 0.05))';
          element.classList.add('animate-pulse');
          setTimeout(() => {
            element.style.background = '';
            element.classList.remove('animate-pulse');
          }, 500);
        }
      }, index * 200);
    });

    setTimeout(() => {
      this.animateSuccessFlash();
    }, fields.length * 200 + 300);
  }

  async saveData() {
    this.animateElement('saveBtn', 'wiggle');

    const data = {
      amazonUrl: document.getElementById('amazonUrl').value.trim(),
      title: document.getElementById('title').value.trim(),
      author: document.getElementById('author').value.trim(),
      imageUrl: document.getElementById('imageUrl').value.trim(),
      reviewCount: parseInt(document.getElementById('reviewCount').value) || 0,
      targetReviews: parseInt(document.getElementById('targetReviews').value) || 0,
      associateTag: document.getElementById('associateTag').value.trim(),
      associateEnabled: document.getElementById('associateEnabled')?.checked ?? true,
      savedAt: new Date().toISOString()
    };

    if (!data.title) {
      this.animateInputError('title');
      this.toast.error('書籍タイトルを入力してください', {
        title: '入力エラー'
      });
      return;
    }

    if (await this.storage.save(data)) {
      this.animateSuccessFlash();
      this.toast.success(`「${data.title}」の設定を保存しました`, {
        title: '保存完了',
        duration: 4000
      });
    } else {
      this.toast.error('保存に失敗しました', {
        title: '保存エラー'
      });
    }
  }

  async clearData() {
    console.log('Clear button clicked - clearData method called');
    
    // Add visual feedback immediately to show button is working
    this.animateElement('clearBtn', 'wiggle');
    
    // Check if there's any data to clear first
    const currentData = await this.storage.load();
    console.log('Current storage data:', currentData);
    
    const formFields = {
      amazonUrl: document.getElementById('amazonUrl').value,
      title: document.getElementById('title').value,
      author: document.getElementById('author').value,
      imageUrl: document.getElementById('imageUrl').value,
      reviewCount: document.getElementById('reviewCount').value,
      targetReviews: document.getElementById('targetReviews').value
    };
    
    console.log('Current form data:', formFields);
    
    const hasFormData = formFields.amazonUrl ||
                       formFields.title ||
                       formFields.author ||
                       formFields.imageUrl ||
                       (formFields.reviewCount && formFields.reviewCount !== '0') ||
                       formFields.targetReviews;

    console.log('Has form data:', hasFormData, 'Has storage data:', !!currentData);

    if (!currentData && !hasFormData) {
      this.toast.info('クリアするデータがありません', {
        title: '情報',
        duration: 3000
      });
      return;
    }

    // Use a custom confirmation system instead of browser confirm()
    this.showClearConfirmation();
  }

  showClearConfirmation() {
    const confirmToast = this.toast.show('データを削除してもよろしいですか？', 'warning', {
      title: '確認',
      duration: 0, // Don't auto-dismiss
      closable: false // Don't show close button
    });

    // Generate unique IDs for buttons
    const confirmId = `confirmClear_${Date.now()}`;
    const cancelId = `cancelClear_${Date.now()}`;

    // Add custom buttons to the toast
    const buttonsHtml = `
      <div style="margin-top: 12px; display: flex; gap: 8px; justify-content: center;">
        <button id="${confirmId}" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">削除する</button>
        <button id="${cancelId}" style="background: #6b7280; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">キャンセル</button>
      </div>
    `;
    
    const messageDiv = confirmToast.querySelector('.toast-message');
    if (messageDiv) {
      messageDiv.innerHTML += buttonsHtml;
      
      // Add event listeners
      const confirmBtn = document.getElementById(confirmId);
      const cancelBtn = document.getElementById(cancelId);
      
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          this.toast.dismiss(confirmToast);
          await this.executeClearData();
        });
      }
      
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          this.toast.dismiss(confirmToast);
          this.toast.info('削除をキャンセルしました', {
            title: 'キャンセル',
            duration: 2000
          });
        });
      }
    }
  }

  async executeClearData() {
    try {
      // Clear storage
      const storageCleared = await this.storage.clear();
      
      // Clear form fields
      document.getElementById('amazonUrl').value = '';
      document.getElementById('title').value = '';
      document.getElementById('author').value = '';
      document.getElementById('imageUrl').value = '';
      document.getElementById('reviewCount').value = '0';
      document.getElementById('targetReviews').value = '';
      
      if (storageCleared) {
        this.animateSuccessFlash();
        this.toast.success('すべてのデータを削除しました', {
          title: '削除完了',
          duration: 4000
        });
      } else {
        this.toast.warning('フォームをクリアしましたが、保存データの削除に失敗しました', {
          title: '部分的成功',
          duration: 5000
        });
      }
    } catch (error) {
      console.error('Clear data error:', error);
      this.toast.error('データの削除中にエラーが発生しました', {
        title: 'エラー',
        duration: 5000
      });
    }
  }

  async loadData() {
    console.log('Loading data...');
    const data = await this.storage.load();
    console.log('Loaded data:', data);
    
    if (data) {
      document.getElementById('amazonUrl').value = data.amazonUrl || '';
      document.getElementById('title').value = data.title || '';
      document.getElementById('author').value = data.author || '';
      document.getElementById('imageUrl').value = data.imageUrl || '';
      document.getElementById('reviewCount').value = data.reviewCount || 0;
      document.getElementById('targetReviews').value = data.targetReviews || '';
      document.getElementById('associateTag').value = data.associateTag || '';
      
      // Load associate toggle state (default: true for backward compatibility)
      const associateEnabled = data.associateEnabled !== undefined ? data.associateEnabled : true;
      const toggle = document.getElementById('associateEnabled');
      const container = document.getElementById('associateInputContainer');
      const input = document.getElementById('associateTag');
      
      if (toggle && container && input) {
        toggle.checked = associateEnabled;
        if (associateEnabled) {
          container.classList.remove('disabled');
          input.disabled = false;
        } else {
          container.classList.add('disabled');
          input.disabled = true;
        }
      }
      
      console.log('Data populated to form fields');
    } else {
      console.log('No data found in storage');
      
      // Set default toggle state for new users
      const toggle = document.getElementById('associateEnabled');
      const container = document.getElementById('associateInputContainer');
      const input = document.getElementById('associateTag');
      
      if (toggle && container && input) {
        toggle.checked = true; // Default to enabled
        container.classList.remove('disabled');
        input.disabled = false;
      }
    }
  }

  animateElement(elementId, type = 'wiggle', options = {}) {
    const element = document.getElementById(elementId) || document.querySelector(elementId);
    if (!element) return;

    const { 
      duration = 800, 
      borderColor = null, 
      resetBorder = false 
    } = options;

    switch (type) {
      case 'wiggle':
        if (borderColor) element.style.borderColor = borderColor;
        element.classList.add('animate-wiggle');
        setTimeout(() => {
          element.classList.remove('animate-wiggle');
          if (resetBorder) element.style.borderColor = '';
        }, duration);
        break;
      case 'pulse':
        element.classList.add('animate-pulse');
        setTimeout(() => {
          element.classList.remove('animate-pulse');
        }, duration);
        break;
    }
  }

  animateInputError(inputId) {
    this.animateElement(inputId, 'wiggle', {
      borderColor: 'var(--danger)',
      resetBorder: true
    });
  }

  animateSuccessFlash() {
    const card = document.querySelector('.card');
    if (card) {
      const flash = document.createElement('div');
      flash.style.cssText = `
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(52, 211, 153, 0.1));
        border-radius: inherit;
        animation: fadeInUp 0.6s var(--transition-normal);
        pointer-events: none;
        z-index: 1;
      `;
      card.style.position = 'relative';
      card.appendChild(flash);
      
      setTimeout(() => {
        if (flash.parentNode) {
          flash.parentNode.removeChild(flash);
        }
      }, 600);
    }
  }

  handleError(operation, error, options = {}) {
    console.error(`${operation} error:`, error);
    
    let message;
    let duration = options.duration || 8000;
    
    switch (operation) {
      case 'Amazon data fetch':
        message = `取得エラー: ${error.message}`;
        break;
      case 'Export':
        message = `画像生成エラー: ${error.message}`;
        break;
      case 'X sharing':
        message = `X投稿の準備でエラーが発生しました。\n画像を手動でダウンロードして X に投稿してください。\n\nエラー詳細: ${error.message}`;
        duration = 10000; // Longer duration for important instruction
        break;
      case 'Chrome runtime':
        message = 'Chrome拡張機能コンテキストが必要です';
        break;
      default:
        message = `${operation}でエラーが発生しました: ${error.message}`;
    }

    this.toast.error(message, {
      title: 'エラー',
      duration
    });
  }

  async exportProgressImage() {
    console.log('Export button clicked');
    
    const data = await this.storage.load();
    console.log('Loaded data for export:', data);
    
    if (!data) {
      this.toast.warning('エクスポートするデータがありません', {
        title: 'エクスポート失敗'
      });
      return;
    }

    // Send message to background script for image generation
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        console.log('Sending export message to background script');
        
        this.toast.info('X投稿用の画像を生成中...', {
          title: '画像生成中',
          duration: 3000
        });

        const response = await chrome.runtime.sendMessage({
          action: 'exportProgressImage',
          data: data
        });

        console.log('Background script response:', response);

        if (response && response.success) {
          this.toast.success('画像生成タブを開きました！ダウンロードしてください', {
            title: '生成開始',
            duration: 6000
          });
        } else {
          throw new Error(response?.error || '画像生成に失敗しました');
        }
      } catch (error) {
        this.handleError('Export', error);
      }
    } else {
      this.handleError('Chrome runtime', new Error('Chrome runtime not available'));
    }
  }

  /**
   * X (Twitter) Sharing Integration
   * 
   * Handles sharing book review progress to X with automatically generated image.
   * Generates contextual tweet text based on target review settings.
   * 
   * Process:
   * 1. Validate stored data
   * 2. Generate appropriate tweet text (with/without target)
   * 3. Construct X compose URL
   * 4. Trigger background image generation and X tab creation
   * 5. Handle cross-tab image attachment via content script
   */
  async shareToX() {
    console.log('Share to X button clicked');
    
    const data = await this.storage.load();
    console.log('Loaded data for X sharing:', data);
    
    if (!data) {
      this.toast.warning('シェアするデータがありません', {
        title: 'シェア失敗'
      });
      return;
    }

    // 投稿文生成
    const tweetText = this.generateTweetText(data);
    console.log('Generated tweet text:', tweetText);

    // X投稿URLを構築
    const tweetUrl = this.buildTweetUrl(tweetText);
    console.log('Tweet URL:', tweetUrl);

    // 画像生成とX投稿画面オープンを統合処理
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        this.toast.info('画像生成中...', {
          title: 'X投稿準備中',
          duration: 4000
        });

        // 新しいバックグラウンドスクリプトアクションを使用
        const response = await chrome.runtime.sendMessage({
          action: 'shareToXWithImage',
          data: data,
          tweetUrl: tweetUrl
        });

        if (response && response.success) {
          this.toast.success('X投稿画面を開きました。画像を自動生成・添付しています...\n\n自動添付されない場合は：\n1. 画像ダウンロードボタンを使用\n2. X投稿画面にドラッグ&ドロップ\n3. Ctrl+V（Mac: Cmd+V）で貼り付け', {
            title: 'X投稿準備完了',
            duration: 12000
          });
        } else {
          throw new Error(response?.error || 'X投稿準備に失敗しました');
        }
      } else {
        // Chrome拡張機能コンテキスト外では画像なしでX投稿画面のみ開く
        window.open(tweetUrl, '_blank');
        this.toast.warning('画像生成にはChrome拡張機能が必要です', {
          title: '機能制限',
          duration: 4000
        });
      }
    } catch (error) {
      this.handleError('X sharing', error);
    }
  }

  generateTweetText(data) {
    const { title, reviewCount, targetReviews } = data;
    const bookTitle = title || '書籍';
    const currentCount = parseInt(reviewCount) || 0;
    
    // Check if associate URL feature is enabled
    const isAssociateEnabled = document.getElementById('associateEnabled')?.checked ?? data.associateEnabled ?? true;
    
    let tweetContent = '';
    let urlPart = '';
    let disclosure = '';
    
    // Generate main tweet content
    if (targetReviews && parseInt(targetReviews) > 0) {
      // パターンA: 目標値設定あり
      const target = parseInt(targetReviews);
      const remaining = Math.max(0, target - currentCount);
      tweetContent = `「${bookTitle}」のレビューが${currentCount}件になりました！\n目標${target}件まで残り${remaining}件です📚`;
    } else {
      // パターンB: 目標値設定なし
      tweetContent = `「${bookTitle}」は、現在レビューを${currentCount}件集めています📚`;
    }
    
    // Add URL only if associate feature is enabled
    if (isAssociateEnabled) {
      const urlForShare = this.buildBookUrlForShare(data);
      const liveAssociateId = document.getElementById('associateTag')?.value?.trim();
      const hasAssociate = !!(liveAssociateId || (data.associateTag || '').trim());
      
      urlPart = urlForShare ? `\n${urlForShare}` : '';
      disclosure = hasAssociate ? '\n#アマゾンアソシエイトに参加しています' : '';
    }
    
    return `${tweetContent}${urlPart}\n#KindleReviewMeter${disclosure}`;
  }

  buildTweetUrl(text) {
    const encodedText = encodeURIComponent(text);
    // Use compose endpoint for better media attach support
    return `https://x.com/compose/tweet?text=${encodedText}`;
  }

  buildBookUrlForShare(data) {
    try {
      let base = (data.amazonUrl || '').trim();
      if (!base) return '';
      if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
      const u = new URL(base);
      
      // Prefer latest input value to avoid debounce timing issues
      const liveId = document.getElementById('associateTag')?.value?.trim();
      const rawId = liveId || (data.associateTag || '').trim();
      
      // Validate and sanitize Associate ID
      const id = this.validateAndSanitizeAssociateId(rawId);
      
      if (id) u.searchParams.set('tag', id); else u.searchParams.delete('tag');
      return u.toString();
    } catch (e) {
      console.warn('Failed to build share URL:', e);
      return data.amazonUrl || '';
    }
  }

  // Validate and sanitize Associate ID for security
  validateAndSanitizeAssociateId(id) {
    if (!id || typeof id !== 'string') return '';
    
    // Amazon Associate IDs should be alphanumeric with hyphens, typically 10-20 characters
    const sanitized = id.replace(/[^\w\-]/g, '').substring(0, 30);
    
    // Basic format validation
    if (!/^[\w\-]{3,30}$/.test(sanitized)) {
      console.warn('Invalid Associate ID format:', id);
      return '';
    }
    
    return sanitized;
  }

  // Save only Associate ID to storage without requiring full Save action
  async saveAssociateId(rawId) {
    try {
      // Validate input before saving
      const validatedId = this.validateAndSanitizeAssociateId(rawId);
      
      const current = await this.storage.load() || {};
      current.associateTag = validatedId;
      await this.storage.save(current);
      console.log('Associate ID saved:', validatedId || '(empty)');
      
      // Update input field if sanitization occurred
      const inputElement = document.getElementById('associateTag');
      if (inputElement && inputElement.value !== validatedId) {
        inputElement.value = validatedId;
      }
    } catch (e) {
      console.warn('Failed to save Associate ID:', e);
    }
  }

  // Handle Associate URL toggle switch changes (updated for compact layout)
  async handleAssociateToggle() {
    const toggle = document.getElementById('associateEnabled');
    const container = document.querySelector('.associate-compact-layout');
    const input = document.getElementById('associateTag');
    const toggleSwitch = document.querySelector('.toggle-switch-compact');
    
    if (!toggle || !container || !input) return;
    
    const isEnabled = toggle.checked;
    
    // Add bounce animation to compact switch
    if (toggleSwitch) {
      toggleSwitch.classList.add('animate');
      setTimeout(() => toggleSwitch.classList.remove('animate'), 600);
    }
    
    // Update UI state for compact layout
    if (isEnabled) {
      container.classList.remove('disabled');
      input.disabled = false;
      input.focus();
      this.toast.info('アソシエイトURL機能を有効にしました', {
        title: '設定変更',
        duration: 3000
      });
    } else {
      container.classList.add('disabled');
      input.disabled = true;
      this.toast.info('アソシエイトURL機能を無効にしました', {
        title: '設定変更',
        duration: 3000
      });
    }
    
    // Save toggle state to storage
    try {
      const current = await this.storage.load() || {};
      current.associateEnabled = isEnabled;
      await this.storage.save(current);
      console.log('Associate toggle state saved:', isEnabled);
    } catch (e) {
      console.warn('Failed to save associate toggle state:', e);
    }
  }

  // Enhanced debounce helper with race condition protection
  debounce(fn, wait = 300) {
    let timeoutId = null;
    let lastCall = 0;
    
    return (...args) => {
      const now = Date.now();
      
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Set up new timeout with race condition protection
      timeoutId = setTimeout(async () => {
        const callTime = Date.now();
        lastCall = callTime;
        
        try {
          await fn.apply(this, args);
          
          // Only log success if this is still the most recent call
          if (lastCall === callTime) {
            console.log('Debounced function completed successfully');
          }
        } catch (e) {
          // Only log error if this is still the most recent call
          if (lastCall === callTime) {
            console.warn('Debounced function failed:', e);
          }
        } finally {
          // Clear timeout reference
          if (timeoutId && lastCall === callTime) {
            timeoutId = null;
          }
        }
      }, wait);
    };
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, creating App instance');
  window.app = new App();
  
  // Add global debug function
  window.debugApp = () => {
    if (window.app) {
      return window.app.debugCurrentState();
    } else {
      console.error('App instance not found');
    }
  };
  
  console.log('App instance created. Use debugApp() in console for debugging');
});
