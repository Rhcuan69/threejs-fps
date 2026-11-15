// The match: rounds, money, the charge and the score. Pure state, no DOM — main.js
// pushes the facts in (who is alive, who is planting, who is defusing) and reads the
// events out. First to 5 rounds wins the match, at most 9 rounds.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const FUSE_SECONDS = 40;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const END_SECONDS = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const WIN_MONEY = 3250;
export const LOSS_MONEY = 1900;
export const KILL_MONEY = 300;
export const PLANT_MONEY = 300;
export const START_MONEY = 800;

export function createMatch(callbacks) {
  const state = {
    phase: 'buy',
    phaseT: BUY_SECONDS,
    round: 1,
    score: { cobalt: 0, ember: 0 },
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    plants: 0,
    plantedSite: null,
    plantProgress: 0,
    defuseProgress: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    lossStreak: 0,
  };

  function startRound() {
    state.phase = 'buy';
    state.phaseT = BUY_SECONDS;
    state.plantedSite = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.roundWinner = null;
    state.roundReason = '';
    callbacks.onPhase('buy', state);
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'matchEnd') return;
    state.roundWinner = winner;
    state.roundReason = reason;
    state.score[winner] += 1;
    if (winner === 'cobalt') {
      state.money += WIN_MONEY;
      state.lossStreak = 0;
    } else {
      state.money += LOSS_MONEY + Math.min(2, state.lossStreak) * 500;
      state.lossStreak += 1;
    }
    state.phase = 'end';
    state.phaseT = END_SECONDS;
    callbacks.onRoundEnd(winner, reason, state);
    if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.score.cobalt > state.score.ember
        ? 'cobalt'
        : state.score.ember > state.score.cobalt ? 'ember' : 'draw';
    }
  }

  function step(dt, ctx) {
    if (state.phase === 'matchEnd') return;
    state.phaseT -= dt;

    if (state.phase === 'buy') {
      if (state.phaseT <= 0) {
        state.phase = 'live';
        state.phaseT = ROUND_SECONDS;
        callbacks.onPhase('live', state);
      }
      return;
    }

    if (state.phase === 'live') {
      // The charge can only be planted while the round is live.
      if (ctx.planting && ctx.plantSite) {
        state.plantProgress += dt / PLANT_SECONDS;
        if (state.plantProgress >= 1) {
          state.plantedSite = ctx.plantSite;
          state.plants += 1;
          state.money += PLANT_MONEY;
          state.phase = 'planted';
          state.phaseT = FUSE_SECONDS;
          state.plantProgress = 0;
          callbacks.onPlant(ctx.plantSite, state);
        }
      } else {
        state.plantProgress = Math.max(0, state.plantProgress - dt / PLANT_SECONDS);
      }
      if (ctx.cobaltAlive === 0) return endRound('ember', 'Cobalt eliminated');
      if (ctx.emberAlive === 0) return endRound('cobalt', 'Ember eliminated');
      if (state.phaseT <= 0) return endRound('ember', 'Time expired — charge never planted');
      return;
    }

    if (state.phase === 'planted') {
      if (ctx.defusing) {
        state.defuseProgress += dt / DEFUSE_SECONDS;
        if (state.defuseProgress >= 1) {
          state.defuseProgress = 0;
          return endRound('ember', 'Charge defused');
        }
      } else {
        state.defuseProgress = Math.max(0, state.defuseProgress - dt / DEFUSE_SECONDS);
      }
      if (ctx.cobaltAlive === 0) return endRound('ember', 'Cobalt eliminated');
      if (state.phaseT <= 0) return endRound('cobalt', 'Charge detonated');
      return;
    }

    if (state.phase === 'end') {
      if (state.phaseT <= 0) {
        if (state.matchWinner) {
          state.phase = 'matchEnd';
          callbacks.onMatchEnd(state.matchWinner, state);
        } else {
          state.round += 1;
          startRound();
        }
      }
    }
  }

  return {
    state,
    step,
    startRound,
    startMatch() {
      state.phase = 'buy';
      state.phaseT = BUY_SECONDS;
      state.round = 1;
      state.score = { cobalt: 0, ember: 0 };
      state.money = START_MONEY;
      state.kills = 0;
      state.deaths = 0;
      state.plants = 0;
      state.plantedSite = null;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.roundWinner = null;
      state.roundReason = '';
      state.matchWinner = null;
      state.lossStreak = 0;
      callbacks.onPhase('buy', state);
    },
    addKill() {
      state.kills += 1;
      state.money += KILL_MONEY;
    },
    addDeath() {
      state.deaths += 1;
    },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
  };
}
