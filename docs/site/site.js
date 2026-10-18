/* global document, window, IntersectionObserver, fetch */
(() => {
  const header = document.querySelector('.site-header');
  const progress = document.getElementById('scroll-progress');
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('main-nav');

  const updateScrollUI = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (header) header.classList.toggle('is-scrolled', scrollTop > 12);
    if (progress) progress.style.transform = `scaleX(${scrollable > 0 ? Math.min(1, scrollTop / scrollable) : 0})`;
  };
  updateScrollUI();
  window.addEventListener('scroll', updateScrollUI, { passive: true });
  window.addEventListener('resize', updateScrollUI, { passive: true });

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      navToggle.setAttribute('aria-label', expanded ? 'Ouvrir le menu' : 'Fermer le menu');
      nav.classList.toggle('open', !expanded);
    });
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Ouvrir le menu');
      nav.classList.remove('open');
    }));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('open')) {
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Ouvrir le menu');
        nav.classList.remove('open');
        navToggle.focus();
      }
    });
  }

  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  // Metadata public only: this refreshes the version and download URLs. No
  // browser identifier, document data, path or analytics event is sent.
  async function hydrateLatestRelease() {
    try {
      const response = await fetch('https://api.github.com/repos/Louxos/Noto/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const release = await response.json();
      if (!release || !release.tag_name || release.draft || release.prerelease) return;
      const version = String(release.tag_name).replace(/^v/i, '');
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const installer = assets.find((asset) => /Noto_.*_x64-setup\.exe$/i.test(asset.name));
      const checksums = assets.find((asset) => asset.name === 'SHA256SUMS.txt');
      document.querySelectorAll('[data-version]').forEach((element) => { element.textContent = version; });
      if (release.published_at) {
        const date = new Date(release.published_at);
        if (!Number.isNaN(date.valueOf())) {
          const dateText = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
          const versionDate = document.getElementById('version-date');
          if (versionDate) versionDate.textContent = `Publiée le ${dateText}`;
        }
      }
      const releasePage = release.html_url || 'https://github.com/Louxos/Noto/releases/latest';
      document.querySelectorAll('.download-link').forEach((link) => {
        link.href = installer?.browser_download_url || releasePage;
        link.setAttribute('aria-label', `Télécharger Noto ${version} pour Windows 64 bits`);
      });
      const checksumLink = document.getElementById('checksum-link');
      if (checksumLink) checksumLink.href = checksums?.browser_download_url || releasePage;
      const navDownload = document.getElementById('nav-download');
      if (navDownload) navDownload.href = installer?.browser_download_url || releasePage;
    } catch {
      // Keep the verified, versioned fallback links. The page remains usable offline.
    }
  }
  void hydrateLatestRelease();
})();
