window.Lobby = (() => {
  let selectedFaction = 'guard';
  let unsubscribe     = null;
  let previewDebounce = null;

  function init(gameIdParam) {
    const params    = new URLSearchParams(location.search);
    const rosterParam = params.get('roster') || '';
    if (gameIdParam) {
      initJoinFlow(gameIdParam);
    } else {
      renderCreateForm(rosterParam);
    }
  }

  // ---- Create flow ----

  function rosterPreviewHTML(roster, faction) {
    if (!roster) return '';
    const FACTION_MAP = window.RosterLoader.FACTION_MAP;
    const mismatch    = FACTION_MAP[faction] && roster.meta.factionId !== FACTION_MAP[faction];
    if (mismatch) {
      return `<div class="notice notice-error" style="margin-top:0.5rem;font-size:0.78rem;">
        Roster is <strong>${escHtml(roster.meta.factionName)}</strong> — select matching faction above.
      </div>`;
    }
    const units = (roster.units || []).map(u =>
      `<div style="font-size:0.77rem;color:var(--text-dim);padding:0.1rem 0;">
        · ${escHtml(u.unitName)}${u.modelCount > 1 ? ` ×${u.modelCount}` : ''}</div>`
    ).join('');
    return `<div style="background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:4px;padding:0.5rem 0.6rem;margin-top:0.5rem;">
      <div style="font-size:0.82rem;color:var(--text);font-weight:600;margin-bottom:0.2rem;">${escHtml(roster.meta.name)}</div>
      <div style="font-size:0.72rem;color:var(--gold-dim);margin-bottom:0.35rem;">${escHtml(roster.meta.factionName)} · ${roster.meta.pointsTotal}pts</div>
      ${units}
    </div>`;
  }

  function renderCreateForm(prefillRosterId) {
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
            <div class="faction-detail">Cadian 8th — Combat Patrol</div>
          </div>
          <div class="faction-card faction-eldar" data-faction="eldar" tabindex="0">
            <div class="faction-icon">✦</div>
            <div class="faction-name">Craftworld Eldar</div>
            <div class="faction-title">Guardian Defenders</div>
            <div class="faction-detail">Biel-Tan — Combat Patrol</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="roster-id">Roster ID</label>
        <input class="form-input" id="roster-id" type="text" placeholder="Paste your Firebase roster ID..."
          value="${escHtml(prefillRosterId || '')}" autocomplete="off" spellcheck="false" style="font-family:monospace;">
        <div id="roster-preview"></div>
      </div>

      <div id="dev-roster-group" class="form-group" style="display:none;">
        <label class="form-label" for="roster-id-dev">Opponent Roster ID (Dev)</label>
        <input class="form-input" id="roster-id-dev" type="text" placeholder="Opponent faction roster ID..."
          autocomplete="off" spellcheck="false" style="font-family:monospace;">
        <div id="roster-preview-dev"></div>
      </div>

      <div class="form-group">
        <label class="form-label">Game Size</label>
        <input type="range" id="game-size" min="0" max="2" step="1" value="0"
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
        // Re-validate roster preview on faction change
        triggerRosterPreview('roster-id', 'roster-preview', () => selectedFaction);
      });
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') card.click(); });
    });

    document.getElementById('btn-create').addEventListener('click', handleCreate);
    document.getElementById('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') handleCreate(); });

    // Roster ID live preview
    const rosterInput = document.getElementById('roster-id');
    rosterInput.addEventListener('input', () =>
      triggerRosterPreview('roster-id', 'roster-preview', () => selectedFaction)
    );
    if (rosterInput.value) triggerRosterPreview('roster-id', 'roster-preview', () => selectedFaction);

    const devCheck = document.getElementById('dev-mode-check');
    devCheck.addEventListener('change', () => {
      const devGroup = document.getElementById('dev-roster-group');
      if (devGroup) devGroup.style.display = devCheck.checked ? '' : 'none';
    });
    document.getElementById('roster-id-dev').addEventListener('input', () => {
      const otherFaction = selectedFaction === 'guard' ? 'eldar' : 'guard';
      triggerRosterPreview('roster-id-dev', 'roster-preview-dev', () => otherFaction);
    });

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
    const name     = document.getElementById('player-name').value.trim();
    const rosterId = document.getElementById('roster-id').value.trim();
    if (!name)     { document.getElementById('player-name').focus(); return; }
    if (!rosterId) { showError('Paste your Roster ID to continue.'); return; }

    const devMode    = document.getElementById('dev-mode-check').checked;
    const devRosterId = devMode ? (document.getElementById('roster-id-dev').value.trim()) : null;
    if (devMode && !devRosterId) { showError('Dev Mode requires an Opponent Roster ID.'); return; }

    const SIZE_KEYS = ['combat-patrol', 'incursion', 'strike-force'];
    const gameSize  = SIZE_KEYS[+(document.getElementById('game-size').value)] || 'combat-patrol';
    const btn = document.getElementById('btn-create');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating...';

    try {
      const { gameId, faction } = await window.GameState.createGame(name, selectedFaction, devMode, gameSize, rosterId, devRosterId);
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

      <div class="form-group">
        <label class="form-label" for="roster-id-join">Your Roster ID</label>
        <input class="form-input" id="roster-id-join" type="text" placeholder="Paste your Firebase roster ID..."
          autocomplete="off" spellcheck="false" style="font-family:monospace;">
        <div id="roster-preview-join"></div>
      </div>

      <button class="btn btn-primary btn-full" id="btn-join">Join Game</button>
    `);

    document.getElementById('roster-id-join').addEventListener('input', () =>
      triggerRosterPreview('roster-id-join', 'roster-preview-join', () => openFaction)
    );
    document.getElementById('btn-join').addEventListener('click', () => handleJoin(gameId));
    document.getElementById('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') handleJoin(gameId); });
  }

  async function handleJoin(gameId) {
    const name     = document.getElementById('player-name').value.trim();
    const rosterId = document.getElementById('roster-id-join').value.trim();
    if (!name)     { document.getElementById('player-name').focus(); return; }
    if (!rosterId) { showError('Paste your Roster ID to continue.'); return; }

    const btn = document.getElementById('btn-join');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Joining...';

    try {
      const { faction } = await window.GameState.joinGame(gameId, name, rosterId);
      window.App.startGame(gameId, faction);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Join Game';
      showError(err.message);
    }
  }

  // ---- Helpers ----

  function triggerRosterPreview(inputId, previewId, getFaction) {
    clearTimeout(previewDebounce);
    const val = (document.getElementById(inputId) || {}).value || '';
    const previewEl = document.getElementById(previewId);
    if (!previewEl) return;
    if (!val.trim()) { previewEl.innerHTML = ''; return; }
    previewEl.innerHTML = '<div style="font-size:0.75rem;color:var(--text-dim);padding:0.3rem 0;">Loading roster…</div>';
    previewDebounce = setTimeout(async () => {
      const id = (document.getElementById(inputId) || {}).value.trim();
      if (!id) { previewEl.innerHTML = ''; return; }
      try {
        const roster = await window.RosterLoader.fetchRoster(id);
        if (document.getElementById(previewId)) {
          document.getElementById(previewId).innerHTML = rosterPreviewHTML(roster, getFaction());
        }
      } catch (err) {
        if (document.getElementById(previewId)) {
          document.getElementById(previewId).innerHTML =
            `<div class="notice notice-error" style="margin-top:0.5rem;font-size:0.78rem;">${escHtml(err.message)}</div>`;
        }
      }
    }, 500);
  }

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
