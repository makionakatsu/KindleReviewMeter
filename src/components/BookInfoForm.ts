/**
 * 書籍情報フォームコンポーネント
 * 
 * 【責任範囲】
 * - Amazon書籍URLの入力と検証を管理
 * - 書籍情報（タイトル、著者、レビュー数、書影）の自動取得機能を提供
 * - 目標レビュー数とストレッチ目標の設定フォームを管理
 * - リアルタイムプレビュー表示で設定内容の可視化
 * - 著者名の手動修正機能（自動取得結果が不正確な場合の対応）
 * - フォームバリデーションとエラー表示
 * - データの永続化（LocalStorage）とデータモデルとの連携
 * 
 * 【主要機能】
 * - URLバリデーション：Amazon.co.jp/Amazon.comのURL形式チェック
 * - 自動取得：プロキシサービス経由での書籍情報スクレイピング
 * - プレビュー：設定値の即座反映とプログレス計算表示
 * - エラーハンドリング：ネットワークエラー、パースエラーの適切な処理
 * 
 * 【データフロー】
 * 1. ユーザーURL入力 → 2. 自動取得実行 → 3. データ解析・保存 → 4. プレビュー更新
 */

import { BaseComponent } from './BaseComponent.js';
import { ApplicationContext, BookData, FetchStatus, ValidationResult } from '../types/index.js';
import { BookDataModel } from '../models/BookData.js';
import { STATUS_MESSAGE_DURATION, SAVE_POLLING_INTERVAL } from '../utils/constants.js';

export interface BookInfoFormOptions {
  autoSave?: boolean;
  showPreview?: boolean;
  allowManualEdit?: boolean;
}

export class BookInfoForm extends BaseComponent {
  private bookModel: BookDataModel;
  private options: BookInfoFormOptions;
  private fetchStatus: FetchStatus = { type: 'idle', message: '', timestamp: 0 };
  private saveInProgress: boolean = false;
  private saveOperationId: number = 0;
  
  // DOM要素への参照
  private elements: {
    form?: HTMLFormElement;
    urlInput?: HTMLInputElement;
    fetchButton?: HTMLButtonElement;
    targetInput?: HTMLInputElement;
    stretchInput?: HTMLInputElement;
    statusDisplay?: HTMLElement;
    previewSection?: HTMLElement;
    editAuthorButton?: HTMLButtonElement;
  } = {};

  constructor(
    container: HTMLElement,
    context: ApplicationContext,
    options: BookInfoFormOptions = {}
  ) {
    super(container, context);
    this.options = {
      autoSave: true,
      showPreview: true,
      allowManualEdit: true,
      ...options,
    };
    this.bookModel = new BookDataModel();
    this.loadExistingData();
  }

  /**
   * 既存データを読み込み（整合性検証付き）
   */
  private loadExistingData(): void {
    try {
      const savedData = this.context.storage.get<BookData>('amazonReviewTracker');
      if (savedData) {
        // データ整合性検証
        if (this.validateBookDataStructure(savedData)) {
          this.bookModel = new BookDataModel(savedData);
          console.log('✅ 既存データ読み込み成功:', {
            hasTitle: !!savedData.bookTitle,
            hasAuthor: !!savedData.bookAuthor,
            hasReviews: typeof savedData.currentReviews === 'number',
            data: savedData
          });
        } else {
          console.warn('⚠️ 既存データ構造が不正です。新しいモデルを作成:', savedData);
          this.bookModel = new BookDataModel();
        }
      }
    } catch (error) {
      console.error('❌ データ読み込みエラー:', error);
      this.bookModel = new BookDataModel();
    }
  }

  /**
   * BookDataの構造を検証
   */
  private validateBookDataStructure(data: any): data is BookData {
    if (!data || typeof data !== 'object') {
      console.warn('データが存在しないか、オブジェクトではありません:', data);
      return false;
    }

    const requiredFields = ['bookTitle', 'bookAuthor', 'currentReviews', 'targetReviews', 'stretchReviews'];
    const missingFields = requiredFields.filter(field => !(field in data));
    
    if (missingFields.length > 0) {
      console.warn('必須フィールドが不足しています:', {
        missingFields,
        providedFields: Object.keys(data),
        data
      });
      return false;
    }

    if (typeof data.currentReviews !== 'number' || data.currentReviews < 0) {
      console.warn('currentReviewsが無効です:', data.currentReviews);
      return false;
    }

    if (typeof data.targetReviews !== 'number' || data.targetReviews < 0) {
      console.warn('targetReviewsが無効です:', data.targetReviews);
      return false;
    }

    console.log('✅ データ構造検証成功:', {
      bookTitle: typeof data.bookTitle,
      bookAuthor: typeof data.bookAuthor,
      currentReviews: typeof data.currentReviews,
      targetReviews: typeof data.targetReviews
    });
    
    return true;
  }

