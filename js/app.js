/**
 * エントリ・UI連携: スタート、タイマー、スコア、履歴、学習リセット
 */

(function () {
  const HISTORY_KEY = 'touch-mouse-history';
  const MAX_HISTORY = 30;
  const RL_META_KEY = 'touch-mouse-rl-meta'; // 学習モード試行回数・経過時間（LocalStorage の touch-mouse-rl 形式は変えない）
  const MODE_VS = 'vs';
  const MODE_LEARNING = 'learning';

  const scoreHumanEl = document.getElementById('score-human');
  const scoreHumanLabelEl = document.getElementById('score-human-label');
  const scoreAIEl = document.getElementById('score-ai');
  const timerEl = document.getElementById('timer-display');
  const timerSuffixEl = document.getElementById('timer-suffix');
  const timerWrap = document.querySelector('.timer');
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnResetLearning = document.getElementById('btn-reset-learning');
  const btnExportRl = document.getElementById('btn-export-rl');
  const btnImportRl = document.getElementById('btn-import-rl');
  const inputImportRl = document.getElementById('input-import-rl');
  const scoreHistoryEl = document.getElementById('score-history');
  const gameField = document.getElementById('game-field');
  const modeTabs = document.querySelectorAll('.mode-tab');

  let currentMode = MODE_VS;
  /** 学習モード開始時点の累計秒（表示＝これ＋今回の経過で「続きから」を表現） */
  let learningModeBaseSeconds = 0;

  function setMode(mode) {
    currentMode = mode;
    modeTabs.forEach(function (tab) {
      const isActive = tab.getAttribute('data-mode') === mode;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (mode === MODE_LEARNING) {
      if (scoreHumanLabelEl) scoreHumanLabelEl.textContent = '観戦';
      if (scoreHumanEl) scoreHumanEl.textContent = '—';
      if (timerSuffixEl) timerSuffixEl.textContent = ' 経過';
      if (timerEl) timerEl.textContent = formatElapsed(getLearningMeta().learningModeTotalSeconds);
      if (btnStop) btnStop.style.display = '';
    } else {
      if (scoreHumanLabelEl) scoreHumanLabelEl.textContent = 'ヒト';
      if (scoreHumanEl) scoreHumanEl.textContent = '0';
      if (timerSuffixEl) timerSuffixEl.textContent = ' 秒';
      if (timerEl) timerEl.textContent = String(CONFIG.GAME_DURATION);
      if (btnStop) btnStop.style.display = 'none';
    }
    updateScores(Game.getScoreHuman(), Game.getScoreAI());
  }

  function updateScores(human, ai) {
    if (scoreHumanEl && currentMode === MODE_VS) scoreHumanEl.textContent = human;
    if (scoreAIEl) scoreAIEl.textContent = ai;
  }

  function formatElapsed(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function getLearningMeta() {
    try {
      const raw = localStorage.getItem(RL_META_KEY);
      if (!raw) return { learningModeSessions: 0, learningModeTotalSeconds: 0 };
      const o = JSON.parse(raw);
      return {
        learningModeSessions: typeof o.learningModeSessions === 'number' ? o.learningModeSessions : 0,
        learningModeTotalSeconds: typeof o.learningModeTotalSeconds === 'number' ? o.learningModeTotalSeconds : 0,
      };
    } catch {
      return { learningModeSessions: 0, learningModeTotalSeconds: 0 };
    }
  }

  function setLearningMeta(meta) {
    try {
      localStorage.setItem(RL_META_KEY, JSON.stringify(meta));
    } catch (e) {
      console.warn('RL meta save failed', e);
    }
  }

  function formatLearningMetaLabel(sessions, totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    const timeStr = m > 0 ? m + '分' + s + '秒' : s + '秒';
    return '学習モード ' + sessions + '回 / 合計 ' + timeStr;
  }

  function updateTimer(seconds, options) {
    options = options || {};
    if (currentMode === MODE_LEARNING && options.elapsed != null) {
      if (timerEl) timerEl.textContent = formatElapsed(options.elapsed);
      if (timerWrap) {
        timerWrap.classList.remove('running', 'ended');
        timerWrap.classList.add('learning');
      }
    } else {
      if (timerEl && options.elapsed == null) timerEl.textContent = Math.ceil(seconds);
      if (timerWrap) {
        timerWrap.classList.remove('learning');
        timerWrap.classList.toggle('running', seconds > 0 && Game.isRunning());
        timerWrap.classList.toggle('ended', seconds <= 0 && !Game.isRunning());
      }
    }
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(entries) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-MAX_HISTORY)));
    } catch (e) {
      console.warn('History save failed', e);
    }
  }

  function addHistory(scoreHuman, scoreAI) {
    const entries = loadHistory();
    entries.push({
      human: scoreHuman,
      ai: scoreAI,
      winner: scoreHuman > scoreAI ? 'ヒト' : scoreAI > scoreHuman ? 'AI' : '同点',
      at: new Date().toLocaleString('ja-JP'),
    });
    saveHistory(entries);
    renderHistory();
  }

  function renderHistory() {
    if (!scoreHistoryEl) return;
    const entries = loadHistory();
    scoreHistoryEl.innerHTML = entries
      .slice()
      .reverse()
      .slice(0, 15)
      .map(
        (e) =>
          `<div class="row">${e.at} — ヒト ${e.human} : ${e.ai} AI（${e.winner}）</div>`
      )
      .join('');
  }

  Game.onTick = function (data) {
    updateScores(data.scoreHuman, data.scoreAI);
    if (data.mode === MODE_LEARNING) {
      updateTimer(0, { elapsed: learningModeBaseSeconds + (data.elapsedTime || 0) });
    } else {
      updateTimer(data.remainingTime);
    }
  };

  Game.onScore = function (who, score) {
    updateScores(Game.getScoreHuman(), Game.getScoreAI());
  };

  Game.onGameEnd = function (data) {
    updateScores(data.scoreHuman, data.scoreAI);
    updateTimer(0);
    if (timerWrap) timerWrap.classList.add('ended');
    btnStart.disabled = false;
    btnStart.textContent = 'もう一度プレイ';
    addHistory(data.scoreHuman, data.scoreAI);
  };

  Game.onLearningStop = function (data) {
    if (scoreAIEl) scoreAIEl.textContent = data.scoreAI;
    var meta = getLearningMeta();
    meta.learningModeSessions += 1;
    meta.learningModeTotalSeconds += (data.elapsedTime || 0);
    setLearningMeta(meta);
    if (timerEl) timerEl.textContent = formatElapsed(meta.learningModeTotalSeconds);
    if (btnStart) { btnStart.disabled = false; btnStart.textContent = 'スタート'; }
    if (btnStop) btnStop.style.display = '';
  };

  if (modeTabs.length) {
    modeTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (Game.isRunning()) {
          Game.stop();
          if (btnStart) { btnStart.disabled = false; btnStart.textContent = 'スタート'; }
          if (btnStop) btnStop.style.display = 'none';
        }
        const m = tab.getAttribute('data-mode');
        if (m === MODE_VS || m === MODE_LEARNING) setMode(m);
      });
    });
  }

  if (btnStart) {
    btnStart.addEventListener('click', function () {
      if (Game.isRunning()) return;
      if (currentMode === MODE_LEARNING) {
        learningModeBaseSeconds = getLearningMeta().learningModeTotalSeconds;
      }
      btnStart.disabled = true;
      btnStart.textContent = currentMode === MODE_LEARNING ? '学習中...' : 'プレイ中...';
      if (currentMode === MODE_LEARNING && btnStop) btnStop.style.display = '';
      updateTimer(currentMode === MODE_VS ? CONFIG.GAME_DURATION : 0, currentMode === MODE_LEARNING ? { elapsed: learningModeBaseSeconds } : {});
      Game.start({ mode: currentMode });
    });
  }

  if (btnStop) {
    btnStop.addEventListener('click', function () {
      if (!Game.isRunning() || Game.getMode() !== MODE_LEARNING) return;
      Game.stop();
    });
  }

  if (btnResetLearning) {
    btnResetLearning.addEventListener('click', function () {
      if (Game.isRunning()) return;
      RL.reset();
      alert('学習データをリセットしました。');
    });
  }

  if (btnExportRl) {
    btnExportRl.addEventListener('click', function () {
      if (Game.isRunning()) return;
      var meta = getLearningMeta();
      const data = Object.assign(RL.exportData(), {
        learningModeSessions: meta.learningModeSessions,
        learningModeTotalSeconds: meta.learningModeTotalSeconds,
      });
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const name = 'touch-mouse-rl-' + new Date().toISOString().slice(0, 19).replace(/[:-]/g, '') + '.json';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  if (btnImportRl && inputImportRl) {
    btnImportRl.addEventListener('click', function () {
      if (Game.isRunning()) return;
      inputImportRl.value = '';
      inputImportRl.click();
    });
    inputImportRl.addEventListener('change', function () {
      const file = inputImportRl.files && inputImportRl.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const data = JSON.parse(reader.result);
          const result = RL.importData(data);
          if (result.success) {
            var msg = '学習データをインポートしました。';
            var sessions = data.learningModeSessions;
            var totalSeconds = data.learningModeTotalSeconds;
            if (typeof sessions === 'number' || typeof totalSeconds === 'number') {
              var s = typeof sessions === 'number' ? sessions : 0;
              var t = typeof totalSeconds === 'number' ? totalSeconds : 0;
              setLearningMeta({ learningModeSessions: s, learningModeTotalSeconds: t });
              msg += '\n（' + formatLearningMetaLabel(s, t) + ' のデータ）';
              if (currentMode === MODE_LEARNING && timerEl) {
                timerEl.textContent = formatElapsed(t);
              }
            }
            alert(msg);
          } else {
            alert('インポートに失敗しました: ' + (result.error || '不明なエラー'));
          }
        } catch (e) {
          alert('インポートに失敗しました: ファイルの形式が正しくありません。');
        }
        inputImportRl.value = '';
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  if (gameField) {
    gameField.addEventListener('mousemove', function (e) {
      Game.setMousePosition(e.clientX, e.clientY);
    });
    gameField.addEventListener('mouseleave', function () {
      Game.clearMousePosition();
    });
  }

  renderHistory();
  updateScores(0, 0);
  updateTimer(CONFIG.GAME_DURATION);
})();
