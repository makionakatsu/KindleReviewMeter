/**
 * アプリケーション定数
 */

import { AppConfig, DefaultValues } from '../types/index.js';

// アプリケーション基本設定
export const APP_NAME = 'Amazon書籍レビュー数トラッカー';
export const APP_VERSION = '2.0.0';
export const STORAGE_KEY = 'amazonReviewTracker';

// API設定
export const DEFAULT_PROXY_URL = 'https://api.allorigins.win/raw?url=';
export const ALLOWED_DOMAINS = ['amazon.co.jp', 'amazon.com'];

// タイムアウト設定
export const DEFAULT_TIMEOUT = 30000;
export const FETCH_RETRY_DELAY = 1000;
export const MAX_RETRIES = 3;

// UI設定
export const DEBOUNCE_DELAY = 300;
export const ANIMATION_DURATION = 1000;
export const STATUS_MESSAGE_DURATION = 5000;
export const SAVE_POLLING_INTERVAL = 50; // 保存操作の競合チェック間隔(ms)

// マイルストーン設定
export const DEFAULT_MILESTONES = [10, 25, 50, 75, 100, 150, 200];
export const MILESTONE_ICONS = {
  10: '🎯',
  25: '🏆', 
  50: '💎',
  75: '👑',
  100: '🎁',
  150: '⭐',
  200: '🌟',
  target: '🎁',
  stretch: '🌟'
};

// バリデーションルール
export const VALIDATION_RULES = {
  bookTitle: {
    minLength: 1,
    maxLength: 200,
  },
  bookAuthor: {
    minLength: 2,
    maxLength: 100,
    invalidTerms: [
      'follow', 'more', 'see', 'clothing', 'store', 'shop', 'brand',
      'kindle', 'amazon', 'paperback', 'hardcover', 'format',
      'page', 'pages', 'price', 'buy', 'purchase', 'cart', 'wishlist',
      'review', 'reviews', 'customer', 'rating', 'star', 'stars',
      'visit', 'website', 'profile', 'biography', 'bio', 'more info'
    ],
  },
  reviews: {
    min: 0,
    max: 1000000,
  },
  url: {
    allowedDomains: ALLOWED_DOMAINS,
  },
};

// デフォルト設定
export const DEFAULT_CONFIG: AppConfig = {
  storageKey: STORAGE_KEY,
  proxyUrl: DEFAULT_PROXY_URL,
  maxRetries: MAX_RETRIES,
  timeout: DEFAULT_TIMEOUT,
  debounceDelay: DEBOUNCE_DELAY,
  animationDuration: ANIMATION_DURATION,
  defaultMilestones: DEFAULT_MILESTONES,
  validationRules: VALIDATION_RULES,
};

// デフォルト値
export const DEFAULT_VALUES: DefaultValues = {
  bookData: {
    bookUrl: '',
    bookTitle: '',
    bookAuthor: '',
    currentReviews: 0,
    targetReviews: 0,
    stretchReviews: 0,
    bookCoverUrl: '',
    lastUpdated: new Date().toISOString(),
  },
  appConfig: DEFAULT_CONFIG,
  uiState: {
    isLoading: false,
    currentPage: 'settings',
    fetchStatus: { type: 'idle', message: '', timestamp: 0 },
    errors: {},
  },
  shareOptions: {
    width: 540,
    height: 720,
    quality: 1.0,
    format: 'png',
    includeWatermark: true,
  },
};

// CSS クラス名
export const CSS_CLASSES = {
  loading: 'loading',
  error: 'error',
  success: 'success',
  hidden: 'hidden',
  visible: 'visible',
  invalid: 'invalid',
  valid: 'valid',
  inputError: 'input-error',
  milestoneAchieved: 'milestone-achieved',
  btnPrimary: 'btn-primary',
  btnSecondary: 'btn-secondary',
  btnFetch: 'btn-fetch',
  btnEdit: 'btn-edit',
};

// イベント名
export const EVENTS = {
  // データ関連
  DATA_LOADED: 'data:loaded',
  DATA_SAVED: 'data:saved',
  DATA_UPDATED: 'data:updated',
  
  // フォーム関連
  FORM_SUBMITTED: 'form:submitted',
  FORM_VALIDATED: 'form:validated',
  FORM_RESET: 'form:reset',
  
  // 書籍情報関連
  BOOK_FETCHED: 'book:fetched',
  BOOK_FETCH_STARTED: 'book:fetch_started',
  BOOK_FETCH_FAILED: 'book:fetch_failed',
  
  // 著者関連
  AUTHOR_EXTRACTED: 'author:extracted',
  AUTHOR_EDITED: 'author:edited',
  
  // UI関連
  COMPONENT_MOUNTED: 'component:mounted',
  COMPONENT_UNMOUNTED: 'component:unmounted',
  COMPONENT_ERROR: 'component:error',
  
  // プログレス関連
  PROGRESS_UPDATED: 'progress:updated',
  MILESTONE_ACHIEVED: 'milestone:achieved',
  
  // シェア関連
  SHARE_STARTED: 'share:started',
  SHARE_COMPLETED: 'share:completed',
  SHARE_FAILED: 'share:failed',
  
  // エラー関連
  ERROR_OCCURRED: 'error:occurred',
  ERROR_RECOVERED: 'error:recovered',
};

