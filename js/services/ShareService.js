/**
 * シェアサービス
 *
 * プログレス画像の生成とソーシャルメディアシェア機能を提供
 */
import { SHARE_CONFIG, COLORS, FONTS, APP_NAME } from '../utils/constants.js';
export class ShareService {
    constructor(options = {}) {
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "canvas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ctx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.options = {
            defaultShareOptions: {
                width: SHARE_CONFIG.DEFAULT_WIDTH,
                height: SHARE_CONFIG.DEFAULT_HEIGHT,
                quality: 1.0,
                format: 'png',
                includeWatermark: true,
                ...options.defaultShareOptions,
            },
            enableWatermark: true,
            enableTwitterShare: true,
            customTemplate: {
                backgroundColor: COLORS.LIGHT,
                textColor: COLORS.DARK,
                accentColor: COLORS.PRIMARY,
                fontFamily: FONTS.PRIMARY,
                layout: 'default',
            },
            ...options,
        };
        // Canvas要素を作成
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            throw new Error('Canvas 2D context is not supported');
        }
    }
    /**
     * シェア用画像を生成
     */
    async generateShareImage(bookData, progressData, shareOptions) {
        const options = {
            width: this.options.defaultShareOptions.width ?? 800,
            height: this.options.defaultShareOptions.height ?? 600,
            quality: this.options.defaultShareOptions.quality ?? 0.9,
            format: this.options.defaultShareOptions.format ?? 'png',
            includeWatermark: this.options.defaultShareOptions.includeWatermark ?? true,
            ...shareOptions
        };
        try {
            // Canvasのサイズを設定
            this.setupCanvas(options);
            // 背景を描画
            this.drawBackground();
            // 書籍情報を描画
            await this.drawBookInfo(bookData);
            // プログレス情報を描画
            this.drawProgress(progressData);
            // マイルストーンを描画
            this.drawMilestones(bookData, progressData);
            // ウォーターマークを描画
            if (options.includeWatermark && this.options.enableWatermark) {
                this.drawWatermark();
            }
            // 画像データを生成
            const imageData = this.generateImageData(options);
            return {
                success: true,
                imageUrl: imageData,
                blob: await this.canvasToBlob(options),
                shareUrl: this.generateShareUrl(bookData, progressData),
                metadata: {
                    dimensions: {
                        width: options.width,
                        height: options.height,
                    },
                    format: options.format,
                    fileSize: this.estimateFileSize(imageData),
                },
            };
        }
        catch (error) {
            console.error('シェア画像生成エラー:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                metadata: {
                    dimensions: { width: 0, height: 0 },
                    format: 'png',
                    fileSize: 0,
                },
            };
        }
    }
    /**
     * Canvasを設定
     */
    setupCanvas(options) {
        this.canvas.width = options.width;
        this.canvas.height = options.height;
        // 高DPI対応
        const dpr = window.devicePixelRatio || 1;
        this.canvas.style.width = `${options.width}px`;
        this.canvas.style.height = `${options.height}px`;
        this.canvas.width = options.width * dpr;
        this.canvas.height = options.height * dpr;
        this.ctx.scale(dpr, dpr);
    }
    /**
     * 背景を描画
     */
    drawBackground() {
        const template = this.options.customTemplate;
        // グラデーション背景
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, template.backgroundColor);
        gradient.addColorStop(1, this.lightenColor(template.backgroundColor, 20));
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // 装飾的な要素
        this.drawDecorationElements();
    }
    /**
     * 装飾要素を描画
     */
    drawDecorationElements() {
        const template = this.options.customTemplate;
        // 上部のアクセントライン
        this.ctx.fillStyle = template.accentColor;
        this.ctx.fillRect(0, 0, this.canvas.width, 8);
        // 背景パターン（書籍アイコン）
        this.ctx.font = '120px serif';
        this.ctx.fillStyle = this.lightenColor(template.backgroundColor, 5);
        this.ctx.textAlign = 'center';
        this.ctx.fillText('📚', this.canvas.width * 0.85, this.canvas.height * 0.85);
    }
    /**
     * 書籍情報を描画
     */
    async drawBookInfo(bookData) {
        const template = this.options.customTemplate;
        const margin = 40;
        let currentY = margin + 20;
        // アプリタイトル
        this.ctx.font = `bold 24px ${template.fontFamily}`;
        this.ctx.fillStyle = template.accentColor;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(APP_NAME, this.canvas.width / 2, currentY);
        currentY += 60;
        // 書籍カバー（もしあれば）
        if (bookData.bookCoverUrl) {
            try {
                const coverImage = await this.loadImage(bookData.bookCoverUrl);
                const coverSize = 120;
                const coverX = (this.canvas.width - coverSize) / 2;
                this.ctx.drawImage(coverImage, coverX, currentY, coverSize, coverSize * 1.5);
                currentY += coverSize * 1.5 + 20;
            }
            catch (error) {
                console.warn('書籍カバー読み込みエラー:', error);
                // カバーが読み込めない場合は書籍アイコンを表示
                this.drawBookIcon(currentY);
                currentY += 100;
            }
        }
        else {
            this.drawBookIcon(currentY);
            currentY += 100;
        }
        // 書籍タイトル
        this.ctx.font = `bold 28px ${template.fontFamily}`;
        this.ctx.fillStyle = template.textColor;
        this.ctx.textAlign = 'center';
        const title = this.truncateText(bookData.bookTitle || 'タイトル未設定', 400);
        this.ctx.fillText(title, this.canvas.width / 2, currentY);
        currentY += 40;
        // 著者名
        this.ctx.font = `20px ${template.fontFamily}`;
        this.ctx.fillStyle = this.lightenColor(template.textColor, 30);
        const author = this.truncateText(bookData.bookAuthor || '著者未設定', 350);
        this.ctx.fillText(author, this.canvas.width / 2, currentY);
    }
    /**
     * 書籍アイコンを描画
     */
    drawBookIcon(y) {
        this.ctx.font = '80px serif';
        this.ctx.fillStyle = this.options.customTemplate.accentColor;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('📚', this.canvas.width / 2, y + 60);
    }
    /**
     * プログレス情報を描画
     */
    drawProgress(progressData) {
        const template = this.options.customTemplate;
        const margin = 40;
        const progressY = this.canvas.height * 0.55;
        const barWidth = this.canvas.width - (margin * 2);
        const barHeight = 30;
        // プログレス情報タイトル
        this.ctx.font = `bold 22px ${template.fontFamily}`;
        this.ctx.fillStyle = template.textColor;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('📊 進捗状況', this.canvas.width / 2, progressY - 20);
        // プログレスバーの背景
        this.ctx.fillStyle = this.lightenColor(template.backgroundColor, 10);
        this.roundRect(margin, progressY, barWidth, barHeight, 15);
        this.ctx.fill();
        // プログレスバーの進捗部分
        const progressWidth = (barWidth * progressData.progressPercentage) / 100;
        const progressColor = this.getProgressColor(progressData.achievementRate);
        this.ctx.fillStyle = progressColor;
        this.roundRect(margin, progressY, progressWidth, barHeight, 15);
        this.ctx.fill();
        // プログレス率テキスト
        this.ctx.font = `bold 16px ${template.fontFamily}`;
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${progressData.achievementRate}%`, margin + progressWidth / 2, progressY + barHeight / 2 + 6);
        // 統計情報
        this.drawStatistics(progressData, progressY + barHeight + 40);
    }
    /**
     * 統計情報を描画
     */
    drawStatistics(progressData, startY) {
        const template = this.options.customTemplate;
        const stats = [
            { label: '現在', value: progressData.currentReviews.toLocaleString(), color: template.textColor },
            { label: '目標', value: progressData.targetReviews.toLocaleString(), color: template.accentColor },
            { label: 'ストレッチ', value: progressData.stretchReviews.toLocaleString(), color: COLORS.SUCCESS },
        ];
        const statWidth = (this.canvas.width - 80) / stats.length;
        stats.forEach((stat, index) => {
            const x = 40 + (index * statWidth) + (statWidth / 2);
            // 値
            this.ctx.font = `bold 32px ${template.fontFamily}`;
            this.ctx.fillStyle = stat.color;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(stat.value, x, startY);
            // ラベル
            this.ctx.font = `16px ${template.fontFamily}`;
            this.ctx.fillStyle = this.lightenColor(template.textColor, 30);
            this.ctx.fillText(stat.label, x, startY + 25);
        });
    }
    /**
     * マイルストーンを描画
     */
    drawMilestones(bookData, progressData) {
        const template = this.options.customTemplate;
        const milestones = [10, 25, 50, 100, 200];
        const currentReviews = bookData.currentReviews;
        const startY = this.canvas.height * 0.78;
        // マイルストーンタイトル
        this.ctx.font = `18px ${template.fontFamily}`;
        this.ctx.fillStyle = template.textColor;
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🎯 マイルストーン', this.canvas.width / 2, startY - 10);
        // マイルストーンアイテム
        const itemWidth = (this.canvas.width - 60) / milestones.length;
        milestones.forEach((milestone, index) => {
            const x = 30 + (index * itemWidth) + (itemWidth / 2);
            const isAchieved = currentReviews >= milestone;
            // アイコン
            this.ctx.font = '20px serif';
            this.ctx.fillStyle = isAchieved ? COLORS.SUCCESS : this.lightenColor(template.textColor, 50);
            this.ctx.textAlign = 'center';
            this.ctx.fillText(isAchieved ? '✅' : '⭕', x, startY + 20);
            // 値
            this.ctx.font = `12px ${template.fontFamily}`;
            this.ctx.fillStyle = isAchieved ? template.textColor : this.lightenColor(template.textColor, 40);
            this.ctx.fillText(milestone.toString(), x, startY + 35);
        });
    }
    /**
     * ウォーターマークを描画
     */
    drawWatermark() {
        const template = this.options.customTemplate;
        this.ctx.font = `12px ${template.fontFamily}`;
        this.ctx.fillStyle = this.lightenColor(template.textColor, 60);
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`Generated by ${APP_NAME}`, this.canvas.width / 2, this.canvas.height - 15);
    }
    /**
     * 画像を読み込み
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
    /**
     * 角丸矩形を描画
     */
    roundRect(x, y, width, height, radius) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + width - radius, y);
        this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.ctx.lineTo(x + width, y + height - radius);
        this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.ctx.lineTo(x + radius, y + height);
        this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.quadraticCurveTo(x, y, x + radius, y);
        this.ctx.closePath();
    }
    /**
     * テキストを切り詰め
     */
    truncateText(text, maxWidth) {
        const metrics = this.ctx.measureText(text);
        if (metrics.width <= maxWidth) {
            return text;
        }
        // 二分探索で最適な長さを見つける
        let left = 0;
        let right = text.length;
        let result = text;
        while (left < right) {
            const mid = Math.floor((left + right + 1) / 2);
            const truncated = text.substring(0, mid) + '...';
            const width = this.ctx.measureText(truncated).width;
            if (width <= maxWidth) {
                left = mid;
                result = truncated;
            }
            else {
                right = mid - 1;
            }
        }
        return result;
    }
    /**
     * 色を明るくする
     */
    lightenColor(color, percent) {
        // 簡単な実装：透明度を下げることで明るく見せる
        const alpha = Math.max(0, Math.min(1, (100 - percent) / 100));
        return color + Math.round(alpha * 255).toString(16).padStart(2, '0');
    }
    /**
     * プログレス率に応じた色を取得
     */
    getProgressColor(achievementRate) {
        if (achievementRate >= 100)
            return COLORS.SUCCESS;
        if (achievementRate >= 75)
            return COLORS.INFO;
        if (achievementRate >= 50)
            return COLORS.WARNING;
        return COLORS.ERROR;
    }
    /**
     * 画像データを生成
     */
    generateImageData(options) {
        const format = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
        return this.canvas.toDataURL(format, options.quality);
    }
    /**
     * CanvasをBlobに変換
     */
    canvasToBlob(options) {
        return new Promise(resolve => {
            const format = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
            this.canvas.toBlob(resolve, format, options.quality);
        });
    }
    /**
     * ファイルサイズを推定
     */
    estimateFileSize(dataUrl) {
        // Base64データからおおよそのファイルサイズを計算
        const base64Length = dataUrl.split(',')[1]?.length ?? 0;
        return Math.round(base64Length * 0.75); // Base64デコード後のサイズ
    }
    /**
     * シェア用URLを生成
     */
    generateShareUrl(bookData, progressData) {
        const text = encodeURIComponent(`📚「${bookData.bookTitle}」のレビュー数進捗\n` +
            `現在: ${progressData.currentReviews}件\n` +
            `目標: ${progressData.targetReviews}件\n` +
            `達成率: ${progressData.achievementRate}%\n` +
            `#読書 #レビュー #進捗管理`);
        return `${SHARE_CONFIG.TWITTER_INTENT_URL}?text=${text}`;
    }
    /**
     * ソーシャルメディアにシェア
     */
    shareToSocial(shareUrl, platform = 'twitter') {
        if (!this.options.enableTwitterShare && platform === 'twitter') {
            throw new Error('Twitter share is disabled');
        }
        const features = 'width=600,height=400,scrollbars=yes,resizable=yes';
        switch (platform) {
            case 'twitter':
                window.open(shareUrl, 'twitter-share', features);
                break;
            case 'facebook':
                const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`;
                window.open(facebookUrl, 'facebook-share', features);
                break;
        }
    }
    /**
     * 画像をダウンロード
     */
    downloadImage(imageUrl, filename = 'progress-share.png') {
        const link = document.createElement('a');
        link.download = filename;
        link.href = imageUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    /**
     * カスタムテンプレートを設定
     */
    setTemplate(template) {
        this.options.customTemplate = { ...this.options.customTemplate, ...template };
    }
    /**
     * デフォルトシェアオプションを更新
     */
    updateDefaultOptions(options) {
        this.options.defaultShareOptions = { ...this.options.defaultShareOptions, ...options };
    }
    /**
     * サポートされている形式を取得
     */
    getSupportedFormats() {
        return [...SHARE_CONFIG.SUPPORTED_FORMATS];
    }
    /**
     * 最大ファイルサイズを取得
     */
    getMaxFileSize() {
        return SHARE_CONFIG.MAX_FILE_SIZE;
    }
}
//# sourceMappingURL=ShareService.js.map