  /**
   * コンポーネントの初期化
   */
  protected override async onInit(): Promise<void> {
    this.createFormStructure();
    this.bindEvents();
    this.loadExistingData();
    this.updatePreview();
  }

  /**
   * フォーム構造を作成
   */
  private createFormStructure(): void {
    this.element.innerHTML = `
      <div class="book-info-form">
        <h1>📚 Amazon書籍レビュー数トラッカー</h1>
        
        <form id="settingsForm" class="settings-form">
          <!-- 書籍URLセクション -->
          <div class="form-group">
            <div class="section-title">📚 書籍情報</div>
            <label for="bookUrl">Amazon書籍URL <span class="required">*</span></label>
            <div class="input-with-button">
              <input type="url" id="bookUrl" name="bookUrl" placeholder="https://www.amazon.co.jp/dp/..." required>
              <button type="button" id="fetchAllBtn" class="btn-fetch">🚀 自動取得</button>
            </div>
            <div class="fetch-status" id="fetchAllStatus"></div>
            <div class="error" id="bookUrlError">有効なAmazonのURLを入力してください</div>
            <div class="auto-fetch-info">
              🎆 URLを入力して自動取得ボタンをクリックすると、タイトル・レビュー数・書影が自動で取得されます！
            </div>
          </div>

          <!-- 目標設定セクション -->
          <div class="form-group">
            <div class="section-title">🎯 目標設定</div>
            
            <label for="targetReviews">目標レビュー数 <span class="required">*</span></label>
            <input type="number" id="targetReviews" name="targetReviews" required min="1" placeholder="100">
            <div class="error" id="targetReviewsError">1以上の整数を入力してください</div>

            <label for="stretchReviews" style="margin-top: 15px;">ストレッチ目標レビュー数 <span class="required">*</span></label>
            <input type="number" id="stretchReviews" name="stretchReviews" required min="1" placeholder="200">
            <div class="error" id="stretchReviewsError">目標レビュー数より大きい整数を入力してください</div>
          </div>

          ${this.options.showPreview ? this.createPreviewSection() : ''}
          
          <div class="button-group">
            <button type="submit" class="btn btn-primary">💾 設定を保存</button>
            <a href="amazon-review-visual.html" class="btn btn-secondary">📊 ビジュアル表示</a>
          </div>
        </form>
      </div>
    `;

    // DOM要素への参照を取得
    this.elements = {
      form: this.select<HTMLFormElement>('#settingsForm') ?? undefined,
      urlInput: this.select<HTMLInputElement>('#bookUrl') ?? undefined,
      fetchButton: this.select<HTMLButtonElement>('#fetchAllBtn') ?? undefined,
      targetInput: this.select<HTMLInputElement>('#targetReviews') ?? undefined,
      stretchInput: this.select<HTMLInputElement>('#stretchReviews') ?? undefined,
      statusDisplay: this.select<HTMLElement>('#fetchAllStatus') ?? undefined,
      previewSection: this.select<HTMLElement>('.preview-section') ?? undefined,
      editAuthorButton: this.select<HTMLButtonElement>('#editAuthorBtn') ?? undefined,
    };
  }

  /**
   * プレビューセクションのHTML
   */
  private createPreviewSection(): string {
    return `
      <div class="preview-section">
        <div class="preview-title">📊 設定プレビュー</div>
        <div class="preview-item">
          <span class="preview-label">書籍タイトル:</span>
          <span class="preview-value" id="previewTitle">未設定</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">著者名:</span>
          <span class="preview-value" id="previewAuthor">未設定</span>
          ${this.options.allowManualEdit ? '<button type="button" id="editAuthorBtn" class="btn-edit" style="display: none;">✏️ 修正</button>' : ''}
        </div>
        <div class="preview-item">
          <span class="preview-label">現在のレビュー数:</span>
          <span class="preview-value" id="previewCurrent">0</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">目標レビュー数:</span>
          <span class="preview-value" id="previewTarget">未設定</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">ストレッチ目標:</span>
          <span class="preview-value" id="previewStretch">未設定</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">達成率:</span>
          <span class="preview-value" id="previewProgress">0%</span>
        </div>
        <div class="preview-item">
          <span class="preview-label">自動取得状態:</span>
          <span class="preview-value" id="previewAutoFetch">未取得</span>
        </div>
      </div>
    `;
  }

