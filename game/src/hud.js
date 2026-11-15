// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money, alive counts,
// kill feed, banners, the buy menu and the plant bar. It never touches the simulation;
// main.js pushes numbers in and reads the play callback out.

const COPY = {
  start: {
    title: 'SCRAPLINE',
    copy: 'Yard 7, a decommissioned freight terminal. Plant the charge at Crane Bay or Silo Row — or eliminate Ember. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'SCRAPLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: { title: '', copy: '', action: 'Next round' },
  matchEnd: { title: '', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const healthFill = $('health-fill');
  const healthNumber = $('health-number');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const timerBox = $('timer');
  const scoreCobalt = $('score-cobalt');
  const scoreEmber = $('score-ember');
  const roundLabel = $('round-label');
  const aliveCobalt = $('alive-cobalt');
  const aliveEmber = $('alive-ember');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const vignette = $('damage-vignette');
  const scope = $('scope');
  const spectate = $('spectate');

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastGrenades = -1;
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = -1;
  let lastScore = '';
  let lastAlive = '';
  let buyHandler = null;

  function pips(container, alive, total, team) {
    const key = `${team}:${alive}`;
    if (container.dataset.key === key) return;
    container.dataset.key = key;
    container.innerHTML = '';
    for (let i = 0; i < total; i += 1) {
      const pip = document.createElement('i');
      pip.className = `pip ${team}${i < alive ? '' : ' dead'}`;
      container.appendChild(pip);
    }
  }

  return {
    setHealth(hp) {
      const value = Math.max(0, Math.ceil(hp));
      if (value === lastHealth) return;
      lastHealth = value;
      healthFill.style.width = `${value}%`;
      healthFill.classList.toggle('low', value <= 30);
      healthNumber.textContent = String(value);
    },
    setAmmo(mag, reserve, weapon, grenades) {
      if (mag === lastMag && reserve === lastReserve && weapon === lastWeapon && grenades === lastGrenades) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = weapon;
      lastGrenades = grenades;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoBox.classList.toggle('empty', mag === 0);
      weaponName.textContent = weapon;
      grenadeCount.textContent = grenades > 0 ? `◉ ${grenades}` : '';
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value.toLocaleString('en-US')}`;
      buyMoney.textContent = `$${value.toLocaleString('en-US')}`;
    },
    setTimer(seconds, phase) {
      const value = Math.max(0, Math.ceil(seconds));
      if (value === lastTimer && timerBox.dataset.phase === phase) return;
      lastTimer = value;
      timerBox.dataset.phase = phase;
      const minutes = Math.floor(value / 60);
      const secs = String(value % 60).padStart(2, '0');
      timerValue.textContent = `${minutes}:${secs}`;
      timerBox.classList.toggle('urgent', value <= 10 && phase !== 'buy');
      timerBox.classList.toggle('planted', phase === 'planted');
    },
    setScore(cobalt, ember, round) {
      const key = `${cobalt}-${ember}-${round}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreCobalt.textContent = String(cobalt);
      scoreEmber.textContent = String(ember);
      roundLabel.textContent = `ROUND ${round}`;
    },
    setAlive(cobaltAlive, emberAlive) {
      const key = `${cobaltAlive}-${emberAlive}`;
      if (key === lastAlive) return;
      lastAlive = key;
      pips(aliveCobalt, cobaltAlive, 4, 'cobalt');
      pips(aliveEmber, emberAlive, 5, 'ember');
    },
    setCrosshair(gapPx) {
      crosshair.style.setProperty('--gap', `${gapPx.toFixed(1)}px`);
    },
    hitMarker(killed, headshot) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      hitmarker.classList.toggle('head', headshot);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill', 'head'), 120);
    },
    killFeed(killer, victim, headshot, killerTeam) {
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      const killerSpan = document.createElement('span');
      killerSpan.className = killerTeam === 'cobalt' ? 'feed-cobalt' : 'feed-ember';
      killerSpan.textContent = killer;
      const weapon = document.createElement('span');
      weapon.className = 'feed-weapon';
      weapon.textContent = headshot ? ' ⌖ ' : ' — ';
      const victimSpan = document.createElement('span');
      victimSpan.className = victim === 'You' ? 'feed-you' : 'feed-plain';
      victimSpan.textContent = victim;
      entry.append(killerSpan, weapon, victimSpan);
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.remove(), 6000);
    },
    banner(main, sub, holdMs = 2200) {
      bannerTitle.textContent = main;
      bannerSub.textContent = sub ?? '';
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    clearBanner() {
      clearTimeout(bannerTimer);
      banner.classList.remove('on');
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    setScoped(scoped) {
      scope.hidden = !scoped;
      crosshair.style.visibility = scoped ? 'hidden' : '';
    },
    setSpectating(on) {
      spectate.hidden = !on;
    },
    setPlant(p, label) {
      if (p <= 0) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.min(100, p * 100)}%`;
      plantLabel.textContent = label;
    },
    showBuyMenu(money, primary, grenades) {
      buyMenu.hidden = false;
      buyMoney.textContent = `$${money.toLocaleString('en-US')}`;
      for (const card of buyMenu.querySelectorAll('[data-item]')) {
        const price = Number(card.dataset.price);
        const id = card.dataset.item;
        card.classList.toggle('owned', id === primary);
        card.classList.toggle('cant', money < price || (id === 'grenade' && grenades >= 2));
      }
    },
    hideBuyMenu() {
      buyMenu.hidden = true;
    },
    onBuy(handler) {
      if (buyHandler) return;
      buyHandler = handler;
      buyMenu.addEventListener('click', (event) => {
        const card = event.target.closest('[data-item]');
        if (card) handler(card.dataset.item);
      });
    },
    showOverlay(mode, data) {
      if (mode === 'roundEnd') {
        title.textContent = data.winner === 'cobalt' ? 'ROUND WON' : 'ROUND LOST';
        copy.textContent = `${data.reason}. Cobalt ${data.score.cobalt} — ${data.score.ember} Ember.`;
        play.textContent = 'Next round';
      } else if (mode === 'matchEnd') {
        title.textContent = data.winner === 'cobalt' ? 'MATCH WON' : data.winner === 'ember' ? 'MATCH LOST' : 'DRAW';
        copy.textContent = `Final score: Cobalt ${data.score.cobalt} — ${data.score.ember} Ember.`;
        play.textContent = 'Play again';
      } else {
        const text = COPY[mode];
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
