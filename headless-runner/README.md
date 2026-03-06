# ヘッドレス学習ランナー

ブラウザを開いたままにせず、ヘッドレスブラウザで学習モードを回し、終了時に学習データを自動でエクスポートするためのスクリプトと Docker です。

## 前提

- ゲームの学習は「ゲーム画面を開いた状態で AI が動き続ける」必要があるため、**ヘッドレスブラウザ（Puppeteer + Chromium）** でその画面を開き、指定時間だけ学習モードを実行してから LocalStorage を読み出し、JSON ファイルに保存します。
- **可能です。** このディレクトリのスクリプトと Docker で実現できます。

## 使い方

### 1. ローカルで Node から実行（Docker なし）

```bash
cd headless-runner
npm install
```

ゲームを配信するため、**親ディレクトリにゲーム一式（index.html, js/, css/）があること**を前提にしています。

```bash
# 既定: 1時間学習 → ./export.json に出力
npm start

# 環境変数で指定
LEARNING_DURATION_SECONDS=7200 OUT_PATH=./my-export.json npm start

# 前回エクスポートした JSON を引き継いで学習
IMPORT_PATH=../path/to/previous-export.json npm start
```

| 環境変数                    | 意味                                               | 既定値         |
| --------------------------- | -------------------------------------------------- | -------------- |
| `LEARNING_DURATION_SECONDS` | 学習秒数                                           | 3600（1時間）  |
| `PORT`                      | ゲーム配信用ポート                                 | 3000           |
| `GAME_DIR`                  | ゲームの index.html があるディレクトリ             | 親ディレクトリ |
| `OUT_PATH`                  | エクスポート先 JSON のパス                         | ./export.json  |
| `IMPORT_PATH`               | **引き継ぎ用 JSON のパス**（省略時はゼロから開始） | なし           |

### 2. Docker で実行

**ビルド**はリポジトリルートで行います。

```bash
# リポジトリルート (touch-mouse/) で
docker build --no-cache -f headless-runner/Dockerfile -t touch-mouse-learning .
```

**実行例**: 2時間学習し、カレントディレクトリに `export.json` を出力。

```bash
docker run --rm -v "$(pwd)":/app/output -e LEARNING_DURATION_SECONDS=7200 touch-mouse-learning
```

**前回の学習結果を引き継ぐ**: ブラウザでエクスポートした JSON をコンテナに渡し、その続きから学習する。

```bash
# カレントに previous.json がある場合
docker run --rm \
  -v "$(pwd)":/app/output \
  -e LEARNING_DURATION_SECONDS=7200 \
  -e IMPORT_PATH=/app/output/previous.json \
  touch-mouse-learning
```

- `-v "$(pwd)":/app/output` で、コンテナ内の `/app/output` にマウントしたディレクトリにエクスポートが書かれます。上記ではカレントディレクトリに `export.json` ができます。
- `IMPORT_PATH` を指定すると、起動時にその JSON を LocalStorage に注入してから学習を開始します。出力される `export.json` は「引き継ぎ + 今回の学習」の結果です。
- 終了時に **LocalStorage の `touch-mouse-rl` と `touch-mouse-rl-meta` を読み、エクスポート用の JSON 形式にまとめて** `OUT_PATH`（既定: `/app/output/export.json`）に書き出します。

## 出力される JSON

ゲームの「学習データをエクスポート」と同じ形式です。

- `Q`, `epsilon`, `exportedAt`, `learningModeSessions`, `learningModeTotalSeconds`
- このファイルをゲーム画面の「学習データをインポート」で読み込めます。

## 注意

- 学習中はヘッドレスブラウザがゲーム画面を開いた状態で動作します。指定した時間が経過するとストップし、その時点の学習データがエクスポートされます。
- **引き継ぎ**: `IMPORT_PATH` に前回のエクスポート JSON を指定すると、その Q・epsilon・学習モード回数・累計時間を LocalStorage に書き込んでからリロードし、続きから学習します。出力される JSON は「引き継ぎ + 今回の学習」の結果です。