  /**
   * イベントをバインド
   */
  private bindEvents(): void {
    // フォーム送信
    this.addEventListenerToChild('form', 'submit', this.handleFormSubmit.bind(this));

    // 自動取得ボタン
    this.addEventListenerToChild('#fetchAllBtn', 'click', this.handleAutoFetch.bind(this));

    // 入力値変更時のプレビュー更新
    this.addEventListenerToChild('#bookUrl', 'input', this.updatePreview.bind(this));
    this.addEventListenerToChild('#targetReviews', 'input', this.updatePreview.bind(this));
    this.addEventListenerToChild('#stretchReviews', 'input', this.updatePreview.bind(this));

    // 著者名手動編集ボタン
    if (this.options.allowManualEdit && this.elements.editAuthorButton) {
      this.addEventListenerToChild('#editAuthorBtn', 'click', this.handleAuthorEdit.bind(this));
    }
  }

  /**
   * 既存データでフォームを初期化
   */
  private populateForm(): void {
    const data = this.bookModel.getData();
    
    if (this.elements.urlInput) this.elements.urlInput.value = data.bookUrl;
    if (this.elements.targetInput) this.elements.targetInput.value = data.targetReviews.toString();
    if (this.elements.stretchInput) this.elements.stretchInput.value = data.stretchReviews.toString();
  }

  /**
   * レンダリング
   */
  public render(): void {
    this.populateForm();
    this.updatePreview();
  }

