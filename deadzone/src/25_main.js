// 25_main.js — boot (SPEC §26): window.DZ first, then the Game inside try/catch; global error handlers → #errbar.
// The only file with top-level side effects.

(function dzBoot() {
  const showErr = (msg) => {
    try {
      const bar = document.getElementById('errbar');
      if (!bar) return;
      bar.hidden = false;
      bar.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = 'Fehler: ' + String(msg).slice(0, 300);
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = '✕'; b.dataset.action = 'close-error';
      b.addEventListener('click', () => { bar.hidden = true; });
      bar.appendChild(span); bar.appendChild(b);
    } catch (e) { /* ignore */ }
  };
  window.addEventListener('error', (e) => {
    const msg = e && e.message ? e.message : String(e);
    Log.error('Unhandled error: ' + msg);
    showErr(msg);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e && e.reason ? (e.reason.message || String(e.reason)) : 'Promise abgelehnt';
    Log.error('Unhandled rejection: ' + msg);
    showErr(msg);
  });
  const start = () => {
    window.DZ = { version: GAME_VERSION, errors: Log.errors, log: Log };
    try {
      const game = new Game(document.getElementById('game'));
      game.init();
      Object.assign(window.DZ, game.debugApi());
    } catch (e) {
      window.DZ.bootError = String(e && e.stack ? e.stack : e);
      Log.error('Boot failed: ' + window.DZ.bootError);
      showErr(e && e.message ? e.message : e);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
