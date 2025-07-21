/**
 * プログレス表示コンポーネント
 * 
 * 【責任範囲】
 * - 書籍レビュー数の進捗状況をビジュアル表示（プログレスバー、統計値）
 * - マイルストーン達成状況の表示と管理
 * - 書籍情報（タイトル、著者、カバー画像）の表示
 * - リアルタイムデータ更新機能（手動/自動更新）
 * - シェア機能の提供（画像生成、SNS投稿対応）
 * - アニメーション効果による UX向上
 * 
 * 【ビジュアル要素】
 * - プログレスバー：現在の達成率を色分けで表示（低・中・高・完了・超過）
 * - 統計表示：現在/目標/ストレッチ目標レビュー数
 * - マイルストーン：設定された中間目標の達成状況
 * - 達成メッセージ：進捗に応じた励ましメッセージ
 * 
 * 【機能特徴】
 * - 自動更新：設定間隔でのバックグラウンド更新
 * - レスポンシブ対応：デバイス画面サイズに適応
 * - エラー耐性：ネットワーク障害時の適切な処理
 * - パフォーマンス最適化：DOM更新の最小化
 */

import { BaseComponent } from './BaseComponent.js';
import { ApplicationContext, BookData, ProgressData, ShareOptions } from '../types/index.js';
import { BookDataModel } from '../models/BookData.js';
import { 
  DEFAULT_MILESTONES, 
  MILESTONE_ICONS, 
  PROGRESS_CONFIG,
  ANIMATIONS 
} from '../utils/constants.js';

