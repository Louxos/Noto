# Site public de Noto

Site statique autonome, sans framework ni dépendance externe : `index.html`, `styles.css`, `premium.css`, `site.js`, `assets/`, `robots.txt` et `sitemap.xml`. Aucun service analytique, police distante, publicité ni contenu tiers n’est chargé.

## Dossier à publier

La source du site est **`docs/site/`**. Son contenu devient la racine publique de GitHub Pages ; il ne faut pas remplacer le `index.html` à la racine du dépôt, qui est le point d’entrée Vite de l’application de bureau.

Le dépôt prend en charge les deux modes :

- **GitHub Actions (recommandé)** : `.github/workflows/pages.yml` déploie directement `docs/site/` comme racine du site.
- **Source de branche `/docs`** : `docs/index.html` est une copie générée de la page principale, avec les chemins d’assets adaptés à `docs/site/`. Elle permet à l’URL Pages de servir la même page depuis la configuration classique.

La copie de compatibilité est maintenue par `scripts/sync-pages-root.mjs` : après une modification de `docs/site/index.html`, lancer `npm run pages:sync`. `npm run verify` vérifie automatiquement qu’elle reste synchronisée. Ne pas modifier `docs/index.html` à la main.

Le contrôle GitHub Pages du 20 octobre 2026 indiquait une source classique (`build_type=legacy`), branche `arena/30f013fe-noto`, dossier `/docs`, sans domaine personnalisé, HTTPS forcé. Pour utiliser le workflow Actions, ouvrir **Settings → Pages**, choisir **GitHub Actions** comme source, puis lancer le workflow **GitHub Pages** ou pousser les changements sur `main`. L’URL du projet est `https://louxos.github.io/Noto/`.

> Le chemin local `/root` dépend du poste depuis lequel vous publiez. Le dépôt peut être cloné dans `/root`, mais la source publique reste `docs/site/` ; les fichiers `docs/index.html` et `docs/site/` assurent la compatibilité avec la configuration Pages existante.

## Prévisualisation locale

Depuis la racine du dépôt (également si le clone se trouve dans `/root`) :

```sh
python3 -m http.server 8000 --bind 0.0.0.0 --directory docs/site
```

Ouvrir `http://localhost:8000`. Aucun `npm install` n’est nécessaire pour prévisualiser le site. Pour régénérer l’entrée Pages classique : `npm run pages:sync`.

## Dernière version et téléchargements

`site.js` interroge, à l’ouverture de la page, l’API publique GitHub Releases pour actualiser la version, la date et les liens de l’installeur `.exe` et du fichier `SHA256SUMS.txt`. Cette requête ne porte que sur les métadonnées de publication ; aucun identifiant de visiteur, document, chemin de fichier ni événement d’usage n’est transmis. En cas d’échec réseau ou de quota, la page conserve ses liens de secours vers la release officielle.

## Captures produit

Le dépôt ne contient pas encore de captures d’écran certifiées prises sur un poste Windows. Les présentations de l’interface sont donc **explicitement indiquées comme illustrations** ; la planche des icônes est une ressource réelle du projet (`docs/site/assets/icons-fichiers.png`). Ne pas présenter de maquette comme une capture réelle. Pour la remplacer ultérieurement :

- capturer la version Windows publiée, en thème clair et sombre, à 1440 × 900 px ou plus ;
- utiliser des documents d’exemple et recadrer toute donnée personnelle ;
- exporter en WebP ou PNG optimisé, renseigner un texte alternatif descriptif ;
- vérifier le rendu mobile et le paramètre `prefers-reduced-motion`.
