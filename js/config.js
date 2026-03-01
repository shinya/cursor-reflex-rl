/**
 * ゲーム定数
 */
const CONFIG = {
  // フィールド
  FIELD_WIDTH: 800,
  FIELD_HEIGHT: 500,

  // ターゲット（直径約20px）
  TARGET_RADIUS: 10,

  // AI自機（直径約8px）
  AI_CURSOR_RADIUS: 4,

  // 制限時間（秒）
  GAME_DURATION: 60,

  // 8方向（右から反時計回り: 0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE）
  DIRECTIONS: [
    { dx: 1, dy: 0 },   // E
    { dx: 1, dy: -1 },  // NE
    { dx: 0, dy: -1 },  // N
    { dx: -1, dy: -1 }, // NW
    { dx: -1, dy: 0 },  // W
    { dx: -1, dy: 1 },  // SW
    { dx: 0, dy: 1 },   // S
    { dx: 1, dy: 1 },   // SE
  ],

  // 方向スコア: 2乗距離の変化 Δ² を使う（1px の距離変化は常に ±1 で距離に依存しないため）。
  // 復元困難: sign(Δ²) * log(1 + |Δ²|)。DEVIATION_USE_SQ=false なら従来の Δ と sqrt。
  DEVIATION_USE_SQ: true,
  DEVIATION_LOG_SCALE: 1,
  DEVIATION_SCALE: 10,

  // 強化学習
  RL: {
    LEARNING_RATE: 0.1,
    DISCOUNT: 0.95,
    EPSILON_MIN: 0.05,
    EPSILON_DECAY: 0.998,
    EPSILON_INITIAL: 0.05, // 探索の割合 5%。ランダム行動で多様な移動量を試す
    STATE_BINS: 5,  // ばらつきを離散化する区間数
    // 2乗距離を用いた方向スコア時: raw（8スコアのrange）を [SPREAD_RAW_MIN, SPREAD_RAW_MAX] で線形写像。遠い→raw大→0、近い→raw小→1
    SPREAD_RAW_MIN: 5,
    SPREAD_RAW_MAX: 15,
    STORAGE_KEY: 'touch-mouse-rl',
    // 未学習の状態では「小さい移動量＝ベスト」とみなす初期Qのバイアス。大きくして成長を遅らせる
    INITIAL_CAUTIOUS_BIAS: 8,
    // 案A: 1ステップごとの小さな罰。少ないステップで到達するほど有利になり、大胆のメリットが学習されやすくなる（大きくしすぎると初期の慎重さが崩れる）
    STEP_PENALTY: 0.3,
    // ばらつきの raw を確認するログ。true にするとコンソールに distance / raw / state を出す（配分確認用）
    LOG_SPREAD: false,
    LOG_SPREAD_SAMPLE_RATE: 40,
    LOG_SPREAD_CLOSE_THRESHOLD: 50,
    LOG_SPREAD_FAR_THRESHOLD: 280,
  },
};

/**
 * フィールドサイズから移動量候補を算出（対数的に「半分ずつ」配分）
 * 最大 = 長辺の50%。そこから 1/2, 1/4, 1/8, ... と半分ずつ減らして 1px まで。
 * 端から端まで少ないステップで届くようにしつつ、細かい段階でリカバリーしやすくする。
 */
function computeMoveAmounts() {
  const minMove = 1;
  const longSide = Math.max(CONFIG.FIELD_WIDTH, CONFIG.FIELD_HEIGHT);
  const maxMove = Math.max(minMove, Math.round(longSide * 0.5));
  const amounts = [];
  const seen = new Set();
  let v = maxMove;
  while (v >= minMove) {
    const rounded = Math.max(minMove, Math.round(v));
    if (!seen.has(rounded)) {
      seen.add(rounded);
      amounts.push(rounded);
    }
    v = v / 2;
  }
  if (!seen.has(minMove)) amounts.push(minMove);
  return amounts.length > 0 ? amounts.sort((a, b) => a - b) : [minMove];
}

CONFIG.MOVE_AMOUNTS = computeMoveAmounts();
