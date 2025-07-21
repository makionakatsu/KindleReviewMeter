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

export interface BookInfoFormOptions {
  autoSave?: boolean;
  showPreview?: boolean;
  allowManualEdit?: boolean;
}

export class BookInfoForm extends BaseComponent {
  private bookModel: BookDataModel;
  private options: BookInfoFormOptions;
  private fetchStatus: FetchStatus = { type: 'idle', message: '', timestamp: 0 };
  
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
    authorInput?: HTMLInputElement;
    titleInput?: HTMLInputElement;
    currentReviewsInput?: HTMLInputElement;
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
   * 既存データを読み込み
   */
  private loadExistingData(): void {
    try {
      const savedData = this.context.storage.get<BookData>('bookData');
      if (savedData) {
        this.bookModel = new BookDataModel(savedData);
        console.log('既存データを読み込みました:', savedData);
      }
    } catch (error) {
      console.warn('データ読み込みエラー:', error);
    }
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

          <!-- 隠し入力フィールド (著者名の保存用) -->
          <input type="hidden" id="bookAuthor" name="bookAuthor" value="">
          <input type="hidden" id="bookTitle" name="bookTitle" value="">
          <input type="hidden" id="currentReviews" name="currentReviews" value="0">
          
          <div class="button-group">
            <button type="submit" class="btn btn-primary">💾 設定を保存</button>
            <a href="amazon-review-visual.html" class="btn btn-secondary">📊 ビジュアル表示</a>
          </div>
        </form>
      </div>
    `;

    // DOM要素への参照を取得
    console.log('🔍 DOM要素の参照取得開始');
    this.elements = {
      form: this.select<HTMLFormElement>('#settingsForm') ?? undefined,
      urlInput: this.select<HTMLInputElement>('#bookUrl') ?? undefined,
      fetchButton: this.select<HTMLButtonElement>('#fetchAllBtn') ?? undefined,
      targetInput: this.select<HTMLInputElement>('#targetReviews') ?? undefined,
      stretchInput: this.select<HTMLInputElement>('#stretchReviews') ?? undefined,
      statusDisplay: this.select<HTMLElement>('#fetchAllStatus') ?? undefined,
      previewSection: this.select<HTMLElement>('.preview-section') ?? undefined,
      editAuthorButton: this.select<HTMLButtonElement>('#editAuthorBtn') ?? undefined,
      authorInput: this.select<HTMLInputElement>('#bookAuthor') ?? undefined,
      titleInput: this.select<HTMLInputElement>('#bookTitle') ?? undefined,
      currentReviewsInput: this.select<HTMLInputElement>('#currentReviews') ?? undefined,
    };

    // 隠し入力フィールドの存在確認
    console.log('🔍 隠し入力フィールド存在確認:', {
      authorInput: {
        exists: !!this.elements.authorInput,
        element: this.elements.authorInput,
        id: this.elements.authorInput?.id,
        type: this.elements.authorInput?.type,
        value: this.elements.authorInput?.value
      },
      titleInput: {
        exists: !!this.elements.titleInput,
        element: this.elements.titleInput,
        id: this.elements.titleInput?.id,
        type: this.elements.titleInput?.type,
        value: this.elements.titleInput?.value
      },
      currentReviewsInput: {
        exists: !!this.elements.currentReviewsInput,
        element: this.elements.currentReviewsInput,
        id: this.elements.currentReviewsInput?.id,
        type: this.elements.currentReviewsInput?.type,
        value: this.elements.currentReviewsInput?.value
      }
    });
    
    // DOM全体の隠し入力フィールドも検索
    const allHiddenInputs = document.querySelectorAll('input[type="hidden"]');
    console.log('🔍 DOM内の全隠し入力フィールド:', Array.from(allHiddenInputs).map(input => ({
      id: input.id,
      name: (input as HTMLInputElement).name,
      value: (input as HTMLInputElement).value
    })));
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
        
        // 隠し入力フィールドを明示的に更新
        const updatedData = this.bookModel.getData();
        this.syncHiddenInputs(updatedData);
        console.log('📋 取得後データ確認:', {
          bookAuthor: updatedData.bookAuthor,
          bookTitle: updatedData.bookTitle,
          currentReviews: updatedData.currentReviews
        });
        
        this.updatePreview();
        this.showStatus('success', `取得完了: ${result.metadata.extractedFields.join('、')} (${result.metadata.extractedFields.length}/4項目)`);
        
        if (this.options.autoSave) {
          // 自動取得後は隠し入力フィールドを優先せず、現在のモデルデータを保存
          console.log('💾 自動保存開始（モデルデータ優先）');
          const currentData = this.bookModel.getData();
          const success = this.context.storage.set('bookData', currentData);
          if (!success) {
            throw new Error('データの保存に失敗しました');
          }
          console.log('💾 自動保存完了:', currentData);
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
            this.updatePreview();
            this.showStatus('success', `著者名を「${cleanedAuthor}」に更新しました`);
            
            if (this.options.autoSave) {
              // 著者名編集後も現在のモデルデータを直接保存
              console.log('💾 著者名編集後の自動保存開始');
              const currentData = this.bookModel.getData();
              const success = this.context.storage.set('bookData', currentData);
              if (!success) {
                throw new Error('データの保存に失敗しました');
              }
              console.log('💾 著者名編集後の自動保存完了:', currentData);
            }
          } else {
            this.showStatus('error', '無効な著者名です。2-50文字で、適切な文字を使用してください。');
          }
        } else {
          this.bookModel.updateData({ bookAuthor: '' });
          this.updatePreview();
          this.showStatus('success', '著者名を「未設定」にリセットしました');
          
          if (this.options.autoSave) {
            // 著者名リセット後も現在のモデルデータを直接保存
            console.log('💾 著者名リセット後の自動保存開始');
            const currentData = this.bookModel.getData();
            const success = this.context.storage.set('bookData', currentData);
            if (!success) {
              throw new Error('データの保存に失敗しました');
            }
            console.log('💾 著者名リセット後の自動保存完了:', currentData);
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
   * フォームデータを取得
   */
  private getFormData(): Partial<BookData> {
    console.log('📄 getFormData() 開始');
    
    const data = this.bookModel.getData();
    console.log('📊 現在のBookDataModelデータ:', {
      bookTitle: data.bookTitle,
      bookAuthor: data.bookAuthor,
      currentReviews: data.currentReviews,
      bookCoverUrl: data.bookCoverUrl
    });
    
    // 隠し入力フィールドの値を個別に検証
    const hiddenAuthorValue = this.elements.authorInput?.value;
    const hiddenTitleValue = this.elements.titleInput?.value;
    const hiddenReviewsValue = this.elements.currentReviewsInput?.value;
    
    console.log('🔍 隠し入力フィールドからの値:', {
      authorInput: {
        exists: !!this.elements.authorInput,
        value: hiddenAuthorValue,
        isUndefined: hiddenAuthorValue === undefined,
        isNull: hiddenAuthorValue === null,
        isEmpty: hiddenAuthorValue === '',
        length: hiddenAuthorValue?.length
      },
      titleInput: {
        exists: !!this.elements.titleInput,
        value: hiddenTitleValue,
        isUndefined: hiddenTitleValue === undefined,
        isNull: hiddenTitleValue === null,
        isEmpty: hiddenTitleValue === '',
        length: hiddenTitleValue?.length
      },
      reviewsInput: {
        exists: !!this.elements.currentReviewsInput,
        value: hiddenReviewsValue,
        isUndefined: hiddenReviewsValue === undefined,
        isNull: hiddenReviewsValue === null,
        isEmpty: hiddenReviewsValue === '',
        parsedInt: hiddenReviewsValue ? parseInt(hiddenReviewsValue, 10) : null
      }
    });
    
    // 値の決定プロセスを詳細にログ
    const authorValue = this.elements.authorInput?.value || data.bookAuthor || '';
    const titleValue = this.elements.titleInput?.value || data.bookTitle || '';
    const reviewsValue = parseInt(this.elements.currentReviewsInput?.value || '0', 10) || data.currentReviews;
    
    console.log('🔄 値の決定プロセス:', {
      author: {
        hiddenInputValue: this.elements.authorInput?.value,
        modelValue: data.bookAuthor,
        finalValue: authorValue,
        source: this.elements.authorInput?.value ? 'hiddenInput' : (data.bookAuthor ? 'model' : 'empty')
      },
      title: {
        hiddenInputValue: this.elements.titleInput?.value,
        modelValue: data.bookTitle,
        finalValue: titleValue,
        source: this.elements.titleInput?.value ? 'hiddenInput' : (data.bookTitle ? 'model' : 'empty')
      },
      reviews: {
        hiddenInputValue: this.elements.currentReviewsInput?.value,
        modelValue: data.currentReviews,
        finalValue: reviewsValue,
        source: this.elements.currentReviewsInput?.value ? 'hiddenInput' : 'model'
      }
    });
    
    const formData = {
      bookUrl: this.elements.urlInput?.value?.trim() || '',
      targetReviews: parseInt(this.elements.targetInput?.value || '0', 10),
      stretchReviews: parseInt(this.elements.stretchInput?.value || '0', 10),
      bookTitle: titleValue,
      bookAuthor: authorValue,
      currentReviews: reviewsValue,
      averageRating: data.averageRating,
      bookImage: data.bookImage,
      lastFetchedAt: data.lastFetchedAt,
    };
    
    console.log('📤 最終的なフォームデータ:', formData);
    console.log('✅ getFormData() 完了');
    
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
   * データを保存
   */
  private async saveData(): Promise<void> {
    try {
      const formData = this.getFormData();
      this.bookModel.updateData(formData);
      
      const success = this.context.storage.set('bookData', this.bookModel.getData());
      if (!success) {
        throw new Error('データの保存に失敗しました');
      }
      
      console.log('データを保存しました:', this.bookModel.getData());
    } catch (error) {
      console.error('データ保存エラー:', error);
      throw new Error('設定の保存に失敗しました');
    }
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

    // 隠し入力フィールドを更新
    this.syncHiddenInputs(data);

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
   * 隠し入力フィールドを同期
   */
  private syncHiddenInputs(data: BookData): void {
    console.log('🔄 隠し入力フィールド同期開始:', {
      inputData: {
        bookAuthor: data.bookAuthor,
        bookTitle: data.bookTitle,
        currentReviews: data.currentReviews
      },
      elements: {
        authorInputExists: !!this.elements.authorInput,
        titleInputExists: !!this.elements.titleInput,
        reviewsInputExists: !!this.elements.currentReviewsInput
      }
    });
    
    if (this.elements.authorInput) {
      this.elements.authorInput.value = data.bookAuthor || '';
      console.log('📝 著者入力フィールド更新:', this.elements.authorInput.value);
    }
    if (this.elements.titleInput) {
      this.elements.titleInput.value = data.bookTitle || '';
      console.log('📝 タイトル入力フィールド更新:', this.elements.titleInput.value);
    }
    if (this.elements.currentReviewsInput) {
      this.elements.currentReviewsInput.value = data.currentReviews.toString();
      console.log('📝 レビュー数入力フィールド更新:', this.elements.currentReviewsInput.value);
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
      }, 5000);
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