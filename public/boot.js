(() => {
  const screen = document.getElementById('noto-boot-screen');
  const slowMessage = document.getElementById('noto-boot-slow-message');
  if (!screen) return;

  try {
    const preferences = JSON.parse(localStorage.getItem('noto.preferences.v1') || '{}');
    if (preferences.theme === 'dark') document.documentElement.dataset.theme = 'dark';
    if (['violet', 'blue', 'mint', 'rose'].includes(preferences.accent)) {
      document.documentElement.dataset.accent = preferences.accent;
    }
  } catch {
    // The splash remains usable when local storage is disabled or unavailable.
  }

  const startedAt = performance.now();
  let exiting = false;
  const minimumDuration = 420;
  const slowTimer = window.setTimeout(() => {
    if (!exiting && slowMessage) slowMessage.hidden = false;
  }, 1_800);

  window.addEventListener('noto:boot-ready', () => {
    if (exiting) return;
    exiting = true;
    window.clearTimeout(slowTimer);
    window.setTimeout(() => {
      screen.classList.add('is-exiting');
      window.setTimeout(() => screen.remove(), 320);
    }, Math.max(0, minimumDuration - (performance.now() - startedAt)));
  }, { once: true });
})();