// ローカルストレージキー
export const STORAGE_KEYS = {
  BOOK_DATA: 'bookData',
  APP_CONFIG: 'appConfig',
  USER_PREFERENCES: 'userPreferences',
  ERROR_LOG: 'errorLog',
  PERFORMANCE_LOG: 'performanceLog',
};

// パフォーマンス設定
export const PERFORMANCE = {
  MAX_ERROR_HISTORY: 100,
  MAX_LOG_ENTRIES: 50,
  CLEANUP_INTERVAL: 300000, // 5分
  MEMORY_THRESHOLD: 50 * 1024 * 1024, // 50MB
};

// 開発環境設定
export const DEV_CONFIG = {
  DEBUG_MODE: typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'),
  ENABLE_LOGGING: true,
  ENABLE_PERFORMANCE_MONITORING: true,
  MOCK_API_DELAY: 1000,
};

// URL パターン
export const URL_PATTERNS = {
  AMAZON_PRODUCT: /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/,
  AMAZON_DOMAINS: /amazon\.(co\.jp|com)/,
  IMAGE_EXTENSIONS: /\.(jpg|jpeg|png|gif|webp)$/i,
  SUSPICIOUS_PATHS: /\/(node|review|customer|seller)\//,
};

// レスポンシブ設定
export const BREAKPOINTS = {
  MOBILE: 768,
  TABLET: 1024,
  DESKTOP: 1200,
};

// 進捗バー設定
export const PROGRESS_CONFIG = {
  ANIMATION_DURATION: 1000,
  SHINE_DURATION: 2000,
  PULSE_DURATION: 2000,
  GLOW_DURATION: 4000,
  MILESTONE_ANIMATION_DURATION: 1500,
};

// シェア設定
export const SHARE_CONFIG = {
  DEFAULT_WIDTH: 540,
  DEFAULT_HEIGHT: 720,
  ASPECT_RATIO: 3/4,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  SUPPORTED_FORMATS: ['png', 'jpeg', 'webp'] as const,
  TWITTER_INTENT_URL: 'https://twitter.com/intent/tweet',
};

// フォント設定
export const FONTS = {
  PRIMARY: 'Inter, sans-serif',
  FALLBACK: 'system-ui, -apple-system, sans-serif',
  WEIGHTS: {
    LIGHT: 300,
    NORMAL: 400,
    MEDIUM: 500,
    SEMIBOLD: 600,
    BOLD: 700,
    EXTRABOLD: 800,
  },
};

// カラーテーマ
export const COLORS = {
  PRIMARY: '#ff6b6b',
  SECONDARY: '#4ecdc4',
  SUCCESS: '#2ecc71',
  ERROR: '#e74c3c',
  WARNING: '#f39c12',
  INFO: '#3498db',
  LIGHT: '#ecf0f1',
  DARK: '#2c3e50',
};

// アニメーション設定
export const ANIMATIONS = {
  EASING: {
    EASE_IN_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)',
    EASE_IN: 'cubic-bezier(0.4, 0, 1, 1)',
    BOUNCE: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
  DURATION: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500,
    SLOWER: 1000,
  },
};

// セキュリティ設定
export const SECURITY = {
  CSP_DIRECTIVES: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
    'style-src': ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
    'font-src': ["'self'", 'fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'", 'api.allorigins.win'],
  },
  TRUSTED_ORIGINS: [
    'amazon.co.jp',
    'amazon.com',
    'ssl-images-amazon.com',
    'm.media-amazon.com',
  ],
};

// 国際化設定（将来の拡張用）
export const I18N = {
  DEFAULT_LOCALE: 'ja',
  SUPPORTED_LOCALES: ['ja', 'en'],
  FALLBACK_LOCALE: 'en',
  DATE_FORMAT: 'YYYY-MM-DD HH:mm:ss',
  NUMBER_FORMAT: {
    DECIMAL_PLACES: 0,
    THOUSANDS_SEPARATOR: ',',
  },
};