  /**
   * フォーム送信ハンドラ
   */
  private async handleFormSubmit(event: Event): Promise<void> {
    event.preventDefault();
    
    try {
      const validationResult = this.validateForm();
      if (!validationResult.isValid) {
        this.displayValidationErrors(validationResult);
        return;
      }

      await this.saveData();
      this.showSuccess('設定が保存されました！\n\nビジュアル表示ページで確認してください。');
      this.emitEvent('form:submitted', this.bookModel.getData());
      
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * 自動取得ハンドラ
   */
  private async handleAutoFetch(event: Event): Promise<void> {
    event.preventDefault();
    
    const url = this.elements.urlInput?.value?.trim();
    if (!url) {
      this.showStatus('error', 'URLを入力してください');
      return;
    }

    if (!this.context.bookInfoService.validateUrl(url)) {
      this.showStatus('error', '有効なAmazonのURLを入力してください');
      return;
    }

    try {
      this.setLoading(true);
      this.showStatus('loading', '書籍情報を取得中...');
      
      if (this.elements.fetchButton) {
        this.elements.fetchButton.disabled = true;
        this.elements.fetchButton.textContent = '🚀 取得中...';
      }

      const result = await this.context.bookInfoService.fetchBookInfo(url);
      
      console.log('🔍 BookInfoService結果詳細:', {
        success: result.success,
        data: result.data,
        dataKeys: result.data ? Object.keys(result.data) : [],
        authorValue: result.data?.bookAuthor,
        authorType: typeof result.data?.bookAuthor,
        authorLength: result.data?.bookAuthor?.length || 0,
        titleValue: result.data?.bookTitle,
        reviewsValue: result.data?.currentReviews,
        errors: result.errors,
        metadata: result.metadata
      });
      
      if (result.success && result.data) {
        // 取得したデータでモデルを更新
        console.log('📊 フェッチ前のモデル状態:', this.bookModel.getData());
        this.bookModel.updateData({ bookUrl: url });
        console.log('📊 URL更新後のモデル状態:', this.bookModel.getData());
        this.bookModel.updateBookInfo(result.data);
        console.log('📊 BookInfo更新後のモデル状態:', this.bookModel.getData());
        
        console.log('📋 取得後データ確認:', {
          bookAuthor: this.bookModel.getData().bookAuthor,
          bookTitle: this.bookModel.getData().bookTitle,
          currentReviews: this.bookModel.getData().currentReviews
        });
        
        this.updatePreview();
        this.showStatus('success', `取得完了: ${result.metadata.extractedFields.join('、')} (${result.metadata.extractedFields.length}/4項目)`);
        
        if (this.options.autoSave) {
          await this.saveModelDataDirectly('自動取得後');
        }
        
        this.emitEvent('book:fetched', result);
      } else {
        this.showStatus('error', result.errors.join(', ') || '情報を取得できませんでした');
      }
      
    } catch (error) {
      console.error('書籍情報取得エラー:', error);
      this.showStatus('error', '取得に失敗しました。しばらく後にお試しください。');
    } finally {
      this.setLoading(false);
      if (this.elements.fetchButton) {
        this.elements.fetchButton.disabled = false;
        this.elements.fetchButton.textContent = '🚀 自動取得';
      }
    }
  }

  /**
   * 著者名編集ハンドラ
   */
  private async handleAuthorEdit(event: Event): Promise<void> {
    event.preventDefault();
    
    const currentAuthor = this.bookModel.getData().bookAuthor || '';
    const newAuthor = prompt('著者名を入力・修正してください:\n（空白にすると「未設定」になります）', currentAuthor);
    
    if (newAuthor !== null) {
      try {
        if (newAuthor.trim() !== '') {
          const cleanedAuthor = this.context.validationService.sanitizeInput(newAuthor);
          if (this.context.validationService.validateAuthorName(cleanedAuthor)) {
            this.bookModel.updateData({ bookAuthor: cleanedAuthor });
            
            console.log('📝 著者名編集完了:', {
              newAuthor: cleanedAuthor,
              modelAuthor: this.bookModel.getData().bookAuthor
            });
            
            this.updatePreview();
            this.showStatus('success', `著者名を「${cleanedAuthor}」に更新しました`);
            
            if (this.options.autoSave) {
              // 著者名編集後の自動保存（排他制御使用）
              console.log('💾 著者名編集後の自動保存開始');
              await this.saveModelDataDirectly('著者名編集');
            }
          } else {
            this.showStatus('error', '無効な著者名です。2-50文字で、適切な文字を使用してください。');
          }
        } else {
          this.bookModel.updateData({ bookAuthor: '' });
          
          console.log('📝 著者名リセット完了:', {
            modelAuthor: this.bookModel.getData().bookAuthor
          });
          
          this.updatePreview();
          this.showStatus('success', '著者名を「未設定」にリセットしました');
          
          if (this.options.autoSave) {
            // 著者名リセット後の自動保存（排他制御使用）
            console.log('💾 著者名リセット後の自動保存開始');
            await this.saveModelDataDirectly('著者名リセット');
          }
        }
        
        this.emitEvent('author:edited', this.bookModel.getData().bookAuthor);
      } catch (error) {
        this.handleError(error as Error);
      }
    }
  }

  /**
   * フォームバリデーション
   */
  private validateForm(): ValidationResult {
    const formData = this.getFormData();
    return this.context.validationService.validateBookData(formData);
  }

  /**
   * フォームデータを取得（簡素化版）
   * 
   * データソースの設計方針:
   * - ユーザー入力値（URL, 目標値）: 直接フォームから取得
   * - 書籍情報（タイトル、著者、レビュー数）: BookDataModelから取得（自動取得・編集結果を反映）
   * - メタデータ: BookDataModelから取得（一貫性を保証）
   */
  private getFormData(): Partial<BookData> {
    const modelData = this.bookModel.getData();
    
    const formData = {
      // ユーザー直接入力値 - フォームが信頼できるソース
      bookUrl: this.elements.urlInput?.value?.trim() || '',
      targetReviews: parseInt(this.elements.targetInput?.value || '0', 10),
      stretchReviews: parseInt(this.elements.stretchInput?.value || '0', 10),
      
      // 書籍データ - BookDataModelが信頼できるソース（自動取得・手動編集を反映）
      bookTitle: modelData.bookTitle,
      bookAuthor: modelData.bookAuthor,  // 著者名編集はここで反映される
      currentReviews: modelData.currentReviews,
      averageRating: modelData.averageRating,
      bookImage: modelData.bookImage,
      lastFetchedAt: modelData.lastFetchedAt,
    };
    
    console.log('📤 フォームデータ結合:', {
      userInputs: { url: formData.bookUrl, target: formData.targetReviews, stretch: formData.stretchReviews },
      modelData: { title: formData.bookTitle, author: formData.bookAuthor, current: formData.currentReviews }
    });
    
    return formData;
  }

  /**
   * バリデーションエラーを表示
   */
  private displayValidationErrors(result: ValidationResult): void {
    // エラー表示をリセット
    this.selectAll('.error').forEach(error => this.hide(error as HTMLElement));
    this.selectAll('input').forEach(input => input.classList.remove('input-error'));

    // エラーを表示
    Object.entries(result.errors).forEach(([field, message]) => {
      const errorElement = this.select(`#${field}Error`);
      const inputElement = this.select(`#${field}`) as HTMLInputElement;
      
      if (errorElement) {
        errorElement.textContent = message;
        this.show(errorElement as HTMLElement);
      }
      
      if (inputElement) {
        inputElement.classList.add('input-error');
      }
    });

    // 警告を表示
    if (result.warnings.length > 0) {
      console.warn('バリデーション警告:', result.warnings);
    }
  }

  /**
   * モデルデータを直接保存（排他制御付き）
   */
  private async saveModelDataDirectly(operationName: string): Promise<void> {
    const operationId = ++this.saveOperationId;
    
    if (this.saveInProgress) {
      console.log(`⏳ ${operationName}: 保存操作が進行中です。待機中...`, { operationId });
      while (this.saveInProgress) {
        await new Promise(resolve => setTimeout(resolve, SAVE_POLLING_INTERVAL));
      }
      console.log(`⌛ ${operationName}: 前の保存操作完了を確認`, { operationId });
    }

    this.saveInProgress = true;
    console.log(`🔒 ${operationName}: モデル直接保存開始`, { operationId, timestamp: Date.now() });
    
    try {
      const currentData = this.bookModel.getData();
      console.log(`📊 ${operationName}: 保存するモデルデータ:`, { operationId, data: currentData });
      
      const success = this.context.storage.set('amazonReviewTracker', currentData);
      if (!success) {
        throw new Error('データの保存に失敗しました');
      }
      
      console.log(`💾 ${operationName}: モデル直接保存成功:`, { 
        operationId, 
        savedData: currentData,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error(`❌ ${operationName}: モデル直接保存エラー:`, { operationId, error });
      throw new Error('設定の保存に失敗しました');
    } finally {
      this.saveInProgress = false;
      console.log(`🔓 ${operationName}: モデル直接保存完了`, { operationId, timestamp: Date.now() });
    }
  }

  /**
   * データを保存（フォーム送信用 - モデルとフォーム入力の統合）
   */
  private async saveData(): Promise<void> {
    const formData = this.getFormData();
    this.bookModel.updateData(formData);
    await this.saveModelDataDirectly('フォーム送信');
  }

  /**
   * プレビューを更新
   */
  private updatePreview(): void {
    const data = this.bookModel.getData();
    const progressData = this.bookModel.calculateProgress();

    console.log('🔄 プレビュー更新開始 - モデルデータ:', {
      bookTitle: data.bookTitle,
      bookAuthor: data.bookAuthor,
      currentReviews: data.currentReviews
    });

    // プレビューデータの更新

    if (!this.options.showPreview) return;

    // 目標値は入力フィールドから直接取得
    const targetReviews = parseInt(this.elements.targetInput?.value || '0', 10);
    const stretchReviews = parseInt(this.elements.stretchInput?.value || '0', 10);

    // プレビュー要素を更新
    const updates: [string, string][] = [
      ['#previewTitle', data.bookTitle || '未設定'],
      ['#previewAuthor', data.bookAuthor || '未設定'],
      ['#previewCurrent', data.currentReviews.toString()],
      ['#previewTarget', targetReviews ? targetReviews.toString() : '未設定'],
      ['#previewStretch', stretchReviews ? stretchReviews.toString() : '未設定'],
      ['#previewProgress', `${progressData.achievementRate}%`],
      ['#previewAutoFetch', data.bookTitle ? '取得済み' : '未取得'],
    ];

    console.log('🔄 プレビュー更新内容:', updates);

    updates.forEach(([selector, text]) => {
      const element = this.select(selector);
      if (element) {
        element.textContent = text;
      }
    });

    // 著者名編集ボタンの表示制御
    if (this.elements.editAuthorButton) {
      this.toggle(this.elements.editAuthorButton, data.bookTitle !== '');
    }
  }


  /**
   * ステータスメッセージを表示
   */
  private showStatus(type: 'loading' | 'success' | 'error', message: string): void {
    if (!this.elements.statusDisplay) return;

    this.fetchStatus = {
      type,
      message,
      timestamp: Date.now(),
    };

    this.elements.statusDisplay.className = `fetch-status ${type}`;
    this.elements.statusDisplay.textContent = message;
    this.show(this.elements.statusDisplay);

    // 成功・エラーメッセージは5秒後に非表示
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        if (this.elements.statusDisplay) {
          this.hide(this.elements.statusDisplay);
        }
      }, STATUS_MESSAGE_DURATION);
    }
  }

  /**
   * 成功メッセージを表示
   */
  private showSuccess(message: string): void {
    alert(message);
  }

  /**
   * 現在の書籍データを取得
   */
  public getBookData(): BookData {
    return this.bookModel.getData();
  }

  /**
   * 書籍データを設定
   */
  public setBookData(data: Partial<BookData>): void {
    this.bookModel.updateData(data);
    this.render();
  }

  /**
   * フォームをリセット
   */
  public resetForm(): void {
    this.bookModel.reset();
    this.render();
    this.showStatus('success', 'フォームがリセットされました');
  }
}