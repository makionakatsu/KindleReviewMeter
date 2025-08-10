/**
 * Chrome Extension Popup Script for Kindle Review Meter
 * Optimized for Manifest V3 and Content Security Policy compliance
 */

/**
 * StorageService - Chrome Extension Storage Service using chrome.storage API
 */
class StorageService {
  constructor(key = 'kindleReviewMeter') {
    this.storageKey = key;
  }

  async save(data) {
    try {
      // Use Chrome Storage API for extensions
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ [this.storageKey]: data });
      } else {
        // Fallback to localStorage for testing
        localStorage.setItem(this.storageKey, JSON.stringify(data));
      }
      return true;
    } catch (error) {
      console.error('Storage save failed:', error);
      return false;
    }
  }

  async load() {
    try {
      // Use Chrome Storage API for extensions
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get([this.storageKey]);
        return result[this.storageKey] || null;
      } else {
        // Fallback to localStorage for testing
        const data = localStorage.getItem(this.storageKey);
        return data ? JSON.parse(data) : null;
      }
    } catch (error) {
      console.error('Storage load failed:', error);
      return null;
    }
  }

  async clear() {
    try {
      // Use Chrome Storage API for extensions
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.remove([this.storageKey]);
      } else {
        // Fallback to localStorage for testing
        localStorage.removeItem(this.storageKey);
      }
      return true;
    } catch (error) {
      console.error('Storage clear failed:', error);
      return false;
    }
  }
}

