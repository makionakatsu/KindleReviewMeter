/**
 * BookTextGenerator - Text generation logic for book sharing and display
 * Extracted from BookDataModel.js - handles tweet text and summary generation
 * 
 * Responsibilities:
 * - Generate Twitter-ready text for book sharing
 * - Create shareable URLs with associate tags
 * - Provide summary text for various UI components
 * - Handle text formatting and truncation
 */

export default class BookTextGenerator {
  constructor() {
    // Default hashtag and branding
    this.defaultHashtag = '#KindleReviewMeter';
    this.associateDisclosure = '#アマゾンアソシエイトに参加しています';
  }

  /**
   * Generate tweet-ready text with book info and progress
   * @param {Object} bookData - Book data object
   * @param {Object} progressData - Progress calculation results
   * @returns {string} Generated tweet text
   */
  generateTweetText(bookData, progressData = null) {
    const title = bookData.title || '書籍';
    const current = Number(bookData.currentReviews) || 0;
    const target = Number(bookData.targetReviews) || 0;

    let tweetContent = '';
    if (target > 0) {
      const remaining = Math.max(0, target - current);
      tweetContent = `「${title}」のレビューが${current}件になりました！\nレビューを書いて著者を応援しよう！\n目標${target}件まで残り${remaining}件です📚`;
    } else {
      tweetContent = `「${title}」は、現在レビューを${current}件集めています📚\nレビューを書いて著者を応援しよう！`;
    }

    // URL + disclosure (if associate enabled)
    let urlPart = '';
    let disclosure = '';
    if (bookData.associateEnabled) {
      const url = this.getShareableUrl(bookData);
      urlPart = url ? `\n${url}` : '';
      if (bookData.associateTag) disclosure = `\n${this.associateDisclosure}`;
    }

    return `${tweetContent}${urlPart}\n${this.defaultHashtag}${disclosure}`;
  }

  /**
   * Get shareable Amazon URL with associate tag if enabled
   * @param {Object} bookData - Book data object
   * @returns {string} Shareable URL
   */
  getShareableUrl(bookData) {
    if (!bookData.amazonUrl) {
      return '';
    }
    
    let url = bookData.amazonUrl;
    
    // Add associate tag if enabled and configured
    if (bookData.associateEnabled && bookData.associateTag) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}tag=${bookData.associateTag}`;
    }
    
    return url;
  }

  /**
   * Generate data summary for logging and debugging
   * @param {Object} bookData - Book data object
   * @param {Object} progressData - Progress calculation results (optional)
   * @returns {Object} Data summary
   */
  getSummary(bookData, progressData = null) {
    const progress = progressData?.percentage;
    const remaining = progressData?.remaining;
    
    return {
      title: bookData.title ? `"${bookData.title.substring(0, 30)}..."` : 'No title',
      author: bookData.author || 'No author',
      reviews: `${bookData.currentReviews}/${bookData.targetReviews || '?'}`,
      progress: progress !== null ? `${progress}%` : 'No target',
      remaining: remaining !== null ? `${remaining} left` : 'No target',
      hasImage: !!bookData.imageUrl,
      hasUrl: !!bookData.amazonUrl,
      associateEnabled: bookData.associateEnabled
    };
  }

  /**
   * Generate short display text for UI components
   * @param {Object} bookData - Book data object
   * @param {number} maxLength - Maximum length for title truncation
   * @returns {Object} Display text components
   */
  getDisplayText(bookData, maxLength = 50) {
    const truncatedTitle = bookData.title && bookData.title.length > maxLength
      ? `${bookData.title.substring(0, maxLength)}...`
      : bookData.title || 'タイトル未設定';

    const authorText = bookData.author || '著者未設定';
    
    return {
      title: truncatedTitle,
      author: authorText,
      fullTitle: bookData.title || 'タイトル未設定',
      reviewCount: `${bookData.currentReviews || 0}件のレビュー`,
      targetText: bookData.targetReviews 
        ? `目標: ${bookData.targetReviews}件`
        : '目標未設定'
    };
  }

  /**
   * Generate alt text for images and accessibility
   * @param {Object} bookData - Book data object
   * @returns {string} Alt text
   */
  getImageAltText(bookData) {
    const title = bookData.title || '書籍';
    const author = bookData.author || '著者不明';
    const reviews = bookData.currentReviews || 0;
    
    return `${title}（著者: ${author}）のレビュー進捗グラフ - 現在${reviews}件のレビュー`;
  }

  /**
   * Generate structured data for image generation
   * @param {Object} bookData - Book data object
   * @param {Object} progressData - Progress calculation results
   * @returns {Object} Structured data for image generator
   */
  getImageGenerationData(bookData, progressData) {
    return {
      title: bookData.title || 'タイトル未設定',
      author: bookData.author || '著者未設定',
      imageUrl: bookData.imageUrl || '',
      reviewCount: bookData.currentReviews || 0,
      targetReviews: bookData.targetReviews || null,
      percentage: progressData?.percentage || null,
      remaining: progressData?.remaining || null,
      achieved: progressData?.achieved || false,
      timestamp: Date.now()
    };
  }
}