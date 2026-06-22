window.App = {
  startGame(gameId, faction) {
    window.Game.init(gameId, faction);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const params  = new URLSearchParams(location.search);
  const gameId  = params.get('game');
  window.Lobby.init(gameId || null);
});
