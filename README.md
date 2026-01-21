# 筋トレフォーム分析ツール (Web版)

ブラウザ上で動作する筋トレフォーム分析ツールです。
MediaPipe を使用してリアルタイムで姿勢を推定し、筋トレの回数をカウントします。

## 機能

- **リアルタイム回数カウント**: 腕立て伏せ、腹筋、スクワットの回数を自動カウント
- **自動種目判定**: 姿勢から運動の種類を自動で判定
- **音声読み上げ**: カウントや応援メッセージを音声で読み上げ
- **AI評価機能**: n8n webhook経由でAIによるフォーム評価を取得

## デモ

GitHub Pagesで公開後、以下のURLでアクセスできます：
```
https://[あなたのユーザー名].github.io/kintore-web/
```

## 使い方

### 基本操作

1. ページを開くとカメラへのアクセス許可を求められます → 許可してください
2. カメラに全身が映るように立ち位置を調整
3. 種目ボタンで運動を選択（または自動判定モード）
4. 運動を開始すると自動でカウントされます

### 種目選択

| ボタン | 説明 |
|--------|------|
| 自動判定 | 姿勢から自動で種目を判定 |
| 腕立て伏せ | 腕立て伏せモードに固定 |
| 腹筋 | 腹筋モードに固定 |
| スクワット | スクワットモードに固定 |

### その他の機能

- **リセット**: カウントを0に戻す
- **音声 ON/OFF**: 音声読み上げの切り替え
- **目標回数**: 目標を設定すると達成時にお知らせ
- **AI評価**: n8n webhookを設定するとAIによるフォーム評価を受けられる

## AI評価機能の使い方

1. n8nでForm Coachワークフローをセットアップ
2. 「n8n URL」にwebhook URLを入力
3. 「接続テスト」で接続を確認
4. 運動を数回行った後「AI評価」ボタンをクリック

### n8n側の設定（CORS対応）

ブラウザからn8nにアクセスするため、n8n側でCORSを許可する必要があります。

n8nの環境変数に以下を追加：
```
N8N_CORS_ALLOWED_ORIGINS=*
```

または、特定のドメインのみ許可：
```
N8N_CORS_ALLOWED_ORIGINS=https://[あなたのユーザー名].github.io
```

## GitHub Pagesへのデプロイ

### 方法1: GitHub UIから

1. GitHubでリポジトリを作成（例: `kintore-web`）
2. このフォルダの中身をアップロード
3. Settings → Pages → Source で `main` ブランチを選択
4. 数分後にURLが発行されます

### 方法2: Git コマンドから

```bash
# リポジトリ初期化
cd kintore-web
git init
git add .
git commit -m "Initial commit"

# GitHubにプッシュ
git remote add origin https://github.com/[ユーザー名]/kintore-web.git
git push -u origin main
```

その後、GitHub Settings → Pages で有効化

## ファイル構成

```
kintore-web/
├── index.html          # メインページ
├── css/
│   └── style.css       # スタイルシート
├── js/
│   ├── app.js          # メインアプリケーション
│   ├── pose.js         # MediaPipe姿勢推定
│   ├── counter.js      # 回数カウント & 特徴量抽出
│   ├── voice.js        # 音声読み上げ (Web Speech API)
│   └── api.js          # n8n通信 (fetch API)
└── README.md           # このファイル
```

## 技術スタック

| 機能 | 技術 |
|------|------|
| 姿勢推定 | MediaPipe Pose (JavaScript版) |
| カメラ | getUserMedia API |
| 描画 | Canvas API |
| 音声 | Web Speech API (SpeechSynthesis) |
| 通信 | Fetch API |

## 動作環境

- **ブラウザ**: Chrome, Edge, Safari (最新版推奨)
- **カメラ**: Webカメラが必要
- **接続**: HTTPS (GitHub PagesはHTTPS対応済み)

### 注意事項

- HTTPSでないとカメラが使用できません
- スマートフォンでは処理が重くなる場合があります
- 音声機能はブラウザ・端末によって声が異なります

## ライセンス

MIT License

## 作者

フロンティアプロジェクト 2024-2025
