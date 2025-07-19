# 📚 Amazon書籍レビュー数トラッカー

Amazon書籍のレビュー数を追跡し、目標達成までの進捗を可視化するWebアプリケーションです。

## ✨ 主な機能

- 📖 **書籍情報の自動取得**: Amazon URLから書籍タイトル、著者名、レビュー数、書影を自動取得
- 🎯 **目標設定**: 目標レビュー数とストレッチ目標を設定
- 📊 **プログレス可視化**: 進捗をグラフィカルに表示
- 🎁 **マイルストーン機能**: 達成目標をアイコンで表示
- 📤 **シェア機能**: SNS用の画像生成と投稿
- 💾 **データ永続化**: ブラウザのローカルストレージに設定を保存
- 📱 **レスポンシブ対応**: デスクトップとモバイルに対応

## 🚀 使い方

### 1. 設定ページ (index.html)

1. Amazon書籍のURLを入力
2. 「自動取得」ボタンをクリックして書籍情報を取得
3. 目標レビュー数とストレッチ目標を設定
4. 「設定を保存」をクリック

### 2. ビジュアル表示ページ (amazon-review-visual.html)

- 進捗状況をグラフィカルに表示
- 「更新」ボタンで最新データを取得
- 「シェア」ボタンでSNS用画像を生成

## 🛠️ 技術スタック

- **フロントエンド**: TypeScript, HTML5, CSS3
- **モジュールシステム**: ES Modules
- **ビルドツール**: TypeScript Compiler, ESLint, Prettier
- **アーキテクチャ**: モジュラー設計、イベント駆動、型安全

## 📁 プロジェクト構造

```
KindleReviewMeter/
├── src/                     # TypeScriptソースコード
│   ├── types/              # 型定義
│   ├── services/           # ビジネスロジック
│   ├── components/         # UIコンポーネント
│   ├── models/             # データモデル
│   ├── utils/              # ユーティリティ
│   ├── main.ts             # 設定ページエントリーポイント
│   └── visual.ts           # ビジュアル表示ページエントリーポイント
├── css/                     # スタイルシート
├── index.html              # 設定ページ
├── amazon-review-visual.html # ビジュアル表示ページ
├── package.json            # プロジェクト設定
├── tsconfig.json           # TypeScript設定
└── README.md               # このファイル
```

## 🔧 開発環境のセットアップ

### 必要要件

- Node.js 18.0.0以上
- npm 9.0.0以上

### インストール

```bash
# プロジェクトクローン
git clone https://github.com/your-username/kindle-review-meter.git
cd kindle-review-meter

# 依存関係インストール
npm install
```

### 開発用コマンド

```bash
# 開発サーバー起動
npm run dev

# TypeScriptビルド
npm run build

# ファイル監視モード
npm run watch

# 型チェック
npm run type-check

# リント
npm run lint

# フォーマット
npm run format

# 本番ビルド
npm run build:prod
```

## 📝 対応URL形式

- `https://www.amazon.co.jp/dp/XXXXXXXXXX`
- `https://www.amazon.co.jp/gp/product/XXXXXXXXXX`
- `https://www.amazon.com/dp/XXXXXXXXXX`

## ⌨️ キーボードショートカット

### 設定ページ
- `Ctrl+S`: 設定を保存
- `Ctrl+R`: データを再取得
- `F1`: ヘルプを表示

### ビジュアル表示ページ
- `Ctrl+R`: データを更新
- `Ctrl+S`: シェア画像を生成
- `Esc`: モーダルを閉じる

## 🔒 セキュリティ

- Content Security Policy (CSP) による XSS 保護
- 入力値のサニタイゼーション
- 信頼できるドメインのみからの画像読み込み
- クロスオリジンリクエストの制限

## 🎨 アーキテクチャ

### コンポーネント設計
- **BaseComponent**: 全コンポーネントの基底クラス
- **BookInfoForm**: 書籍情報入力フォーム
- **ProgressViewer**: 進捗表示コンポーネント

### サービス層
- **StorageService**: データ永続化
- **BookInfoService**: 書籍情報取得
- **AuthorExtractionService**: 著者名抽出
- **ValidationService**: 入力値検証
- **ShareService**: シェア機能

### イベント駆動アーキテクチャ
- **EventEmitter**: アプリケーション全体のイベント管理
- **ErrorHandler**: 統一エラーハンドリング

## 🐛 トラブルシューティング

### 書籍情報が取得できない
- URLが正しい形式か確認
- ネットワーク接続を確認
- CORS プロキシの状態を確認

### 著者名が正しくない
- 「✏️ 修正」ボタンで手動修正
- 複数著者の場合は最初の著者のみ表示

### データが保存されない
- ブラウザのローカルストレージ設定を確認
- シークレットモードではデータが保持されません

## 📄 ライセンス

MIT License

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📞 サポート

- [Issues](https://github.com/your-username/kindle-review-meter/issues)でバグ報告や機能要求
- [Discussions](https://github.com/your-username/kindle-review-meter/discussions)で質問や議論

## 🙏 謝辞

- Amazon.co.jp API
- All Origins CORS Proxy
- TypeScript コミュニティ
- オープンソースコミュニティ

---

**Made with ❤️ by Kindle Review Meter Team**