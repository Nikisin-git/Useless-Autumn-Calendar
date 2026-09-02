(() => {
  'use strict';

  // ---------- Global state ----------
  const now = new Date();
  const state = {
    event: {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: (now.getHours() + 1) % 24,
      minute: 0
    },
    progress: {
      dateTimeSet: false,
      captchaSolved: false,
      gamePassed: false
    },
    currentScreen: 'dateTime'
  };

  const ranges = {
    year:   { min: 1970, max: 2099 },
    month:  { min: 1,    max: 12 },
    day:    { min: 1,    max: 31 }, // dynamic max
    hour:   { min: 0,    max: 23 },
    minute: { min: 0,    max: 59 }
  };

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function cycle(val, min, max) {
    const span = max - min + 1;
    return ((val - min) % span + span) % span + min;
  }

  function clampDay() {
    const md = daysInMonth(state.event.year, state.event.month);
    if (state.event.day > md) state.event.day = md;
  }

  function renderFields() {
    document.getElementById('input-year').value   = String(state.event.year);
    document.getElementById('input-month').value  = String(state.event.month).padStart(2, '0');
    document.getElementById('input-day').value    = String(state.event.day).padStart(2, '0');
    document.getElementById('input-hour').value   = String(state.event.hour).padStart(2, '0');
    document.getElementById('input-minute').value = String(state.event.minute).padStart(2, '0');
  }

  function applyDelta(field, delta) {
    const r = ranges[field];
    let max = r.max;
    if (field === 'day') max = daysInMonth(state.event.year, state.event.month);
    state.event[field] = cycle(state.event[field] + delta, r.min, max);
    if (field === 'year' || field === 'month') clampDay();
    renderFields();
  }

  // ---------- Hold-repeat on ± buttons ----------
  function bindRepeatButton(btn) {
    const [field, deltaStr] = btn.dataset.act.split(':');
    const delta = parseInt(deltaStr, 10);
    let holdTimer = null;
    let repeatTimer = null;
    let didRepeat = false;

    const stop = () => {
      if (holdTimer)   { clearTimeout(holdTimer);   holdTimer = null; }
      if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
    };

    const start = (e) => {
      e.preventDefault();
      didRepeat = false;
      applyDelta(field, delta);
      holdTimer = setTimeout(() => {
        didRepeat = true;
        repeatTimer = setInterval(() => applyDelta(field, delta), 125); // 8/sec
      }, 500);
    };

    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive: false });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel', 'blur'].forEach(ev =>
      btn.addEventListener(ev, stop)
    );
    // Prevent the default click firing an extra step after hold
    btn.addEventListener('click', (e) => { if (didRepeat) e.preventDefault(); });
  }

  document.querySelectorAll('.repeat').forEach(bindRepeatButton);

  // Block direct keyboard input on all fields (they are readonly, but also swallow keys)
  document.querySelectorAll('.field input').forEach(inp => {
    inp.addEventListener('keydown', e => e.preventDefault());
    inp.addEventListener('paste',   e => e.preventDefault());
  });

  // ---------- Screen switching ----------
  const screens = ['dateTime', 'captcha', 'game', 'save', 'success'];
  function showScreen(name) {
    state.currentScreen = name;
    screens.forEach(s => {
      const el = document.getElementById('screen-' + s);
      el.hidden = (s !== name);
    });
    if (name === 'captcha') initCaptcha();
    if (name === 'game')    startGame();
    if (name === 'save')    renderSaveSummary();
    if (name === 'success') renderSuccessSummary();
  }

  document.getElementById('btn-dt-next').addEventListener('click', () => {
    state.progress.dateTimeSet = true;
    showScreen('captcha');
  });

  // ---------- Captcha ----------
  // Each pool entry: {src, correct: bool}
  const CAPTCHA_POOL = [
    { src: 'assets/captcha/autumn_leaf1.svg',   correct: true },
    { src: 'assets/captcha/autumn_leaf2.svg',   correct: true },
    { src: 'assets/captcha/autumn_pumpkin.svg', correct: true },
    { src: 'assets/captcha/autumn_tree.svg',    correct: true },
    { src: 'assets/captcha/calendar1.svg',      correct: true },
    { src: 'assets/captcha/calendar2.svg',      correct: true },
    { src: 'assets/captcha/digit3_1.svg',       correct: true },
    { src: 'assets/captcha/digit3_2.svg',       correct: true },
    { src: 'assets/captcha/distractor_cat.svg',       correct: false },
    { src: 'assets/captcha/distractor_dog.svg',       correct: false },
    { src: 'assets/captcha/distractor_pizza.svg',     correct: false },
    { src: 'assets/captcha/distractor_car.svg',       correct: false },
    { src: 'assets/captcha/distractor_phone.svg',     correct: false },
    { src: 'assets/captcha/distractor_apple.svg',     correct: false },
    { src: 'assets/captcha/distractor_flower.svg',    correct: false },
    { src: 'assets/captcha/distractor_snowflake.svg', correct: false },
    { src: 'assets/captcha/distractor_fish.svg',      correct: false },
    { src: 'assets/captcha/distractor_star.svg',      correct: false }
  ];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let captchaCells = []; // {src, correct, selected}

  function initCaptcha() {
    const correctItems   = CAPTCHA_POOL.filter(x => x.correct);
    const distractors    = CAPTCHA_POOL.filter(x => !x.correct);
    const nCorrect       = 3 + Math.floor(Math.random() * 3); // 3..5
    const chosenCorrect  = shuffle(correctItems).slice(0, nCorrect);
    const chosenDistr    = shuffle(distractors).slice(0, 9 - nCorrect);
    captchaCells = shuffle([...chosenCorrect, ...chosenDistr])
      .map(x => ({ src: x.src, correct: x.correct, selected: false }));

    const grid = document.getElementById('captcha-grid');
    grid.innerHTML = '';
    captchaCells.forEach((cell, idx) => {
      const div = document.createElement('div');
      div.className = 'captcha-cell';
      div.dataset.idx = idx;
      const img = document.createElement('img');
      img.src = cell.src;
      img.alt = '';
      div.appendChild(img);
      div.addEventListener('click', () => {
        cell.selected = !cell.selected;
        div.classList.toggle('selected', cell.selected);
      });
      grid.appendChild(div);
    });
    document.getElementById('captcha-msg').textContent = '';
  }

  document.getElementById('btn-captcha-check').addEventListener('click', () => {
    const missed = captchaCells.filter(c => c.correct && !c.selected).length;
    const falseHits = captchaCells.filter(c => !c.correct && c.selected).length;
    const msg = document.getElementById('captcha-msg');
    if (missed === 0 && falseHits <= 1) {
      state.progress.captchaSolved = true;
      msg.textContent = 'Верно!';
      setTimeout(() => showScreen('game'), 400);
    } else {
      msg.textContent = 'Неверно. Попробуйте ещё раз.';
      setTimeout(initCaptcha, 500);
    }
  });

  // ---------- Mini-game "Листопад" ----------
  const GAME_DURATION_MS = 20000;
  const SPAWN_MIN_MS = 400;
  const SPAWN_MAX_MS = 600;
  const FALL_SPEED_PX_S = 150;
  const TARGET_CATCH = 7;
  const TARGET_SHARE = 0.60;
  const ICON_SIZE = 48;
  const ICON_POOL = [
    { emoji: '🍂', target: false },
    { emoji: '📅', target: true  },
    { emoji: '❄',  target: false },
    { emoji: '3️⃣', target: false },
    { emoji: '☕', target: false }
  ];

  let gameCaught = 0;
  let gameEnds = 0;
  let gameSpawnTimer = null;
  let gameTickRAF = null;
  let gameTimerInterval = null;
  let gameEntities = []; // {el, x, y, vy, target}

  function pickIcon() {
    if (Math.random() < TARGET_SHARE) return { emoji: '📅', target: true };
    const nonTargets = ICON_POOL.filter(i => !i.target);
    return nonTargets[Math.floor(Math.random() * nonTargets.length)];
  }

  function startGame() {
    const field = document.getElementById('game-field');
    field.innerHTML = '';
    gameEntities = [];
    gameCaught = 0;
    updateGameHUD();
    gameEnds = performance.now() + GAME_DURATION_MS;

    // Timer display
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    gameTimerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((gameEnds - performance.now()) / 1000));
      document.getElementById('game-timer').textContent = `Осталось: ${remaining} с`;
    }, 200);

    // Spawn loop
    const scheduleSpawn = () => {
      const delay = SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
      gameSpawnTimer = setTimeout(() => {
        spawnIcon();
        if (performance.now() < gameEnds) scheduleSpawn();
      }, delay);
    };
    scheduleSpawn();

    // Fall physics loop
    let lastT = performance.now();
    const tick = (t) => {
      const dt = (t - lastT) / 1000;
      lastT = t;
      const field = document.getElementById('game-field');
      const h = field.clientHeight;
      for (let i = gameEntities.length - 1; i >= 0; i--) {
        const ent = gameEntities[i];
        ent.y += FALL_SPEED_PX_S * dt;
        if (ent.y > h) {
          ent.el.remove();
          gameEntities.splice(i, 1);
        } else {
          ent.el.style.top = ent.y + 'px';
        }
      }
      if (performance.now() < gameEnds && !state.progress.gamePassed) {
        gameTickRAF = requestAnimationFrame(tick);
      } else {
        finishGameRound();
      }
    };
    gameTickRAF = requestAnimationFrame(tick);
  }

  function spawnIcon() {
    const field = document.getElementById('game-field');
    const w = field.clientWidth;
    const icon = pickIcon();
    const el = document.createElement('div');
    el.className = 'falling';
    el.textContent = icon.emoji;
    const x = Math.floor(Math.random() * Math.max(1, w - ICON_SIZE));
    el.style.left = x + 'px';
    el.style.top = (-ICON_SIZE) + 'px';
    field.appendChild(el);
    const ent = { el, x, y: -ICON_SIZE, target: icon.target };
    gameEntities.push(ent);
    el.addEventListener('click', () => {
      if (icon.target) {
        gameCaught++;
        updateGameHUD();
        el.remove();
        const idx = gameEntities.indexOf(ent);
        if (idx >= 0) gameEntities.splice(idx, 1);
        if (gameCaught >= TARGET_CATCH) {
          state.progress.gamePassed = true;
          finishGameRound();
          setTimeout(() => showScreen('save'), 300);
        }
      }
    });
  }

  function updateGameHUD() {
    document.getElementById('game-score').textContent = `Поймано: ${gameCaught} / ${TARGET_CATCH}`;
  }

  function finishGameRound() {
    if (gameSpawnTimer)   { clearTimeout(gameSpawnTimer); gameSpawnTimer = null; }
    if (gameTickRAF)      { cancelAnimationFrame(gameTickRAF); gameTickRAF = null; }
    if (gameTimerInterval){ clearInterval(gameTimerInterval); gameTimerInterval = null; }
    if (state.progress.gamePassed) return;
    // Restart automatically on failure
    setTimeout(() => {
      if (state.currentScreen === 'game') startGame();
    }, 300);
  }

  // ---------- Save screen ----------
  function formatDT() {
    const e = state.event;
    const p2 = n => String(n).padStart(2, '0');
    return `${p2(e.day)}.${p2(e.month)}.${e.year} в ${p2(e.hour)}:${p2(e.minute)}`;
  }

  function renderSaveSummary() {
    document.getElementById('save-summary').textContent = formatDT();
  }

  function uuidv4() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map(x => x.toString(16).padStart(2, '0'));
    return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10,16).join('')}`;
  }

  function saveEvent() {
    const e = state.event;
    const p2 = n => String(n).padStart(2, '0');
    const localIso = `${e.year}-${p2(e.month)}-${p2(e.day)}T${p2(e.hour)}:${p2(e.minute)}:00`;
    const dt = new Date(localIso);
    const record = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      datetime: dt.toISOString()
    };
    let arr = [];
    try {
      arr = JSON.parse(localStorage.getItem('absurd_calendar_events') || '[]');
      if (!Array.isArray(arr)) arr = [];
    } catch { arr = []; }
    arr.push(record);
    localStorage.setItem('absurd_calendar_events', JSON.stringify(arr));
    showScreen('success');
  }

  document.getElementById('btn-save-small').addEventListener('click', saveEvent);
  document.getElementById('btn-save-big').addEventListener('click', saveEvent);
  document.getElementById('btn-save-reset').addEventListener('click', resetCurrentEvent);

  function resetCurrentEvent() {
    const n = new Date();
    state.event = {
      year: n.getFullYear(),
      month: n.getMonth() + 1,
      day: n.getDate(),
      hour: (n.getHours() + 1) % 24,
      minute: 0
    };
    state.progress = { dateTimeSet: false, captchaSolved: false, gamePassed: false };
    renderFields();
    showScreen('dateTime');
  }

  // ---------- Success screen ----------
  function renderSuccessSummary() {
    document.getElementById('success-summary').textContent = formatDT();
  }

  document.getElementById('btn-restart').addEventListener('click', () => {
    const n = new Date();
    state.event = {
      year: n.getFullYear(),
      month: n.getMonth() + 1,
      day: n.getDate(),
      hour: (n.getHours() + 1) % 24,
      minute: 0
    };
    state.progress = { dateTimeSet: false, captchaSolved: false, gamePassed: false };
    renderFields();
    showScreen('dateTime');
  });

  // ---------- Init ----------
  renderFields();
  showScreen('dateTime');
})();
