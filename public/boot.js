(() => {
  const screen = document.getElementById('noto-boot-screen');
  const slowMessage = document.getElementById('noto-boot-slow-message');
  const status = document.getElementById('noto-boot-status');
  if (!screen) return;

  /** Chaque message correspond à une étape réellement franchie. */
  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  let preferences = {};
  try {
    preferences = JSON.parse(localStorage.getItem('noto.preferences.v1') || '{}');
    if (preferences.theme === 'dark') document.documentElement.dataset.theme = 'dark';
    if (['violet', 'blue', 'mint', 'rose'].includes(preferences.accent)) {
      document.documentElement.dataset.accent = preferences.accent;
    }
    setStatus('Préférences locales chargées. Préparation de l’interface…');
  } catch {
    // L’écran reste utilisable si le stockage local est indisponible.
    setStatus('Préparation de l’interface…');
  }

  const startedAt = performance.now();
  let exiting = false;
  const minimumDuration = 420;
  const slowTimer = window.setTimeout(() => {
    if (!exiting && slowMessage) slowMessage.hidden = false;
  }, 1_800);
  const failureTimer = window.setTimeout(() => {
    if (exiting) return;
    setStatus('L’interface met plus de temps que prévu. Vos fichiers restent sur cet appareil ; si l’écran ne disparaît pas, relancez Noto.');
  }, 15_000);

  // Échec réel de chargement d’un fichier de l’interface : on l’annonce au lieu
  // de laisser un indicateur qui tourne indéfiniment.
  window.addEventListener('error', (event) => {
    if (exiting) return;
    const target = event.target;
    if (target && target !== window && (target.src || target.href)) {
      setStatus('Un fichier de l’interface n’a pas pu être chargé. Relancez Noto ; si le problème persiste, réinstallez l’application.');
    }
  }, true);

  window.addEventListener('noto:boot-ready', () => {
    if (exiting) return;
    exiting = true;
    window.clearTimeout(slowTimer);
    window.clearTimeout(failureTimer);
    setStatus('Interface prête.');
    window.setTimeout(() => {
      screen.classList.add('is-exiting');
      window.setTimeout(() => screen.remove(), 320);
    }, Math.max(0, minimumDuration - (performance.now() - startedAt)));
  }, { once: true });
})();
