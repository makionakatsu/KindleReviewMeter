# Kindle Review Meter SPA 要件定義 (v1.0)

## 1. 目的とスコープ
- 目的: Amazon書籍のレビュー数を継続的に追跡し、目標達成までの進捗を可視化・共有する。
- スコープ: 単一ページSPAで、設定（取得/手動入力/目標設定/入出力）とビジュアル表示（進捗表示/更新/シェア）を提供。

## 2. アーキテクチャ方針
- 構成: 単一ページ（index.html）+ ES Modules（フレームワークなし）。
- ビルド: 不要（静的配信/GitHub Pages対応）。
- 依存: 外部APIなし。CORSプロキシ経由でAmazon商品ページのHTMLを取得し、クライアントで抽出。

## 3. 画面/ビュー
- Settingsビュー:
  - Amazon URL入力/検証、自動取得、手動入力（タイトル/著者/レビュー数）、目標/ストレッチ設定、保存。
  - エクスポート/インポート、データクリア。
- Progressビュー:
  - 書影/タイトル/著者/現在/目標/残り/進捗バー/マイルストーン表示。
  - 共有（Web Share/クリップボード）と更新（保存済みURLから再取得）。
- ビュー切替: ハッシュルーティング（#settings / #progress）。

## 4. 機能要件（MVP）
- 入力/検証:
  - Amazon URLの形式検証（amazon.co.jp/com, amzn.to短縮に対応）。
  - 目標数値の検証（1〜100,000）。
- 自動取得/フォールバック:
  - 複数CORSプロキシを順次試行、10秒タイムアウト、全滅時はモック＋ガイダンス。
  - 抽出項目: タイトル、著者、レビュー数、書影URL、ASIN。
  - 失敗時は手動入力可能（タイトル/著者/レビュー数）。
- 保存/読込:
  - localStorageに単一書籍の状態を保存・読込。保存時刻を保持。
  - 保存には`amazonUrl`も含める（更新に使用）。
- 進捗表示:
  - 現在/目標/残り、%（0〜100）、マイルストーン文言（0/50/80/100で切替）。
- 更新（Progressビュー）:
  - 保存済み`amazonUrl`から再取得→保存→再描画。進行状態の表示と失敗通知。
- 共有:
  - Web Share API使用。非対応環境はクリップボードコピーにフォールバック。
  - 共有文面: 書名 + 現在/目標(%) + ページURL。
- 入出力:
  - エクスポート: JSONダウンロード（メタ含む、日付付きファイル名）。
  - インポート: JSON選択→構造検証→保存（上書き警告）。
- ショートカット:
  - Settings: Ctrl+S（保存）、Ctrl+R（自動取得）、F1（ヘルプ）。
  - Progress: Ctrl+S（シェア）、F1（ヘルプ）。

## 5. 非機能要件（NFR）
- 対応ブラウザ: 現行主要ブラウザ（ES Modules, fetch, localStorage, Promise 必須）。
- パフォーマンス: 初期表示3秒以内を目標。ローディング表示あり。
- UX: ブロッキングのalert/promptは最小化し、トースト/モーダル中心に（MVPでは段階的に移行）。
- アクセシビリティ: ボタンにラベル/aria、テキスト併記、キーボード操作可。
- セキュリティ/CSP: 最小限の`connect-src`（Amazon/プロキシ）。外部スクリプトは必要最小。
- デプロイ: GitHub Pages（Actionsで自動デプロイ）。

## 6. データモデル（localStorage）
- キー: `amazonReviewTracker`
- 値（JSON）:
  - title: string
  - author: string
  - reviewCount: number
  - imageUrl: string
  - targetReviews: number
  - stretchGoal: number | null
  - amazonUrl: string
  - fetchedAt: ISO string
  - savedAt: ISO string
  - asin: string | null
  - isManualEntry: boolean（任意）
  - isMockData: boolean（任意）
  - extractionSuccess: boolean（任意）

## 7. ユーザーフロー
- 初回: SettingsでURL入力→自動取得（失敗時は手動）→目標設定→保存→Progressで確認。
- 共有: Progressで表示→シェア（Web Share/コピー）。
- 更新: Progressで🔄→取得→保存→再描画。

## 8. エラーハンドリング
- URL無効: 入力欄にエラー表示＋サンプル提示。
- 取得失敗: フォールバック（モック/手動）と詳細メッセージ。
- インポート失敗: 構造/タイプ不正、JSONパース、保存失敗を明示。
- 画像CORS: 代替画像（SVG No Image）。

## 9. セキュリティ/CSP（例）
- default-src 'self'
- script-src 'self'（外部CDN使用時のみ追加）
- style-src 'self' 'unsafe-inline'
- img-src 'self' data: https: ssl-images-amazon.com m.media-amazon.com images-amazon.com
- connect-src 'self' api.cors.lol proxy.cors.sh api.allorigins.win *.amazon.co.jp *.amazon.com
- object-src 'none'; base-uri 'self'; form-action 'self'

## 10. 外部依存
- CORSプロキシ（フォールバック複数）。`proxy.cors.sh`のAPIキーは任意設定（localStorage or window定数）。
- Amazon商品ページのHTML構造変更に耐えるセレクタの冗長化。

## 11. 受け入れ基準（MVP）
- 設定保存→リロード後も保持。
- Progressが保存データを表示し、🔄で最新化できる（URL保存済み）。
- 取得が失敗しても手動入力で可視化・共有が成立。
- エクスポート/インポートが成功し、破損データはエラー表示。

## 12. マイルストーン
- M1: 最小版（設定保存＋進捗表示＋入出力）
- M2: 自動取得（プロキシ＋タイムアウト）/手動UI強化
- M3: 更新/共有の仕上げ（Progress）
- M4: UX改善（トースト/モーダル、F1ヘルプ、CSP整備）
- M5: リファクタ/README更新/アクセシビリティ微修正

## 13. 非対象（今回）
- サーバーサイド/DB/認証
- Amazon公式API
- 高度なSNS SDK連携

