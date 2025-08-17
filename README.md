# Kindle Review Meter

[![GitHub Pages](https://img.shields.io/badge/Demo-GitHub%20Pages-blue)](https://makionakatsu.github.io/KindleReviewMeter/) [![Chrome Extension](https://img.shields.io/badge/Extension-In%20Development-orange)](#chrome-extension)

Amazon書籍のレビュー数を追跡し、目標達成までの進捗を可視化・共有するツールです。

## 🚀 プロジェクト構成

このリポジトリには2つのバージョンが含まれています：

### 📱 Webアプリ版 (main ブランチ)
- 統合型HTMLアプリケーション（SPA）
- ブラウザで直接利用可能
- **デモ**: [https://makionakatsu.github.io/KindleReviewMeter/](https://makionakatsu.github.io/KindleReviewMeter/)

### 🔧 Chrome拡張機能版 (feature/chrome-extension ブランチ)
- Manifest V3対応
- Service Worker実装
- Context Menu統合
- Chrome Storage API対応

---

## 使い方（MVP）
- 設定タブ:
  - Amazon URLを入力（将来の自動取得に備えて保存されます）
  - 自動取得が使えない場合は「手動入力」を開き、タイトル/著者/レビュー数/画像URLを入力
  - 目標/ストレッチ目標を設定して「保存」
  - データのエクスポート/インポート、データクリアが可能
- 進捗タブ:
  - 保存済みデータの進捗を表示（%/残り/マイルストーン）
  - 「シェア」で共有（Web Share/クリップボード）

ショートカット:
- Ctrl+S: 設定=保存 / 進捗=シェア
- Ctrl+R: 設定=自動取得(後続) / 進捗=更新(後続)
- F1: ヘルプ

## 要件定義
- docs/REQUIREMENTS.md を参照

## 開発メモ
- 本MVPは手動入力＋保存/表示/共有/入出力を提供
- 自動取得（CORSプロキシ経由）と更新機能は次のマイルストーンで追加予定

## ローカルで開く
- ブラウザで `index.html` を開く（推奨: `python3 -m http.server 8000` で `http://localhost:8000/`）
### Chrome拡張アーキテクチャ（要約）
- 背景: `background/index.js`（サービス分割）
  - メッセージ経路: `background/core/MessageRouter.js`
  - 状態管理: `background/core/ExtensionStateManager.js`
  - 例外処理: `background/core/ErrorHandler.js`
  - 取得: `background/services/AmazonScrapingService.js`（プロキシ並列レース＋フォールバック）
  - 画像: `background/services/ImageGenerationService.js`
  - X連携: `background/services/SocialMediaService.js`
- コンテンツスクリプト: `content-scripts/x-tweet-auto-attach.js`
- ポップアップ: `popup/popup.html` + `popup/popup.js`（MVC移行中: `popup/controllers|models|views`）
- 共有DTO: `background/types.js`（BookDataDTO）

補足: `background/background.js` はレガシーな単一ファイル実装（参照用）。現在のManifestは`background/index.js`をエントリとして使用します。

### 便利な使い方（コンテキストメニュー）
- Amazonの商品リンクを右クリック →「Kindle Review Meter で分析」を選択
  - 背景がリンクURLを一時保存し、ポップアップを開きます
  - ポップアップ側では Amazon URL フィールドが安全にプリフィルされます（読み取り後は即クリア）
  - 自動でフェッチは行いません。内容を確認してから手動で「取得」を実行してください

### 設定（開発者向け）
- `background/config.js`
  - `DEBUG_MODE`: 背景サービスのログ詳細度を切替（既定: false）
  - `PROXIES`: CORSプロキシの一覧（既定は実装に合わせた順序）
  - 値を変更してもアプリのロジックは変わりません（挙動の微調整のみ）。
