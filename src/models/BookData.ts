/**
 * 書籍データモデル
 * 
 * 【責任範囲】
 * - 書籍情報の状態管理と整合性保証
 * - プログレス計算ロジック（達成率、残り目標等）の実装
 * - データバリデーションと正規化処理
 * - モデルの永続化状態とビューの同期管理
 * - ビジネスルールの実装（目標設定の制約、マイルストーン管理）
 * 
 * 【管理データ】
 * - 書籍基本情報：タイトル、著者、URL、書影
 * - レビュー関連：現在数、目標数、ストレッチ目標
 * - メタデータ：最終更新日時、データソース
 * 
 * 【計算機能】
 * - 達成率：現在レビュー数 / 目標レビュー数 × 100
 * - プログレス率：グラフ表示用の正規化値
 * - マイルストーン判定：各中間目標の達成状況
 * - 残り目標：目標達成までの必要レビュー数
 * 
 * 【データ整合性】
 * - 必須フィールドの検証
 * - 数値範囲の妥当性チェック
 * - 目標値の論理的制約（ストレッチ > 基本目標）
 */

import { BookData, PartialBookData, ProgressData, Milestone } from '../types/index.js';

export class BookDataModel {
  private data: BookData;

  constructor(data?: Partial<BookData>) {
    this.data = this.initializeData(data);
  }

  /**
   * データの初期化
   */
  private initializeData(data?: Partial<BookData>): BookData {
    const defaultData: BookData = {
      bookUrl: '',
      bookTitle: '',
      bookAuthor: '',
      currentReviews: 0,
      targetReviews: 0,
      stretchReviews: 0,
      bookCoverUrl: '',
      lastUpdated: new Date().toISOString(),
    };

    return { ...defaultData, ...data };
  }

  /**
   * 現在のデータを取得
   */
  getData(): BookData {
    return { ...this.data };
  }

