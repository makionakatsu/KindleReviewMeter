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

