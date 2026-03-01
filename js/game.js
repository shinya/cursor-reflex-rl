/**
 * ゲームコア: フィールド、ターゲット、ヒト／AI当たり判定、方向スコア計算、AI移動
 */

const Game = (function () {
  const {
    FIELD_WIDTH,
    FIELD_HEIGHT,
    TARGET_RADIUS,
    AI_CURSOR_RADIUS,
    DIRECTIONS,
  } = CONFIG;

  let fieldEl = null;
  let targetEl = null;
  let aiCursorEl = null;
  let target = { x: 0, y: 0 };
  let aiPos = { x: 0, y: 0 };
  let mousePos = null;
  let scoreHuman = 0;
  let scoreAI = 0;
  let remainingTime = 0;
  let elapsedTime = 0;
  let running = false;
  let animationId = null;
  let lastAISpread = 0;
  let mode = 'vs'; // 'vs' | 'learning'

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function distSq(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
  }

  function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
  }

  /**
   * 方向スコアへの変換（復元困難な 1 次元スカラー）:
   * - 2乗距離の変化 Δ² を使う場合: sign(Δ²) * log(1 + |Δ²|) … 距離に比例したばらつきになる
   * - 従来の距離変化 Δ を使う場合: sign(Δ) * sqrt(|Δ| * scale)
   */
  function obfuscate(deltaOrDeltaSq, useSq) {
    const d = deltaOrDeltaSq;
    if (d === 0) return 0;
    const sign = d > 0 ? 1 : -1;
    const abs = Math.abs(d);
    if (useSq) {
      return sign * Math.log(1 + abs) * (CONFIG.DEVIATION_LOG_SCALE || 1);
    }
    return sign * Math.sqrt(abs * (CONFIG.DEVIATION_SCALE || 10));
  }

  /**
   * AI位置とターゲット位置から、8方向それぞれに「1px相当」動いたときの
   * 方向スコアを求め、obfuscate したスコアの配列を返す（AIには座標を渡さない）。
   * 2乗距離の変化 Δ² を使うと、値が距離に比例するため「遠い／近い」でばらつきが変わる。
   */
  function computeObfuscatedScores(ai, tg) {
    const useSq = CONFIG.DEVIATION_USE_SQ !== false;
    const beforeSq = distSq(ai, tg);
    const scores = [];
    for (const dir of DIRECTIONS) {
      const len = Math.hypot(dir.dx, dir.dy) || 1;
      const step = 1;
      const nx = ai.x + (dir.dx / len) * step;
      const ny = ai.y + (dir.dy / len) * step;
      const afterSq = distSq({ x: nx, y: ny }, tg);
      const deltaSq = afterSq - beforeSq;
      scores.push(obfuscate(deltaSq, useSq));
    }
    return scores;
  }

  function spawnTarget() {
    // 直径20pxの円がすべて描画領域内に収まるよう、端から20pxのパディングを取る
    const padding = 20;
    target.x = padding + Math.random() * (FIELD_WIDTH - 2 * padding);
    target.y = padding + Math.random() * (FIELD_HEIGHT - 2 * padding);
    if (targetEl) {
      targetEl.style.left = target.x + 'px';
      targetEl.style.top = target.y + 'px';
    }
  }

  function clampAIPos() {
    aiPos.x = clamp(aiPos.x, AI_CURSOR_RADIUS, FIELD_WIDTH - AI_CURSOR_RADIUS);
    aiPos.y = clamp(aiPos.y, AI_CURSOR_RADIUS, FIELD_HEIGHT - AI_CURSOR_RADIUS);
  }

  function updateDOM() {
    if (aiCursorEl) {
      aiCursorEl.style.left = aiPos.x + 'px';
      aiCursorEl.style.top = aiPos.y + 'px';
    }
  }

  function humanOverlapsTarget() {
    if (!mousePos) return false;
    return distance(mousePos, target) <= TARGET_RADIUS;
  }

  function aiOverlapsTarget() {
    return distance(aiPos, target) <= TARGET_RADIUS + AI_CURSOR_RADIUS;
  }

  let lastAIActionIndex = 0;
  let lastTick = 0;
  let lastAITime = 0;
  let aiStepCount = 0;
  const AI_INTERVAL_MS = 80;

  function gameLoop(now) {
    if (!running) return;

    const elapsed = (now - lastTick) / 1000;
    lastTick = now;

    if (mode === 'vs') {
      if (remainingTime <= 0) {
        stop();
        if (typeof Game.onGameEnd === 'function') Game.onGameEnd({ scoreHuman, scoreAI });
        return;
      }
      remainingTime -= elapsed;
      if (remainingTime < 0) remainingTime = 0;
    } else {
      elapsedTime += elapsed;
    }

    if (typeof Game.onTick === 'function') {
      Game.onTick({ remainingTime, scoreHuman, scoreAI, elapsedTime, mode });
    }

    // 当たり判定（対戦モードはヒト優先、学習モードはAIのみ）
    if (mode === 'vs' && humanOverlapsTarget()) {
      scoreHuman++;
      if (typeof Game.onScore === 'function') Game.onScore('human', scoreHuman);
      spawnTarget();
      RL.save();
    } else if (aiOverlapsTarget()) {
      scoreAI++;
      if (typeof Game.onScore === 'function') Game.onScore('ai', scoreAI);
      const captureReward = 50 - (CONFIG.RL.STEP_PENALTY || 0);
      RL.update(lastAISpread, lastAIActionIndex, captureReward, 0);
      RL.save();
      spawnTarget();
    } else if (now - lastAITime >= AI_INTERVAL_MS) {
      lastAITime = now;
      aiStepCount += 1;
      // AI は一定間隔で行動
      const scores = computeObfuscatedScores(aiPos, target);
      const spread = RL.spreadFromScores(scores);
      const dist = distance(aiPos, target);
      if (CONFIG.RL.LOG_SPREAD) {
        const rate = CONFIG.RL.LOG_SPREAD_SAMPLE_RATE || 40;
        const closeTh = CONFIG.RL.LOG_SPREAD_CLOSE_THRESHOLD ?? 50;
        const farTh = CONFIG.RL.LOG_SPREAD_FAR_THRESHOLD ?? 280;
        const shouldLog = aiStepCount % rate === 0 || dist < closeTh || dist > farTh;
        if (shouldLog) {
          const debug = RL.getLastSpreadDebug();
          const label = dist < closeTh ? ' [近]' : dist > farTh ? ' [遠]' : '';
          console.log(
            `spread | distance=${(dist | 0)}${label} raw=${debug ? debug.raw.toFixed(4) : '-'} norm=${debug && debug.normalized != null ? debug.normalized.toFixed(4) : '-'} state=${debug ? debug.stateKey : '-'} band=[${debug && debug.spreadMinRaw != null ? debug.spreadMinRaw.toFixed(4) : '-'},${debug && debug.spreadMaxRaw != null ? debug.spreadMaxRaw.toFixed(4) : '-'}]`
          );
        }
      }
      const { directionIndex, moveAmount, actionIndex } = AI.getAction(scores);
      lastAISpread = spread;
      lastAIActionIndex = actionIndex;

      const oldDist = dist;
      const dir = DIRECTIONS[directionIndex];
      const len = Math.hypot(dir.dx, dir.dy) || 1;
      aiPos.x += (dir.dx / len) * moveAmount;
      aiPos.y += (dir.dy / len) * moveAmount;
      clampAIPos();

      const newDist = distance(aiPos, target);
      const stepPenalty = CONFIG.RL.STEP_PENALTY || 0;
      const reward = (oldDist - newDist) - stepPenalty;
      const nextScores = computeObfuscatedScores(aiPos, target);
      const nextSpread = RL.spreadFromScores(nextScores);
      RL.update(spread, actionIndex, reward, nextSpread);
    }

    updateDOM();
    animationId = requestAnimationFrame(gameLoop);
  }

  function start(options) {
    if (running) return;
    options = options || {};
    mode = options.mode === 'learning' ? 'learning' : 'vs';
    fieldEl = document.getElementById('game-field');
    targetEl = document.getElementById('target');
    aiCursorEl = document.getElementById('ai-cursor');
    if (!fieldEl || !targetEl || !aiCursorEl) return;

    scoreHuman = 0;
    scoreAI = 0;
    remainingTime = mode === 'vs' ? CONFIG.GAME_DURATION : 0;
    elapsedTime = 0;
    aiPos.x = FIELD_WIDTH / 2;
    aiPos.y = FIELD_HEIGHT / 2;
    lastTick = performance.now();
    lastAITime = performance.now();
    aiStepCount = 0;
    spawnTarget();
    updateDOM();
    running = true;
    animationId = requestAnimationFrame(gameLoop);
  }

  function stop() {
    const wasLearning = mode === 'learning';
    running = false;
    if (animationId != null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    RL.save();
    if (wasLearning && typeof Game.onLearningStop === 'function') {
      Game.onLearningStop({ scoreAI, elapsedTime });
    }
  }

  function setMousePosition(clientX, clientY) {
    if (!fieldEl) return;
    const rect = fieldEl.getBoundingClientRect();
    mousePos = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function clearMousePosition() {
    mousePos = null;
  }

  return {
    start,
    stop,
    setMousePosition,
    clearMousePosition,
    getScoreHuman: () => scoreHuman,
    getScoreAI: () => scoreAI,
    getRemainingTime: () => remainingTime,
    getElapsedTime: () => elapsedTime,
    getMode: () => mode,
    isRunning: () => running,
    onScore: null,
    onGameEnd: null,
    onTick: null,
    onLearningStop: null,
  };
})();