  /**
   * データを更新
   */
  updateData(updates: Partial<BookData>): void {
    this.data = {
      ...this.data,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 書籍情報を更新
   */
  updateBookInfo(info: PartialBookData): void {
    const updates: Partial<BookData> = {};
    
    if (info.bookTitle !== undefined) updates.bookTitle = info.bookTitle;
    if (info.bookAuthor !== undefined) updates.bookAuthor = info.bookAuthor;
    if (info.currentReviews !== undefined) updates.currentReviews = info.currentReviews;
    if (info.bookCoverUrl !== undefined) updates.bookCoverUrl = info.bookCoverUrl;

    this.updateData(updates);
  }

  /**
   * 進捗データを計算
   */
  calculateProgress(): ProgressData {
    const { currentReviews, targetReviews, stretchReviews } = this.data;

    // 達成率の計算
    const achievementRate = targetReviews > 0 
      ? Math.min(Math.round((currentReviews / targetReviews) * 100), 100)
      : 0;

    // 残り数の計算
    const remainingToTarget = Math.max(targetReviews - currentReviews, 0);
    const remainingToStretch = Math.max(stretchReviews - currentReviews, 0);

    // マイルストーンの生成
    const milestones = this.generateMilestones();

    return {
      currentReviews,
      targetReviews,
      stretchReviews,
      achievementRate,
      remainingToTarget,
      remainingToStretch,
      milestones,
      progressPercentage: achievementRate,
    };
  }

  /**
   * マイルストーンを生成
   */
  private generateMilestones(): Milestone[] {
    const milestones: Milestone[] = [];
    const { currentReviews, targetReviews, stretchReviews } = this.data;

    // 目標マイルストーン
    if (targetReviews > 0) {
      milestones.push({
        value: targetReviews,
        icon: '🎁',
        isTarget: true,
        isStretch: false,
        isAchieved: currentReviews >= targetReviews,
        type: 'target',
      });
    }

    // ストレッチ目標マイルストーン
    if (stretchReviews > 0 && stretchReviews > targetReviews) {
      milestones.push({
        value: stretchReviews,
        icon: '🌟',
        isTarget: false,
        isStretch: true,
        isAchieved: currentReviews >= stretchReviews,
        type: 'stretch',
      });
    }

    // 値でソート
    return milestones.sort((a, b) => a.value - b.value);
  }

  /**
   * データが有効かチェック
   */
  isValid(): boolean {
    return (
      this.data.bookTitle.trim().length > 0 &&
      this.data.bookUrl.trim().length > 0 &&
      this.data.targetReviews > 0 &&
      this.data.stretchReviews > this.data.targetReviews
    );
  }

  /**
   * データが設定済みかチェック
   */
  isConfigured(): boolean {
    return this.isValid() && this.data.currentReviews >= 0;
  }

  /**
   * 目標達成状況を取得
   */
  getAchievementStatus(): {
    targetAchieved: boolean;
    stretchAchieved: boolean;
    overAchieved: boolean;
  } {
    const { currentReviews, targetReviews, stretchReviews } = this.data;

    return {
      targetAchieved: currentReviews >= targetReviews,
      stretchAchieved: currentReviews >= stretchReviews,
      overAchieved: currentReviews > stretchReviews,
    };
  }

  /**
   * 進捗率を取得（ストレッチ目標基準）
   */
  getProgressPercentage(): number {
    const { currentReviews, stretchReviews } = this.data;
    return stretchReviews > 0 
      ? Math.min((currentReviews / stretchReviews) * 100, 100)
      : 0;
  }

  /**
   * JSON形式でエクスポート
   */
  toJSON(): BookData {
    return this.getData();
  }

  /**
   * JSONからインポート
   */
  static fromJSON(json: string | object): BookDataModel {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      return new BookDataModel(data);
    } catch (error) {
      throw new Error(`Invalid JSON data: ${error}`);
    }
  }

  /**
   * データをリセット
   */
  reset(): void {
    this.data = this.initializeData();
  }

  /**
   * 特定のフィールドをクリア
   */
  clearField(field: keyof BookData): void {
    const updates: Partial<BookData> = {};
    
    switch (field) {
      case 'bookTitle':
      case 'bookAuthor':
      case 'bookUrl':
      case 'bookCoverUrl':
        updates[field] = '';
        break;
      case 'currentReviews':
      case 'targetReviews':
      case 'stretchReviews':
        updates[field] = 0;
        break;
      default:
        return;
    }
    
    this.updateData(updates);
  }

  /**
   * データのクローンを作成
   */
  clone(): BookDataModel {
    return new BookDataModel(this.data);
  }

  /**
   * 他のBookDataModelと比較
   */
  equals(other: BookDataModel): boolean {
    const thisData = this.getData();
    const otherData = other.getData();
    
    return JSON.stringify(thisData) === JSON.stringify(otherData);
  }

  /**
   * 変更が必要な最小限のフィールドを取得
   */
  getDiff(other: BookDataModel): Partial<BookData> {
    const thisData = this.getData();
    const otherData = other.getData();
    const diff: Partial<BookData> = {};

    (Object.keys(thisData) as Array<keyof BookData>).forEach(key => {
      if (thisData[key] !== otherData[key]) {
        diff[key] = thisData[key] as any;
      }
    });

    return diff;
  }

  /**
   * データのサマリーを取得
   */
  getSummary(): {
    title: string;
    author: string;
    progress: string;
    status: string;
  } {
    const { bookTitle, bookAuthor, currentReviews, targetReviews } = this.data;
    const achievementRate = this.calculateProgress().achievementRate;

    let status = 'not_started';
    if (achievementRate >= 100) status = 'completed';
    else if (achievementRate > 0) status = 'in_progress';

    return {
      title: bookTitle || '未設定',
      author: bookAuthor || '未設定',
      progress: `${currentReviews} / ${targetReviews} (${achievementRate}%)`,
      status,
    };
  }
}