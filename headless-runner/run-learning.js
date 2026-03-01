/**
 * ヘッドレスブラウザでゲームを開き、学習モードを指定時間だけ回してから
 * LocalStorage の学習データを読み出し、JSON ファイルにエクスポートする。
 *
 * 環境変数:
 *   LEARNING_DURATION_SECONDS  学習秒数（既定: 3600 = 1時間）
 *   PORT                      ゲーム配信用ポート（既定: 3000）
 *   GAME_DIR                  ゲームの index.html があるディレクトリ（既定: 親ディレクトリ）
 *   OUT_PATH                  エクスポート先 JSON パス（既定: ./export.json）
 *   IMPORT_PATH               引き継ぎ用 JSON のパス（省略時はゼロから開始）
 */

const path = require('path');
const fs = require('fs');
const express = require('express');

const LEARNING_DURATION_MS =
  (parseInt(process.env.LEARNING_DURATION_SECONDS, 10) || 3600) * 1000;
const PORT = parseInt(process.env.PORT, 10) || 3000;
const GAME_DIR = path.resolve(process.env.GAME_DIR || path.join(__dirname, '..'));
const OUT_PATH = path.resolve(process.env.OUT_PATH || path.join(__dirname, 'export.json'));
const IMPORT_PATH = process.env.IMPORT_PATH ? path.resolve(process.env.IMPORT_PATH) : null;

async function main() {
  const app = express();
  app.use(express.static(GAME_DIR));
  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`Serving game at http://127.0.0.1:${PORT}`);
  });

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    let importData = null;
    if (IMPORT_PATH && fs.existsSync(IMPORT_PATH)) {
      importData = JSON.parse(fs.readFileSync(IMPORT_PATH, 'utf8'));
      console.log(`Importing from ${IMPORT_PATH}`);
    } else if (IMPORT_PATH) {
      console.warn(`IMPORT_PATH not found: ${IMPORT_PATH}, starting from zero`);
    }

    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0' });

    await page.waitForSelector('#btn-start', { timeout: 10000 });

    if (importData && importData.Q) {
      await page.evaluate((data) => {
        localStorage.setItem(
          'touch-mouse-rl',
          JSON.stringify({
            Q: data.Q || {},
            epsilon: typeof data.epsilon === 'number' ? data.epsilon : 0.05,
          })
        );
        if (
          typeof data.learningModeSessions === 'number' ||
          typeof data.learningModeTotalSeconds === 'number'
        ) {
          localStorage.setItem(
            'touch-mouse-rl-meta',
            JSON.stringify({
              learningModeSessions: data.learningModeSessions || 0,
              learningModeTotalSeconds: data.learningModeTotalSeconds || 0,
            })
          );
        }
      }, importData);
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('#btn-start', { timeout: 10000 });
    }

    await page.click('.mode-tab[data-mode="learning"]');
    await new Promise((r) => setTimeout(r, 300));

    await page.click('#btn-start');
    console.log(`Learning started. Waiting ${LEARNING_DURATION_MS / 1000}s...`);
    await new Promise((r) => setTimeout(r, LEARNING_DURATION_MS));

    await page.click('#btn-stop');
    await new Promise((r) => setTimeout(r, 2000));

    const data = await page.evaluate(() => {
      const rl = localStorage.getItem('touch-mouse-rl');
      const meta = localStorage.getItem('touch-mouse-rl-meta');
      const rlData = rl ? JSON.parse(rl) : {};
      const metaData = meta ? JSON.parse(meta) : {};
      return {
        Q: rlData.Q || {},
        epsilon: typeof rlData.epsilon === 'number' ? rlData.epsilon : 0.05,
        exportedAt: new Date().toISOString(),
        learningModeSessions:
          typeof metaData.learningModeSessions === 'number'
            ? metaData.learningModeSessions
            : 0,
        learningModeTotalSeconds:
          typeof metaData.learningModeTotalSeconds === 'number'
            ? metaData.learningModeTotalSeconds
            : 0,
      };
    });

    const outDir = path.dirname(OUT_PATH);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Exported to ${OUT_PATH}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
