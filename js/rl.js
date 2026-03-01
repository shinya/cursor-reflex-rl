/**
 * 強化学習エンジン（移動量の学習）
 * 状態: 8方向スコアのばらつき（分散 or レンジ）を離散化
 * 行動: 移動量のインデックス (0..MOVE_AMOUNTS.length-1)
 * 報酬: 距離の減少（正） or 捕捉でボーナス
 */

const RL = (function () {
  let Q = {}; // stateKey -> array of Q values per action
  const { LEARNING_RATE, DISCOUNT, EPSILON_MIN, EPSILON_DECAY, EPSILON_INITIAL, STATE_BINS, STORAGE_KEY, INITIAL_CAUTIOUS_BIAS } = CONFIG.RL;
  let epsilon = typeof EPSILON_INITIAL === 'number' ? EPSILON_INITIAL : 1.0;
  const actionCount = CONFIG.MOVE_AMOUNTS.length;

  /** 未学習状態のQ: 行動インデックスが小さい（＝1pxに近い）ほど高くし、最初は超慎重に振る舞う */
  function createInitialQ() {
    const arr = new Array(actionCount);
    for (let a = 0; a < actionCount; a++) {
      arr[a] = (actionCount - 1 - a) * INITIAL_CAUTIOUS_BIAS;
    }
    return arr;
  }

  function stateKey(spread) {
    // spread を [0, STATE_BINS) に離散化
    const normalized = Math.min(1, Math.max(0, spread));
    const bin = Math.min(STATE_BINS - 1, Math.floor(normalized * STATE_BINS));
    return String(bin);
  }

  function getQ(state, action) {
    const key = stateKey(state);
    if (!Q[key]) Q[key] = createInitialQ();
    return Q[key][action];
  }

  function setQ(state, action, value) {
    const key = stateKey(state);
    if (!Q[key]) Q[key] = createInitialQ();
    Q[key][action] = value;
  }

  let lastSpreadDebug = null;
  let spreadMinRaw = 1;
  let spreadMaxRaw = 0;

  /**
   * 8方向スコアのばらつきを 0..1 に正規化。
   * - 2乗距離を用いた方向スコア（DEVIATION_USE_SQ）: raw（range）を固定 [SPREAD_RAW_MIN, SPREAD_RAW_MAX] で線形写像。
   *   normalized = (rawMax - raw) / (rawMax - rawMin)。遠い→raw大→0、近い→raw小→1。state 0〜4 がばらける。
   * - 従来の距離変化を用いた方向スコア: range がほぼ一定のため、観測した raw の min/max で [0,1] に引き伸ばす。
   */
  function spreadFromScores(scores) {
    if (scores.length === 0) return 0;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
    const std = Math.sqrt(variance);
    const spread = range + std * 0.5;
    const useSq = CONFIG.DEVIATION_USE_SQ !== false;
    let normalized;
    if (useSq) {
      const rawMin = CONFIG.RL.SPREAD_RAW_MIN != null ? CONFIG.RL.SPREAD_RAW_MIN : 5;
      const rawMax = CONFIG.RL.SPREAD_RAW_MAX != null ? CONFIG.RL.SPREAD_RAW_MAX : 15;
      const band = rawMax - rawMin;
      normalized = band <= 0 ? 0.5 : (rawMax - range) / band;
    } else {
      const k = 6;
      const raw = spread / (spread + k);
      spreadMinRaw = Math.min(spreadMinRaw, raw);
      spreadMaxRaw = Math.max(spreadMaxRaw, raw);
      const band = spreadMaxRaw - spreadMinRaw + 1e-9;
      normalized = Math.min(1, Math.max(0, (raw - spreadMinRaw) / band));
    }
    normalized = Math.min(1, Math.max(0, normalized));
    lastSpreadDebug = {
      raw: useSq ? range : spread / (spread + 6),
      normalized,
      stateKey: stateKey(normalized),
      range,
      std,
      spread,
      spreadMinRaw,
      spreadMaxRaw,
    };
    return normalized;
  }

  function getLastSpreadDebug() {
    return lastSpreadDebug;
  }

  /**
   * 探索時は「小さい移動量」を選びやすくする重み付きランダム。
   * いきなり100pxを試さず、2px・4pxなどから試して成長感を出す。
   */
  function chooseExplorationAction() {
    const weights = [];
    for (let a = 0; a < actionCount; a++) {
      weights.push(actionCount - a);
    }
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let a = 0; a < actionCount; a++) {
      r -= weights[a];
      if (r <= 0) return a;
    }
    return 0;
  }

  function chooseAction(spread) {
    const key = stateKey(spread);
    if (!Q[key]) Q[key] = createInitialQ();

    if (Math.random() < epsilon) {
      return chooseExplorationAction();
    }
    const qs = Q[key];
    let best = 0;
    for (let i = 1; i < qs.length; i++) {
      if (qs[i] > qs[best]) best = i;
    }
    return best;
  }

  function update(state, action, reward, nextSpread) {
    const currentQ = getQ(state, action);
    const nextKey = stateKey(nextSpread);
    let maxNextQ = 0;
    if (Q[nextKey]) {
      maxNextQ = Math.max(...Q[nextKey]);
    } else {
      const initial = createInitialQ();
      maxNextQ = Math.max(...initial);
    }
    const newQ = currentQ + LEARNING_RATE * (reward + DISCOUNT * maxNextQ - currentQ);
    setQ(state, action, newQ);
    epsilon = Math.max(EPSILON_MIN, epsilon * EPSILON_DECAY);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ Q, epsilon }));
    } catch (e) {
      console.warn('RL save failed', e);
    }
  }

  function load() {
    spreadMinRaw = 1;
    spreadMaxRaw = 0;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        Q = data.Q || {};
        epsilon = typeof data.epsilon === 'number' ? data.epsilon : (CONFIG.RL.EPSILON_INITIAL ?? 0.05);
      }
    } catch (e) {
      console.warn('RL load failed', e);
    }
  }

  function reset() {
    Q = {};
    epsilon = typeof CONFIG.RL.EPSILON_INITIAL === 'number' ? CONFIG.RL.EPSILON_INITIAL : 0.05;
    spreadMinRaw = 1;
    spreadMaxRaw = 0;
    save();
  }

  /** 現在のQとepsilonをオブジェクトで返す（エクスポート用） */
  function exportData() {
    return {
      Q: JSON.parse(JSON.stringify(Q)),
      epsilon: epsilon,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * エクスポートされたデータを読み込み反映する。LocalStorageにも保存する。
   * @param {object} data - { Q, epsilon } 形式。Qは stateKey -> number[] のオブジェクト。
   * @returns {{ success: boolean, error?: string }}
   */
  function importData(data) {
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'データが不正です' };
    }
    const newQ = data.Q;
    if (!newQ || typeof newQ !== 'object') {
      return { success: false, error: 'Q が含まれていません' };
    }
    Q = {};
    for (const key of Object.keys(newQ)) {
      const arr = newQ[key];
      if (Array.isArray(arr) && arr.length === actionCount) {
        Q[key] = arr.slice();
      }
    }
    if (typeof data.epsilon === 'number' && data.epsilon >= 0) {
      epsilon = Math.min(1, data.epsilon);
    }
    save();
    return { success: true };
  }

  load();

  return {
    spreadFromScores,
    chooseAction,
    update,
    save,
    load,
    reset,
    exportData,
    importData,
    getLastSpreadDebug,
    getEpsilon: () => epsilon,
    getMoveAmount: (actionIndex) => CONFIG.MOVE_AMOUNTS[actionIndex] ?? 1,
  };
})();
