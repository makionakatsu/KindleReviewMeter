/**
 * デバウンス（防振）ユーティリティ
 * 連続する関数呼び出しを制御してパフォーマンスを向上
 */
/**
 * デバウンス関数
 * @param func デバウンス対象の関数
 * @param delay 遅延時間（ミリ秒）
 * @returns デバウンス処理された関数
 */
export function debounce(func, delay) {
    let timeoutId;
    return function debounced(...args) {
        // 既存のタイマーをクリア
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
        // 新しいタイマーを設定
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
/**
 * スロットル関数
 * @param func スロットル対象の関数
 * @param limit 実行間隔の制限時間（ミリ秒）
 * @returns スロットル処理された関数
 */
export function throttle(func, limit) {
    let lastRun = 0;
    return function throttled(...args) {
        const now = Date.now();
        if (now - lastRun >= limit) {
            func.apply(this, args);
            lastRun = now;
        }
    };
}
//# sourceMappingURL=debounce.js.map