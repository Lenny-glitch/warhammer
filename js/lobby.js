window.Lobby = (() => {
  let selectedFaction = 'guard';
  let unsubscribe = null;

  function init(gameIdParam) {
    if (gameIdParam) {
      initJoinFlow(gameIdParam);
    } else {
      renderCreateForm();
    }
  }

  // ---- Create flow ----

  function renderCreateForm() {
    setContent(`
      <div class="form-group">
        <label class="form-label" for="player-name">Your Name</label>
        <input class="form-input" id="player-name" type="text" placeholder="Enter callsign..." maxlength="24" autocomplete="off">
      </div>

      <div class="form-group">
        <span class="faction-select-label">Choose Your Faction</span>
        <div class="faction-cards">
          <div class="faction-card faction-guard selected" data-faction="guard" tabindex="0">
            <div class="faction-icon">⚙</div>
            <div class="faction-name">Astra Militarum</div>
            <div class="faction-title">Infantry Squad</div>
            <div class="faction-detail">10 Guardsmen + Sergeant<br>Lasgun · 5+ Save</div>
          </div>
          <div class="faction-card faction-eldar" data-faction="eldar" tabindex="0">
            <div class="faction-icon">✦</div>
            <div class="faction-name">Craftworld Eldar</div>
            <div class="faction-title">Guardian Defenders</div>
            <div class="faction-detail">10 Guardians<br>Shuriken Catapult · 4+ Save</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Game Size</label>
        <input type="range" id="game-size" min="0" max="2" step="1" value="1"
          style="width:100%;accent-color:var(--gold,#c9a84c);cursor:pointer;margin-bottom:0.3rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text-dim);margin-bottom:0.5rem;">
          <span>Combat Patrol</span><span>Incursion</span><span>Strike Force</span>
        </div>
        <div id="game-size-info" style="font-size:0.75rem;color:var(--text-dim);background:rgba(255,255,255,0.04);border-radius:4px;padding:0.45rem 0.6rem;line-height:1.7;"></div>
      </div>

      <button class="btn btn-primary btn-full" id="btn-create">Create Game</button>

      <label class="dev-toggle">
        <input type="checkbox" id="dev-mode-check">
        <span class="dev-toggle-label">Dev Mode — play both sides in one browser</span>
      </label>
    `);

    document.querySelectorAll('.faction-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.faction-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedFaction = card.dataset.faction;
      });
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') card.click(); });
    });

    document.getElementById('btn-create').addEventListener('click', handleCreate);
    document.getElementById('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') handleCreate(); });

    const SIZE_KEYS = ['combat-patrol', 'incursion', 'strike-force'];
    function updateSizeInfo(idx) {
      const key    = SIZE_KEYS[idx];
      const preset = window.GAME_PRESETS[key];
      document.getElementById('game-size-info').innerHTML =
        `<strong style="color:var(--text);">${['Combat Patrol','Incursion','Strike Force'][idx]}</strong> · `+
        `${preset.boardWidth}"×${preset.boardHeight}" board · `+
        `${preset.terrainBudget} pt terrain budget · `+
        `${preset.pointsLimit} pts`;
    }
    const slider = document.getElementById('game-size');
    slider.addEventListener('input', () => updateSizeInfo(+slider.value));
    updateSizeInfo(+slider.value);
  }

  async function handleCreate() {
    const name = document.getElementById('player-name').value.trim();
    if (!name) { document.getElementById('player-name').focus(); return; }

    const devMode  = document.getElementById('dev-mode-check').checked;
    const SIZE_KEYS = ['combat-patrol', 'incursion', 'strike-force'];
    const gameSize  = SIZE_KEYS[+(document.getElementById('game-size').value)] || 'incursion';
    const btn = document.getElementById('btn-create');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating...';

    try {
      const { gameId, faction } = await window.GameState.createGame(name, selectedFaction, devMode, gameSize);
      history.pushState(null, '', '?game=' + gameId);

      if (devMode) {
        window.App.startGame(gameId, faction);
      } else {
        renderWaitingScreen(gameId, faction, name);
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Create Game';
      showError(err.message);
    }
  }

  // ---- Waiting screen ----

  function renderWaitingScreen(gameId, faction, playerName) {
    const link = location.href;
    const factionLabel = faction === 'guard' ? 'Astra Militarum' : 'Craftworld Eldar';

    setContent(`
      <div style="text-align:center;margin-bottom:1.5rem;">
        <div class="waiting-icon">⧖</div>
        <span class="status-badge status-waiting">Waiting for opponent</span>
      </div>

      <div style="margin-bottom:1.5rem;">
        <div class="info-row">
          <span class="info-label">You</span>
          <span class="info-value">${escHtml(playerName)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Faction</span>
          <span class="info-value">${factionLabel}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Game ID</span>
          <span class="info-value" style="font-family:monospace;font-size:0.85rem;">${gameId}</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Share this link with your opponent</label>
        <div class="share-row">
          <input class="share-link-input" id="share-link" value="${escHtml(link)}" readonly>
          <button class="btn btn-gold" id="btn-copy">Copy</button>
        </div>
      </div>
    `);

    document.getElementById('share-link').addEventListener('click', function () { this.select(); });
    document.getElementById('btn-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(link).then(() => {
        const btn = document.getElementById('btn-copy');
        if (!btn) return;
        btn.textContent = 'Copied!';
        setTimeout(() => { if (document.getElementById('btn-copy')) btn.textContent = 'Copy'; }, 2000);
      });
    });

    if (unsubscribe) unsubscribe();
    unsubscribe = window.GameState.subscribeToGame(gameId, game => {
      if (!game) return;
      if (game.status === 'active') {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        window.App.startGame(gameId, faction);
      }
    });
  }

  // ---- Join flow ----

  async function initJoinFlow(gameId) {
    // Returning player? Route without showing a form.
    const myFaction = window.GameState.getLocalFaction(gameId);
    if (myFaction) {
      setContent('<div style="display:flex;justify-content:center;padding:2rem;"><span class="spinner"></span></div>');
      try {
        const snap = await window.db.ref('games/' + gameId).once('value');
        if (snap.exists()) {
          const game = snap.val();
          if (game.status === 'active' || game.status === 'complete') {
            window.App.startGame(gameId, myFaction);
            return;
          }
          if (game.status === 'waiting' && game.players[myFaction] && game.players[myFaction].joined) {
            renderWaitingScreen(gameId, myFaction, game.players[myFaction].name);
            return;
          }
        }
      } catch (_) {}
    }

    setContent('<div style="display:flex;justify-content:center;padding:2rem;"><span class="spinner"></span></div>');

    try {
      const snap = await window.db.ref('games/' + gameId).once('value');
      if (!snap.exists()) {
        setContent('<div class="notice notice-error">Game not found. Check the link and try again.</div>');
        return;
      }

      const game = snap.val();

      if (game.status === 'active') {
        setContent('<div class="notice notice-info">This game is already in progress.</div>');
        return;
      }
      if (game.status === 'complete') {
        setContent('<div class="notice notice-info">This game has ended.</div>');
        return;
      }

      renderJoinForm(gameId, game);
    } catch (err) {
      setContent(`<div class="notice notice-error">Error: ${escHtml(err.message)}</div>`);
    }
  }

  function renderJoinForm(gameId, game) {
    const takenFaction = game.players.guard.joined ? 'guard' : 'eldar';
    const openFaction  = takenFaction === 'guard' ? 'eldar' : 'guard';
    const takenName    = escHtml(game.players[takenFaction].name);
    const takenLabel   = takenFaction === 'guard' ? 'Astra Militarum' : 'Craftworld Eldar';
    const openLabel    = openFaction  === 'guard' ? 'Astra Militarum' : 'Craftworld Eldar';
    const openIcon     = openFaction  === 'guard' ? '⚙' : '✦';
    const openDetail   = openFaction  === 'guard'
      ? '10 Guardsmen + Sergeant<br>Lasgun · 5+ Save'
      : '10 Guardians<br>Shuriken Catapult · 4+ Save';
    const takenIcon    = takenFaction === 'guard' ? '⚙' : '✦';
    const takenTitle   = takenFaction === 'guard' ? 'Infantry Squad' : 'Guardian Defenders';
    const openTitle    = openFaction  === 'guard' ? 'Infantry Squad' : 'Guardian Defenders';

    setContent(`
      <div class="notice notice-info" style="margin-bottom:1.5rem;">
        <strong>${takenName}</strong> is playing <strong>${takenLabel}</strong>
      </div>

      <div class="form-group">
        <label class="form-label" for="player-name">Your Name</label>
        <input class="form-input" id="player-name" type="text" placeholder="Enter callsign..." maxlength="24" autocomplete="off">
      </div>

      <div class="form-group">
        <span class="faction-select-label">Your Faction (auto-assigned)</span>
        <div class="faction-cards">
          <div class="faction-card faction-${takenFaction} taken">
            <div class="faction-icon">${takenIcon}</div>
            <div class="faction-name">${takenLabel}</div>
            <div class="faction-title">${takenTitle}</div>
            <div class="faction-taken-badge">Taken by ${takenName}</div>
          </div>
          <div class="faction-card faction-${openFaction} selected">
            <div class="faction-icon">${openIcon}</div>
            <div class="faction-name">${openLabel}</div>
            <div class="faction-title">${openTitle}</div>
            <div class="faction-detail">${openDetail}</div>
          </div>
        </div>
      </div>

      <button class="btn btn-primary btn-full" id="btn-join">Join Game</button>
    `);

    document.getElementById('btn-join').addEventListener('click', () => handleJoin(gameId));
    document.getElementById('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') handleJoin(gameId); });
  }

  async function handleJoin(gameId) {
    const name = document.getElementById('player-name').value.trim();
    if (!name) { document.getElementById('player-name').focus(); return; }

    const btn = document.getElementById('btn-join');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Joining...';

    try {
      const { faction } = await window.GameState.joinGame(gameId, name);
      window.App.startGame(gameId, faction);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Join Game';
      showError(err.message);
    }
  }

  // ---- Helpers ----

  function setContent(html) {
    document.getElementById('lobby-content').innerHTML = html;
  }

  function showError(msg) {
    const existing = document.querySelector('.notice-error');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'notice notice-error';
    el.style.marginBottom = '1rem';
    el.textContent = msg;
    document.getElementById('lobby-content').prepend(el);
  }

  return { init };
})();