export interface ProgressViewerOptions {
  showMilestones?: boolean;
  enableAnimations?: boolean;
  allowShare?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export class ProgressViewer extends BaseComponent {
  private bookModel: BookDataModel;
  private options: ProgressViewerOptions;
  private progressData: ProgressData | null = null;
  private refreshTimerId?: string;
  
  // DOM要素への参照
  private elements: {
    container?: HTMLElement;
    bookCover?: HTMLImageElement;
    bookTitle?: HTMLElement;
    bookAuthor?: HTMLElement;
    progressBar?: HTMLElement;
    progressFill?: HTMLElement;
    progressText?: HTMLElement;
    currentReviews?: HTMLElement;
    targetReviews?: HTMLElement;
    stretchReviews?: HTMLElement;
    milestoneList?: HTMLElement;
    shareButton?: HTMLButtonElement;
    refreshButton?: HTMLButtonElement;
    backButton?: HTMLButtonElement;
    lastUpdated?: HTMLElement;
  } = {};

  constructor(
    container: HTMLElement,
    context: ApplicationContext,
    options: ProgressViewerOptions = {}
  ) {
    super(container, context);
    this.options = {
      showMilestones: true,
      enableAnimations: true,
      allowShare: true,
      autoRefresh: false,
      refreshInterval: 30000, // 30秒
      ...options,
    };
    this.bookModel = new BookDataModel();
    this.loadData();
  }

  /**
   * データを読み込み
   */
  private loadData(): void {
    try {
      const savedData = this.context.storage.get<BookData>('amazonReviewTracker');
      console.log('📊 ProgressViewer - データ読み込み:', {
        hasData: !!savedData,
        bookTitle: savedData?.bookTitle,
        bookAuthor: savedData?.bookAuthor,
        currentReviews: savedData?.currentReviews,
        targetReviews: savedData?.targetReviews,
        fullData: savedData
      });
      
      if (savedData) {
        this.bookModel = new BookDataModel(savedData);
        this.progressData = this.bookModel.calculateProgress();
        
        console.log('📊 BookDataModel 初期化後:', {
          modelData: this.bookModel.getData(),
          authorFromModel: this.bookModel.getData().bookAuthor,
          progressData: this.progressData
        });
      }
    } catch (error) {
      console.warn('データ読み込みエラー:', error);
    }
  }

  /**
   * コンポーネントの初期化
   */
  protected override async onInit(): Promise<void> {
    this.createStructure();
    this.bindEvents();
    this.render();
    
    if (this.options.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  /**
   * 構造を作成
   */
  private createStructure(): void {
    this.element.innerHTML = `
      <div class="progress-viewer">
        <!-- ヘッダー -->
        <div class="header">
          <button id="backBtn" class="btn btn-back">← 設定に戻る</button>
          <h1>📊 レビュー数進捗表示</h1>
          <div class="header-actions">
            <button id="refreshBtn" class="btn btn-refresh">🔄 更新</button>
            ${this.options.allowShare ? '<button id="shareBtn" class="btn btn-share">📤 シェア</button>' : ''}
          </div>
        </div>

        <!-- メインコンテンツ -->
        <div class="main-content" id="mainContent">
          ${this.createBookInfoSection()}
          ${this.createProgressSection()}
          ${this.options.showMilestones ? this.createMilestonesSection() : ''}
        </div>

        <!-- フッター -->
        <div class="footer">
          <div class="last-updated" id="lastUpdated">最終更新: 未取得</div>
        </div>
      </div>
    `;

    // DOM要素への参照を取得
    this.elements = {
      container: this.select<HTMLElement>('.progress-viewer') ?? document.createElement('div'),
      bookCover: this.select<HTMLImageElement>('#bookCover') ?? document.createElement('img'),
      bookTitle: this.select<HTMLElement>('#bookTitle') ?? document.createElement('div'),
      bookAuthor: this.select<HTMLElement>('#bookAuthor') ?? document.createElement('div'),
      progressBar: this.select<HTMLElement>('.progress-bar') ?? document.createElement('div'),
      progressFill: this.select<HTMLElement>('.progress-fill') ?? document.createElement('div'),
      progressText: this.select<HTMLElement>('#progressText') ?? document.createElement('div'),
      currentReviews: this.select<HTMLElement>('#currentReviews') ?? document.createElement('span'),
      targetReviews: this.select<HTMLElement>('#targetReviews') ?? document.createElement('span'),
      stretchReviews: this.select<HTMLElement>('#stretchReviews') ?? document.createElement('span'),
      milestoneList: this.select<HTMLElement>('#milestoneList') ?? document.createElement('ul'),
      shareButton: this.select<HTMLButtonElement>('#shareBtn') ?? document.createElement('button'),
      refreshButton: this.select<HTMLButtonElement>('#refreshBtn') ?? document.createElement('button'),
      backButton: this.select<HTMLButtonElement>('#backBtn') ?? document.createElement('button'),
      lastUpdated: this.select<HTMLElement>('#lastUpdated') ?? document.createElement('div'),
    };
  }

  /**
   * 書籍情報セクション
   */
  private createBookInfoSection(): string {
    return `
      <div class="book-info-section">
        <div class="book-cover-container">
          <img id="bookCover" class="book-cover" src="" alt="書籍カバー" style="display: none;">
          <div class="book-cover-placeholder">📚</div>
        </div>
        <div class="book-details">
          <h2 id="bookTitle" class="book-title">タイトル未設定</h2>
          <p id="bookAuthor" class="book-author">著者未設定</p>
        </div>
      </div>
    `;
  }

  /**
   * プログレスセクション
   */
  private createProgressSection(): string {
    return `
      <div class="progress-section">
        <div class="progress-stats">
          <div class="stat-item">
            <div class="stat-label">現在のレビュー数</div>
            <div class="stat-value" id="currentReviews">0</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">目標レビュー数</div>
            <div class="stat-value" id="targetReviews">0</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">ストレッチ目標</div>
            <div class="stat-value" id="stretchReviews">0</div>
          </div>
        </div>

        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
            <div class="progress-text" id="progressText">0%</div>
          </div>
          <div class="progress-details">
            <span class="progress-label">目標達成率</span>
          </div>
        </div>

        <div class="achievement-message" id="achievementMessage"></div>
      </div>
    `;
  }

  /**
   * マイルストーンセクション
   */
  private createMilestonesSection(): string {
    return `
      <div class="milestones-section">
        <h3>🎯 マイルストーン</h3>
        <div class="milestone-list" id="milestoneList">
          <!-- マイルストーンは動的に生成 -->
        </div>
      </div>
    `;
  }

  /**
   * イベントをバインド
   */
  private bindEvents(): void {
    // 戻るボタン
    this.addEventListenerToChild('#backBtn', 'click', () => {
      window.location.href = 'index.html';
    });

    // 更新ボタン
    this.addEventListenerToChild('#refreshBtn', 'click', this.handleRefresh.bind(this));

    // シェアボタン
    if (this.options.allowShare && this.elements.shareButton) {
      this.addEventListenerToChild('#shareBtn', 'click', this.handleShare.bind(this));
    }

    // データ更新イベント
    this.context.eventEmitter.on('data:updated', () => {
      this.loadData();
      this.render();
    });
  }

  /**
   * レンダリング
   */
  public render(): void {
    if (!this.progressData) {
      this.renderNoData();
      return;
    }

    const data = this.bookModel.getData();
    
    // 書籍情報を表示
    this.renderBookInfo(data);
    
    // プログレス情報を表示
    this.renderProgress(data);
    
    // マイルストーンを表示
    if (this.options.showMilestones) {
      this.renderMilestones();
    }
    
    // 最終更新時刻を表示
    this.renderLastUpdated(data);
  }

  /**
   * データなしの状態を表示
   */
  private renderNoData(): void {
    if (this.elements.container) {
      this.elements.container.innerHTML = `
        <div class="no-data-message">
          <h2>📝 データが設定されていません</h2>
          <p>まず設定ページで書籍情報を登録してください。</p>
          <a href="index.html" class="btn btn-primary">設定ページへ</a>
        </div>
      `;
    }
  }

  /**
   * 書籍情報をレンダリング
   */
  private renderBookInfo(data: BookData): void {
    // タイトル
    if (this.elements.bookTitle) {
      this.elements.bookTitle.textContent = data.bookTitle || 'タイトル未設定';
    }

    // 著者
    if (this.elements.bookAuthor) {
      this.elements.bookAuthor.textContent = data.bookAuthor || '著者未設定';
    }

    // 書籍カバー
    if (this.elements.bookCover && data.bookCoverUrl) {
      this.elements.bookCover.src = data.bookCoverUrl;
      this.elements.bookCover.style.display = 'block';
      
      // カバープレースホルダーを隠す
      const placeholder = this.select('.book-cover-placeholder');
      if (placeholder) {
        this.hide(placeholder as HTMLElement);
      }
    }
  }

  /**
   * プログレス情報をレンダリング
   */
  private renderProgress(data: BookData): void {
    if (!this.progressData) return;

    // 統計値を更新
    const updates: [string, string][] = [
      ['#currentReviews', data.currentReviews.toLocaleString()],
      ['#targetReviews', data.targetReviews.toLocaleString()],
      ['#stretchReviews', data.stretchReviews.toLocaleString()],
      ['#progressText', `${this.progressData.achievementRate}%`],
    ];

    updates.forEach(([selector, text]) => {
      const element = this.select(selector);
      if (element) {
        element.textContent = text;
      }
    });

    // プログレスバーを更新
    if (this.elements.progressFill) {
      const progressWidth = Math.min(this.progressData.progressPercentage, 100);
      
      if (this.options.enableAnimations) {
        this.animateProgressBar(progressWidth);
      } else {
        this.elements.progressFill.style.width = `${progressWidth}%`;
      }
      
      // プログレスバーの色を設定
      this.updateProgressBarColor(this.progressData.achievementRate);
    }

    // 達成メッセージを表示
    this.renderAchievementMessage();
  }

  /**
   * プログレスバーをアニメーション
   */
  private async animateProgressBar(targetWidth: number): Promise<void> {
    if (!this.elements.progressFill) return;

    return new Promise((resolve) => {
      this.elements.progressFill!.style.transition = `width ${PROGRESS_CONFIG.ANIMATION_DURATION}ms ${ANIMATIONS.EASING.EASE_OUT}`;
      this.elements.progressFill!.style.width = `${targetWidth}%`;
      
      setTimeout(resolve, PROGRESS_CONFIG.ANIMATION_DURATION);
    });
  }

  /**
   * プログレスバーの色を更新
   */
  private updateProgressBarColor(achievementRate: number): void {
    if (!this.elements.progressFill) return;

    this.elements.progressFill.classList.remove('low', 'medium', 'high', 'complete', 'exceed');

    if (achievementRate >= 100) {
      this.elements.progressFill.classList.add('complete');
    } else if (achievementRate >= 75) {
      this.elements.progressFill.classList.add('high');
    } else if (achievementRate >= 50) {
      this.elements.progressFill.classList.add('medium');
    } else {
      this.elements.progressFill.classList.add('low');
    }
  }

  /**
   * 達成メッセージをレンダリング
   */
  private renderAchievementMessage(): void {
    if (!this.progressData) return;

    const messageElement = this.select('#achievementMessage');
    if (!messageElement) return;

    let message = '';
    const rate = this.progressData.achievementRate;

    if (rate >= 100) {
      message = `🎉 目標達成おめでとうございます！ (${rate}%)`;
      messageElement.className = 'achievement-message complete';
    } else if (rate >= 75) {
      message = `🚀 もう少しで目標達成です！ (${rate}%)`;
      messageElement.className = 'achievement-message near-complete';
    } else if (rate >= 50) {
      message = `💪 順調に進んでいます！ (${rate}%)`;
      messageElement.className = 'achievement-message good';
    } else if (rate > 0) {
      message = `📈 スタートを切りました！ (${rate}%)`;
      messageElement.className = 'achievement-message start';
    } else {
      message = '📚 レビュー数が取得されていません。設定ページで更新してください。';
      messageElement.className = 'achievement-message no-data';
    }

    messageElement.textContent = message;
  }

  /**
   * マイルストーンをレンダリング
   */
  private renderMilestones(): void {
    if (!this.elements.milestoneList || !this.progressData) return;

    const currentReviews = this.bookModel.getData().currentReviews;
    const milestones = [...DEFAULT_MILESTONES].sort((a, b) => a - b);

    const milestonesHTML = milestones.map(milestone => {
      const isAchieved = currentReviews >= milestone;
      const icon = MILESTONE_ICONS[milestone as keyof typeof MILESTONE_ICONS] || '🎯';
      
      return `
        <div class="milestone-item ${isAchieved ? 'achieved' : 'pending'}">
          <div class="milestone-icon">${icon}</div>
          <div class="milestone-info">
            <div class="milestone-value">${milestone.toLocaleString()}</div>
            <div class="milestone-status">
              ${isAchieved ? '達成済み' : `あと${(milestone - currentReviews).toLocaleString()}`}
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.elements.milestoneList.innerHTML = milestonesHTML;

    // アニメーション効果を追加
    if (this.options.enableAnimations) {
      this.animateMilestones();
    }
  }

  /**
   * マイルストーンにアニメーション効果を追加（パフォーマンス最適化）
   */
  private animateMilestones(): void {
    const milestoneItems = this.selectAll('.milestone-item');
    
    // バッチ処理でアニメーションクラスを追加
    this.batchDOMOperations(() => {
      milestoneItems.forEach((item, index) => {
        setTimeout(() => {
          this.addClass(item as HTMLElement, 'animate-in');
        }, index * 100);
      });
    });
  }

  /**
   * 最終更新時刻をレンダリング
   */
  private renderLastUpdated(data: BookData): void {
    if (!this.elements.lastUpdated) return;

    if (data.lastUpdated) {
      const date = new Date(data.lastUpdated);
      const formattedDate = date.toLocaleString('ja-JP');
      this.elements.lastUpdated.textContent = `最終更新: ${formattedDate}`;
    } else {
      this.elements.lastUpdated.textContent = '最終更新: 未取得';
    }
  }

  /**
   * 更新ハンドラ
   */
  private async handleRefresh(): Promise<void> {
    if (!this.elements.refreshButton) return;

    try {
      this.elements.refreshButton.disabled = true;
      this.elements.refreshButton.textContent = '🔄 更新中...';

      const data = this.bookModel.getData();
      if (!data.bookUrl) {
        throw new Error('書籍URLが設定されていません');
      }

      // 書籍情報を再取得
      const result = await this.context.bookInfoService.fetchBookInfo(data.bookUrl);
      
      if (result.success && result.data) {
        this.bookModel.updateBookInfo(result.data);
        
        // データを保存
        const success = this.context.storage.set('bookData', this.bookModel.getData());
        if (!success) {
          throw new Error('データの保存に失敗しました');
        }

        this.progressData = this.bookModel.calculateProgress();
        this.render();
        
        // 成功メッセージ
        this.showUpdateMessage('success', '更新完了しました！');
        this.emitEvent('data:updated', this.bookModel.getData());
        
      } else {
        throw new Error(result.errors.join(', ') || '情報を取得できませんでした');
      }
      
    } catch (error) {
      console.error('更新エラー:', error);
      this.showUpdateMessage('error', '更新に失敗しました。しばらく後にお試しください。');
    } finally {
      if (this.elements.refreshButton) {
        this.elements.refreshButton.disabled = false;
        this.elements.refreshButton.textContent = '🔄 更新';
      }
    }
  }

  /**
   * シェアハンドラ
   */
  private async handleShare(): Promise<void> {
    if (!this.progressData) {
      alert('シェアできるデータがありません。');
      return;
    }

    try {
      // シェア用の画像生成
      const shareOptions: ShareOptions = {
        width: 540,
        height: 720,
        quality: 1.0,
        format: 'png',
        includeWatermark: true,
      };

      this.emitEvent('share:started', { data: this.bookModel.getData(), options: shareOptions });
      
      // 現在はイベント発火のみ - 将来的にShareServiceで実装予定  
      alert('シェア機能は今後実装予定です。現在は設定内容をコピーしてお使いください。');
      console.log('シェア機能プレースホルダー:', this.progressData);
      
    } catch (error) {
      console.error('シェアエラー:', error);
      alert('シェアに失敗しました。');
    }
  }

  /**
   * 更新メッセージを表示
   */
  private showUpdateMessage(type: 'success' | 'error', message: string): void {
    // 一時的なメッセージ要素を作成
    const messageElement = this.context.domHelper.create('div', {
      className: `update-message ${type}`,
      textContent: message,
    });

    this.element.appendChild(messageElement);

    // アニメーションで表示
    setTimeout(() => {
      this.addClass(messageElement, 'show');
    }, 10);

    // 3秒後に削除
    setTimeout(() => {
      this.removeClass(messageElement, 'show');
      setTimeout(() => {
        messageElement.remove();
      }, 300);
    }, 3000);
  }

  /**
   * 自動更新を開始（メモリ管理対応）
   */
  private startAutoRefresh(): void {
    this.stopAutoRefresh(); // 既存タイマーを停止

    this.refreshTimerId = this.setManagedInterval(() => {
      this.handleRefresh();
    }, this.options.refreshInterval || 30000);
  }

  /**
   * 自動更新を停止（メモリ管理対応）
   */
  private stopAutoRefresh(): void {
    if (this.refreshTimerId) {
      // memoryManager経由で管理されているため、BaseComponentのcleanupで自動的に清理される
      this.refreshTimerId = undefined;
    }
  }

  /**
   * 現在のプログレスデータを取得
   */
  public getProgressData(): ProgressData | null {
    return this.progressData;
  }

  /**
   * データを強制更新
   */
  public async refreshData(): Promise<void> {
    await this.handleRefresh();
  }

  /**
   * クリーンアップ
   */
  protected override async onDestroy(): Promise<void> {
    this.stopAutoRefresh();
    // 基底クラスのonDestroyは存在しないため削除
  }
}