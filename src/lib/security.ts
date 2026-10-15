/**
 * Contenu HTML transposable dans la page d’impression de Noto.
 *
 * La fenêtre d’aperçu fonctionne dans une iframe isolée, sans script : cette
 * version-ci sert à l’impression, où le document est écrit dans une iframe du
 * même document. Tout ce qui exécute du code ou charge une ressource distante
 * est donc retiré, pas seulement neutralisé.
 */
export function sanitizeHtmlForPrint(source: string): { html: string; styles: string } {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  for (const node of parsed.querySelectorAll('script, object, embed, iframe, frame, frameSet, base, link, meta, form, input, button')) node.remove();
  // Les images distantes ne sont jamais chargées (Noto fonctionne hors ligne, et
  // l’aperçu applique la même règle) : les laisser produirait des cadres cassés.
  for (const node of parsed.querySelectorAll('img')) {
    const source = (node.getAttribute('src') ?? '').trim().toLowerCase();
    if (/^(https?:)?\/\//u.test(source)) node.remove();
  }
  for (const node of [...parsed.body.querySelectorAll('*'), ...parsed.head.querySelectorAll('*')]) {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on')) node.removeAttribute(attribute.name);
      else if ((name === 'href' || name === 'src' || name === 'action' || name === 'formaction' || name === 'data' || name === 'poster' || name === 'background') && value.startsWith('javascript:')) node.removeAttribute(attribute.name);
    }
  }
  const styles = [...parsed.querySelectorAll('style')].map((node) => node.textContent ?? '').join('\n');
  return { html: parsed.body.innerHTML, styles };
}

/**
 * HTML is rendered in an opaque-origin, scriptless iframe. The early CSP also
 * prevents network requests, forms, plugins and navigation from the preview.
 */
export function makeHtmlPreview(source: string): string {
  const policy = [
    "default-src 'none'",
    'img-src data: blob:',
    "style-src 'unsafe-inline' data:",
    'font-src data:',
    'media-src data: blob:',
    "connect-src 'none'",
    "script-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<meta http-equiv="Content-Security-Policy" content="${policy}">\n${source}`;
}
