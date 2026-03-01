/**
 * AI: 8方向の方向スコアから「方向」を計算で決定し、「移動量」を強化学習で選択
 * 方向スコアはゲーム側で計算し、このモジュールには1次元のスコアのみ渡す
 */

const AI = (function () {
  /**
   * 8方向の方向スコア（obfuscated）から、最も近づく方向のインデックスを返す
   * スコアが小さいほど「近づく」とする（距離変化が負 → 変換後も小さい）
   */
  function bestDirectionIndex(scores) {
    if (!scores || scores.length === 0) return 0;
    let best = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] < scores[best]) best = i;
    }
    return best;
  }

  /**
   * 状態（ばらつき）から移動量アクションを選択
   */
  function selectMoveAmount(spread) {
    const actionIndex = RL.chooseAction(spread);
    return {
      actionIndex,
      moveAmount: RL.getMoveAmount(actionIndex),
    };
  }

  /**
   * メイン: 8方向スコアを受け取り、方向と移動量を返す
   */
  function getAction(obfuscatedScores) {
    const directionIndex = bestDirectionIndex(obfuscatedScores);
    const spread = RL.spreadFromScores(obfuscatedScores);
    const { actionIndex, moveAmount } = selectMoveAmount(spread);
    return {
      directionIndex,
      moveAmount,
      actionIndex,
      spread,
    };
  }

  return {
    getAction,
    bestDirectionIndex,
    spreadFromScores: RL.spreadFromScores,
  };
})();
