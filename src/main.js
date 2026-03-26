const state = {
  user: null,
  pack: null,
  packMeta: {},
  scenarios: [],
  choices: {},
  turn: 0,
  maxTurns: 10,
  score: 0,
  log: []
};

const els = {
  playerName: document.getElementById('playerName'),
  savePlayer: document.getElementById('savePlayer'),
  scenarioSelect: document.getElementById('scenarioSelect'),
  startGame: document.getElementById('startGame'),
  statusPlayer: document.getElementById('statusPlayer'),
  statusPack: document.getElementById('statusPack'),
  statusTurn: document.getElementById('statusTurn'),
  statusScore: document.getElementById('statusScore'),
  scenarioId: document.getElementById('scenarioId'),
  scenarioTitle: document.getElementById('scenarioTitle'),
  scenarioPrompt: document.getElementById('scenarioPrompt'),
  choices: document.getElementById('choices'),
  log: document.getElementById('log'),
  leaderboard: document.getElementById('leaderboard')
};

const STORAGE_USER = 'ducky-user';
const STORAGE_LEADERBOARD = 'ducky-leaderboard-v1';

init();

function init() {
  restoreUser();
  bindEvents();
  loadScenarioIndex();
  renderLeaderboard();
}

function bindEvents() {
  els.savePlayer.addEventListener('click', () => {
    const name = (els.playerName.value || '').trim();
    if (!name) return;
    state.user = name;
    localStorage.setItem(STORAGE_USER, name);
    syncStatus();
    enableStart();
  });

  els.scenarioSelect.addEventListener('change', async (e) => {
    const packId = e.target.value;
    if (!packId) return;
    await loadPack(packId);
    enableStart();
  });

  els.startGame.addEventListener('click', () => {
    if (!state.user || !state.pack) return;
    startRun();
  });
}

function restoreUser() {
  const saved = localStorage.getItem(STORAGE_USER);
  if (saved) {
    state.user = saved;
    els.playerName.value = saved;
    syncStatus();
  }
}

async function loadScenarioIndex() {
  try {
    const res = await fetch('scenarios/index.json');
    const data = await res.json();
    const options = data.scenarios || [];
    els.scenarioSelect.innerHTML = options.map(opt => `<option value="${opt.id}">${opt.name}</option>`).join('');
    state.packMeta = options.reduce((acc, item) => { acc[item.id] = item; return acc; }, {});
    if (options.length) {
      els.scenarioSelect.value = options[0].id;
      await loadPack(options[0].id);
      enableStart();
    }
  } catch (err) {
    console.error('Failed to load scenario index', err);
    els.scenarioSelect.innerHTML = '<option value="">No scenarios found</option>';
  }
}

async function loadPack(packId) {
  try {
    const [scenariosRes, choicesRes] = await Promise.all([
      fetch(`scenarios/${packId}/scenarios.json`),
      fetch(`scenarios/${packId}/choices.json`)
    ]);
    const scenarios = await scenariosRes.json();
    const choicesArr = await choicesRes.json();
    state.pack = { id: packId, name: state.packMeta[packId]?.name || packId };
    state.scenarios = scenarios;
    state.choices = choicesArr.reduce((acc, c) => { acc[c.id] = c; return acc; }, {});
    syncStatus();
    logMessage(`Loaded pack: ${state.pack.name}`);
  } catch (err) {
    console.error('Failed to load pack', err);
    logMessage('Could not load that scenario pack.');
  }
}

function startRun() {
  state.turn = 0;
  state.score = 0;
  state.log = [];
  els.log.innerHTML = '';
  nextScenario();
  syncStatus();
}

function nextScenario() {
  if (!state.scenarios.length) {
    logMessage('No scenarios in this pack.');
    return;
  }

  if (state.turn >= state.maxTurns) {
    endRun();
    return;
  }

  const scenario = randomItem(state.scenarios);
  state.turn += 1;
  state.currentScenario = scenario;
  renderScenario(scenario);
  syncStatus();
}

function renderScenario(scenario) {
  els.scenarioId.textContent = scenario.id;
  els.scenarioTitle.textContent = scenario.title;
  els.scenarioPrompt.textContent = scenario.prompt;
  els.choices.innerHTML = '';

  scenario.choices.forEach(id => {
    const choice = state.choices[id];
    if (!choice) return;
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerHTML = `<strong>${choice.label}</strong><br/><span class="muted">${choice.result}</span>`;
    btn.addEventListener('click', () => handleChoice(choice));
    els.choices.appendChild(btn);
  });
}

function handleChoice(choice) {
  state.score += Number(choice.delta) || 0;
  logMessage(`<strong>Turn ${state.turn}</strong>: ${choice.label} — ${choice.result} (${choice.delta >= 0 ? '+' : ''}${choice.delta} pts)`);
  syncStatus();
  if (state.turn >= state.maxTurns) {
    endRun();
  } else {
    nextScenario();
  }
}

function endRun() {
  logMessage(`<strong>Run complete</strong>. Final score: ${state.score}`);
  persistScore();
  renderLeaderboard();
}

function syncStatus() {
  els.statusPlayer.textContent = state.user || '—';
  els.statusPack.textContent = state.pack?.name || '—';
  els.statusTurn.textContent = `${Math.min(state.turn, state.maxTurns)} / ${state.maxTurns}`;
  els.statusScore.textContent = state.score;
  enableStart();
}

function enableStart() {
  const ready = Boolean(state.user && state.pack);
  els.startGame.disabled = !ready;
}

function logMessage(html) {
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = html;
  els.log.prepend(div);
}

function persistScore() {
  if (!state.user || !state.pack) return;
  const data = JSON.parse(localStorage.getItem(STORAGE_LEADERBOARD) || '{}');
  const packScores = data[state.pack.id] || [];
  packScores.push({ user: state.user, score: state.score, ts: Date.now() });
  packScores.sort((a, b) => b.score - a.score || a.ts - b.ts);
  data[state.pack.id] = packScores.slice(0, 10);
  localStorage.setItem(STORAGE_LEADERBOARD, JSON.stringify(data));
}

function renderLeaderboard() {
  const data = JSON.parse(localStorage.getItem(STORAGE_LEADERBOARD) || '{}');
  els.leaderboard.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'table-row header';
  header.innerHTML = '<div>Pack</div><div>Player</div><div>Score</div>';
  els.leaderboard.appendChild(header);

  const rows = [];
  Object.entries(data).forEach(([packId, entries]) => {
    entries.forEach(item => rows.push({ packId, ...item }));
  });
  rows.sort((a, b) => b.score - a.score || a.ts - b.ts);
  rows.slice(0, 9).forEach(item => {
    const row = document.createElement('div');
    row.className = 'table-row';
    const packName = state.packMeta[item.packId]?.name || item.packId;
    row.innerHTML = `<div>${packName}</div><div>${item.user}</div><div>${item.score}</div>`;
    els.leaderboard.appendChild(row);
  });

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'table-row';
    empty.innerHTML = '<div>—</div><div>No scores yet</div><div>—</div>';
    els.leaderboard.appendChild(empty);
  }
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
