/**
 * Amazon書籍レビュー数トラッカー - 型定義
 */

// 基本データ型
export interface BookData {
  bookUrl: string;
  bookTitle: string;
  bookAuthor: string;
  currentReviews: number;
  targetReviews: number;
  stretchReviews: number;
  bookCoverUrl: string;
  lastUpdated: string;
  averageRating?: number;
  bookImage?: string;
  lastFetchedAt?: string;
}

// 部分的な書籍データ（API取得時など）
export interface PartialBookData {
  bookTitle?: string;
  bookAuthor?: string;
  currentReviews?: number;
  bookCoverUrl?: string;
}

// 著者名抽出関連
export interface AuthorExtractionResult {
  author: string | null;
  confidence: number;
  method: AuthorExtractionMethod;
  debug?: AuthorExtractionDebug;
}

export enum AuthorExtractionMethod {
  STRUCTURED_DATA = 'structured_data',
  SEMANTIC_HTML = 'semantic_html',
  TEXT_PATTERNS = 'text_patterns',
  DOM_ANALYSIS = 'dom_analysis',
  MANUAL = 'manual'
}

export interface AuthorExtractionDebug {
  patterns: Array<{
    pattern: string;
    matches: string[];
    selected?: string;
  }>;
  htmlSections: string[];
  processingTime: number;
}

// フェッチ状態管理
export interface FetchStatus {
  type: 'loading' | 'success' | 'error' | 'idle';
  message: string;
  timestamp: number;
}

export interface FetchResult {
  success: boolean;
  data?: PartialBookData;
  errors: string[];
  warnings: string[];
  metadata: {
    url: string;
    fetchTime: number;
    dataSize: number;
    extractedFields: string[];
  };
}

// UI状態管理
export interface UIState {
  isLoading: boolean;
  currentPage: 'settings' | 'visual';
  fetchStatus: FetchStatus;
  errors: Record<string, string>;
  lastAction?: string;
}

// 進捗関連
export interface Milestone {
  value: number;
  icon: string;
  isTarget: boolean;
  isStretch: boolean;
  isAchieved: boolean;
  type: 'default' | 'target' | 'stretch';
}

export interface ProgressData {
  currentReviews: number;
  targetReviews: number;
  stretchReviews: number;
  achievementRate: number;
  progressPercentage: number;
  remainingToTarget: number;
  remainingToStretch: number;
  milestones: Milestone[];
}

// 設定とコンフィグ
export interface AppConfig {
  storageKey: string;
  proxyUrl: string;
  maxRetries: number;
  timeout: number;
  debounceDelay: number;
  animationDuration: number;
  defaultMilestones: number[];
  validationRules: ValidationRules;
}

export interface ValidationRules {
  bookTitle: {
    minLength: number;
    maxLength: number;
  };
  bookAuthor: {
    minLength: number;
    maxLength: number;
    invalidTerms: string[];
  };
  reviews: {
    min: number;
    max: number;
  };
  url: {
    allowedDomains: string[];
  };
}

// ローカルストレージ関連
export interface StorageService {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): boolean;
  remove(key: string): boolean;
  clear(): boolean;
  exists(key: string): boolean;
}

// サービス層インターフェース
export interface BookInfoService {
  fetchBookInfo(url: string): Promise<FetchResult>;
  extractAuthor(html: string, url: string): Promise<AuthorExtractionResult>;
  validateUrl(url: string): boolean;
}

export interface ValidationService {
  validateBookData(data: Partial<BookData>): ValidationResult;
  validateUrl(url: string): boolean;
  validateAuthorName(author: string): boolean;
  sanitizeInput(input: string): string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: string[];
}

// イベント関連
export interface AppEvent {
  type: string;
  payload?: any;
  timestamp: number;
  source: string;
}

export interface EventListener<T = any> {
  (event: AppEvent & { payload: T }): void;
}

export interface EventEmitter {
  on<T>(eventType: string, listener: EventListener<T>): void;
  off<T>(eventType: string, listener: EventListener<T>): void;
  emit<T>(eventType: string, payload?: T): void;
}

// DOM関連
export interface DOMHelper {
  select<T extends Element = Element>(selector: string): T | null;
  selectAll<T extends Element = Element>(selector: string): T[];
  create<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: {
      className?: string;
      textContent?: string;
      attributes?: Record<string, string>;
    }
  ): HTMLElementTagNameMap[K];
  hide(element: Element): void;
  show(element: Element): void;
  toggle(element: Element): void;
}

// シェア機能関連
export interface ShareOptions {
  width: number;
  height: number;
  quality: number;
  format: 'png' | 'jpeg' | 'webp';
  includeWatermark: boolean;
}

export interface ShareResult {
  success: boolean;
  imageUrl?: string;
  dataUrl?: string;
  blob?: Blob | null;
  shareUrl?: string;
  error?: string;
  metadata: {
    dimensions: {
      width: number;
      height: number;
    };
    format: string;
    fileSize: number;
  };
}

// エラー関連
export interface AppError extends Error {
  code: string;
  context?: Record<string, any>;
  timestamp: number;
  recoverable: boolean;
}

export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  EXTRACTION_ERROR = 'EXTRACTION_ERROR',
  RENDER_ERROR = 'RENDER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// ユーティリティ型
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// 設定のデフォルト値型
export interface DefaultValues {
  bookData: Partial<BookData>;
  appConfig: AppConfig;
  uiState: UIState;
  shareOptions: ShareOptions;
}

// コンポーネント関連
export interface Component {
  readonly id: string;
  readonly element: HTMLElement;
  render(): void;
  destroy(): void;
  update(data?: any): void;
}

export interface ComponentConstructor<T extends Component = Component> {
  new (container: HTMLElement, options?: any): T;
}

// ライフサイクル関連
export interface Lifecycle {
  onInit?(): void | Promise<void>;
  onMount?(): void | Promise<void>;
  onUpdate?(data?: any): void | Promise<void>;
  onUnmount?(): void | Promise<void>;
  onDestroy?(): void | Promise<void>;
}

export interface ApplicationContext {
  config: AppConfig;
  storage: StorageService;
  bookInfoService: BookInfoService;
  validationService: ValidationService;
  eventEmitter: EventEmitter;
  domHelper: DOMHelper;
}

// アプリケーション全体の状態
export interface AppState {
  bookData: BookData | null;
  uiState: UIState;
  progressData: ProgressData | null;
  lastError: AppError | null;
}