/**
 * ToastService - User notification system for popup
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
 * App - Main application class for Chrome Extension popup
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
    // Amazon fetch button
    const fetchBtn = document.getElementById('fetchAmazonBtn');
    if (fetchBtn) {
      fetchBtn.addEventListener('click', () => this.fetchAmazonData());
      console.log('Fetch button event bound');
    } else {
      console.error('Fetch button not found');
    }

    // Save button
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveData());
      console.log('Save button event bound');
    } else {
      console.error('Save button not found');
    }

    // Clear button
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearData());
      console.log('Clear button event bound');
    } else {
      console.error('Clear button not found');
    }

    // Export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportProgressImage());
      console.log('Export button event bound');
    } else {
      console.error('Export button not found');
    }

    // X Share button
    const shareToXBtn = document.getElementById('shareToXBtn');
    if (shareToXBtn) {
      shareToXBtn.addEventListener('click', () => this.shareToX());
      console.log('Share to X button event bound');
    } else {
      console.error('Share to X button not found');
    }
  }

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

    // URL正規化を試行
    const normalizedUrl = this.normalizeAmazonUrl(url);
    if (!normalizedUrl) {
      this.toast.error('有効なAmazon書籍URLを入力してください。\n例: https://www.amazon.co.jp/dp/XXXXXXXXXX', {
        title: 'URL形式エラー',
        duration: 6000
      });
      this.animateInputError('amazonUrl');
      console.log('URL normalization failed for:', url);
      return;
    }

    // 正規化されたURLを表示
    if (normalizedUrl !== url) {
      urlInput.value = normalizedUrl;
      this.toast.info('URLを正規化しました', {
        title: '情報',
        duration: 3000
      });
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
          url: normalizedUrl
        });

        if (response && response.success && response.data) {
          this.populateBookData(response.data);
          
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
      console.error('Amazon data fetch error:', error);
      this.toast.error(`取得エラー: ${error.message}`, {
        title: 'エラー',
        duration: 8000
      });
    } finally {
      fetchBtn.classList.remove('loading');
      fetchBtn.disabled = false;
    }
  }

  normalizeAmazonUrl(url) {
    try {
      console.log('Attempting to normalize URL:', url, 'Type:', typeof url, 'Length:', url?.length);
      
      // Input validation
      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        console.error('Invalid URL input:', url);
        return null;
      }
      
      const trimmedUrl = url.trim();
      
      // Add protocol if missing
      let fullUrl = trimmedUrl;
      if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
        fullUrl = 'https://' + trimmedUrl;
        console.log('Added https protocol:', fullUrl);
      }
      
      const urlObj = new URL(fullUrl);
      
      // Amazon hostname validation
      const amazonHosts = [
        'amazon.co.jp', 'amazon.com', 'amazon.ca', 'amazon.co.uk',
        'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es',
        'www.amazon.co.jp', 'www.amazon.com', 'www.amazon.ca', 'www.amazon.co.uk',
        'www.amazon.de', 'www.amazon.fr', 'www.amazon.it', 'www.amazon.es'
      ];
      
      const isAmazonHost = amazonHosts.some(host => 
        urlObj.hostname === host || urlObj.hostname.endsWith('.' + host)
      );
      
      if (!isAmazonHost) {
        console.log('Invalid Amazon host:', urlObj.hostname);
        return null;
      }
      
      // Extract ASIN from various URL patterns
      const asinPatterns = [
        /\/dp\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,           // /dp/XXXXXXXXXX
        /\/product\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,      // /product/XXXXXXXXXX
        /\/gp\/product\/([A-Z0-9]{10})(?:\/|$|\?|#)/i,  // /gp/product/XXXXXXXXXX
        /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:\/|$|\?|#)/i, // /exec/obidos/ASIN/XXXXXXXXXX
        /\/o\/ASIN\/([A-Z0-9]{10})(?:\/|$|\?|#)/i       // /o/ASIN/XXXXXXXXXX
      ];
      
      let asin = null;
      for (const pattern of asinPatterns) {
        const match = fullUrl.match(pattern);
        if (match) {
          asin = match[1];
          console.log('Found ASIN:', asin, 'with pattern:', pattern.source);
          break;
        }
      }
      
      if (!asin) {
        console.log('No valid ASIN found in URL:', fullUrl);
        return null;
      }
      
      // Construct clean Amazon URL
      const cleanUrl = `https://${urlObj.hostname}/dp/${asin}`;
      
      console.log('URL normalization successful:', {
        original: url,
        processed: fullUrl,
        normalized: cleanUrl,
        asin: asin,
        hostname: urlObj.hostname
      });
      
      return cleanUrl;
      
    } catch (error) {
      console.error('URL normalization error:', error);
      console.error('Failed URL details:', {
        input: url,
        type: typeof url,
        length: url?.length,
        charCodes: url ? Array.from(url).map(c => c.charCodeAt(0)).slice(0, 20) : null
      });
      return null;
    }
  }

  isValidAmazonUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Amazon hostname patterns
      const amazonHosts = [
        'amazon.co.jp',
        'amazon.com', 
        'amazon.ca',
        'amazon.co.uk',
        'amazon.de',
        'amazon.fr',
        'amazon.it',
        'amazon.es',
        'www.amazon.co.jp',
        'www.amazon.com',
        'www.amazon.ca',
        'www.amazon.co.uk',
        'www.amazon.de',
        'www.amazon.fr',
        'www.amazon.it',
        'www.amazon.es'
      ];
      
      const isAmazonHost = amazonHosts.some(host => 
        urlObj.hostname === host || urlObj.hostname.endsWith('.' + host)
      );
      
      if (!isAmazonHost) {
        console.log('Invalid Amazon host:', urlObj.hostname);
        return false;
      }
      
      // Amazon product URL patterns
      const productPatterns = [
        '/dp/',           // Digital Product
        '/product/',      // Product
        '/gp/product/',   // Generic Product
        '/exec/obidos/',  // Old format
        '/o/ASIN/'        // Old ASIN format
      ];
      
      const hasProductPattern = productPatterns.some(pattern => url.includes(pattern));
      
      // ASIN pattern check (10 character alphanumeric)
      const asinMatch = url.match(/\/(?:dp|product|ASIN|gp\/product)\/([A-Z0-9]{10})(?:\/|$|\?|#)/i);
      
      console.log('URL validation:', {
        url,
        hostname: urlObj.hostname,
        isAmazonHost,
        hasProductPattern,
        asinMatch: !!asinMatch,
        asin: asinMatch ? asinMatch[1] : null
      });
      
      return hasProductPattern || asinMatch;
      
    } catch (error) {
      console.error('URL validation error:', error);
      return false;
    }
  }

  populateBookData(bookData) {
    const fields = [
      { id: 'title', value: bookData.title },
      { id: 'author', value: bookData.author },
      { id: 'imageUrl', value: bookData.imageUrl },
      { id: 'reviewCount', value: bookData.currentReviews || 0 }
    ];

    fields.forEach((field, index) => {
      setTimeout(() => {
        const element = document.getElementById(field.id);
        if (element) {
          element.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(52, 211, 153, 0.05))';
          element.value = field.value;
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
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.classList.add('animate-wiggle');
      setTimeout(() => saveBtn.classList.remove('animate-wiggle'), 800);
    }

    const data = {
      amazonUrl: document.getElementById('amazonUrl').value.trim(),
      title: document.getElementById('title').value.trim(),
      author: document.getElementById('author').value.trim(),
      imageUrl: document.getElementById('imageUrl').value.trim(),
      reviewCount: parseInt(document.getElementById('reviewCount').value) || 0,
      targetReviews: parseInt(document.getElementById('targetReviews').value) || 0,
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
    const confirmed = confirm('データを削除しますか？');

    if (confirmed) {
      if (await this.storage.clear()) {
        document.getElementById('amazonUrl').value = '';
        document.getElementById('title').value = '';
        document.getElementById('author').value = '';
        document.getElementById('imageUrl').value = '';
        document.getElementById('reviewCount').value = '0';
        document.getElementById('targetReviews').value = '';
        
        this.toast.success('データを削除しました', {
          title: '削除完了'
        });
      } else {
        this.toast.error('削除に失敗しました', {
          title: '削除エラー'
        });
      }
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
      console.log('Data populated to form fields');
    } else {
      console.log('No data found in storage');
    }
  }

  animateInputError(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
      input.style.borderColor = 'var(--danger)';
      input.classList.add('animate-wiggle');
      setTimeout(() => {
        input.classList.remove('animate-wiggle');
        input.style.borderColor = '';
      }, 800);
    }
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
        console.error('Export error:', error);
        this.toast.error(`画像生成エラー: ${error.message}`, {
          title: 'エラー',
          duration: 8000
        });
      }
    } else {
      console.error('Chrome runtime not available');
      this.toast.warning('Chrome拡張機能コンテキストが必要です', {
        title: '機能制限'
      });
    }
  }

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
          this.toast.success('画像を生成中です。完了後にX投稿画面が開きます。画像が自動添付されない場合はCtrl+V（Mac: Cmd+V）で貼り付けてください。', {
            title: 'X投稿準備中',
            duration: 8000
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
      console.error('Error in X sharing process:', error);
      this.toast.error(`X投稿の準備でエラーが発生しました: ${error.message}`, {
        title: 'エラー',
        duration: 8000
      });
    }
  }

  generateTweetText(data) {
    const { title, reviewCount, targetReviews } = data;
    const bookTitle = title || '書籍';
    const currentCount = parseInt(reviewCount) || 0;
    
    if (targetReviews && parseInt(targetReviews) > 0) {
      // パターンA: 目標値設定あり
      const target = parseInt(targetReviews);
      const remaining = Math.max(0, target - currentCount);
      return `「${bookTitle}」のレビューが${currentCount}件になりました！\n目標${target}件まで残り${remaining}件です📚\n#KindleReviewMeter`;
    } else {
      // パターンB: 目標値設定なし
      return `「${bookTitle}」は、現在レビューを${currentCount}件集めています📚\n#KindleReviewMeter`;
    }
  }

  buildTweetUrl(text) {
    const encodedText = encodeURIComponent(text);
    // Use compose endpoint for better media attach support
    return `https://x.com/compose/tweet?text=${encodedText}`;
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
