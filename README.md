# ヒト vs AI 反射神経バトル

Webブラウザで動く、ヒトとAIが同じターゲットを追いかけてスコアを競うゲームです。  
AIは強化学習で「移動量」を学習し、プレイを重ねるほど強くなります。

## 遊び方

1. ブラウザで `index.html` を開く（またはローカルサーバで配信）
2. 「スタート」を押すと1分間の対戦開始
3. 黄色いターゲットに**マウスを重ねる**とヒトの得点、**ピンクのAI自機が重なると**AIの得点
4. 先に触れた方が1点。制限時間内の合計得点で勝敗
5. 何度もプレイするとAIの学習が進み、スコアが伸びていきます

## 技術

- HTML / CSS / JavaScript（Vanilla）
- 学習データはブラウザの LocalStorage に保存
- 「学習をリセット」で保存データを削除可能

## 起動方法

- **ファイルで開く**: `index.html` をダブルクリック（LocalStorage は file プロトコルでも多くの環境で利用可能）
- **簡易サーバ**（推奨）:
  ```bash
  npx serve .
  # または
  python3 -m http.server 8000
  ```
  ブラウザで `http://localhost:8000` を開く

## ファイル構成

- `index.html` - メイン画面
- `css/style.css` - スタイル
- `js/config.js` - 定数
- `js/rl.js` - 強化学習（Q学習・保存）
- `js/ai.js` - AI（方向計算・移動量選択）
- `js/game.js` - ゲームループ・当たり判定・方向スコア計算
- `js/app.js` - UI連携
- `design-overview.md` / `design-memo.md` - 概要・設計メモ
