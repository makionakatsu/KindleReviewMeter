# 📚 Amazon書籍レビュー数トラッカー

Amazon書籍のレビュー数を追跡し、目標達成までの進捗を可視化するWebアプリケーションです。

## 🚀 使い方

### 設定ページ (index.html)
1. Amazon書籍のURLを入力
2. 「自動取得」ボタンをクリックして書籍情報を取得
3. 目標レビュー数とストレッチ目標を設定
4. 「設定を保存」をクリック

### ビジュアル表示ページ (amazon-review-visual.html)
- 進捗状況をグラフィカルに表示
- 「更新」ボタンで最新データを取得
- 「シェア」ボタンでSNS用画像を生成

## 📁 プロジェクト構造

```
📂 KindleReviewMeter/
├── 📄 index.html              # メイン設定ページ
├── 📄 amazon-review-visual.html # ビジュアル表示ページ
├── 📁 css/                     # スタイルシート
├── 📁 js/                      # JavaScript
│   ├── main.js                # メインアプリケーション
│   ├── visual.js              # ビジュアル表示アプリ
│   ├── components/            # UIコンポーネント
│   ├── services/              # ビジネスロジック
│   ├── models/                # データモデル
│   └── utils/                 # ユーティリティ
└── 📄 README.md               # このファイル
```

## 🌐 デモ

- **設定ページ**: https://makionakatsu.github.io/KindleReviewMeter/
- **ビジュアル表示**: https://makionakatsu.github.io/KindleReviewMeter/amazon-review-visual.html

## 💡 特徴

- **シンプルなアーキテクチャ**: ビルド不要のピュアJavaScript
- **モジュラー設計**: ES Modulesによる整理された構造
- **GitHub Pages対応**: 設定なしで即座にデプロイ可能
- **レスポンシブ対応**: デスクトップとモバイルに対応
- **著者名/タイトル編集**: インライン編集機能
- **手動データ入力**: API失敗時のフォールバック
- **データ管理**: エクスポート/インポート機能
- **複数プロキシ対応**: 自動フォールバック機能

## 🔧 GitHub Pagesデプロイ手順

このリポジトリはGitHub Actionsで自動デプロイされます：

1. **リポジトリ設定**:
   - Settings → Pages → Source を "GitHub Actions" に設定
   
2. **自動デプロイ**:
   - mainブランチにpushすると自動的にデプロイ
   - `.github/workflows/deploy.yml` でワークフローを管理

3. **手動デプロイ**:
   ```bash
   git add .
   git commit -m "Update application"
   git push origin main
   ```

---

**Made with ❤️ by Kindle Review Meter Team**