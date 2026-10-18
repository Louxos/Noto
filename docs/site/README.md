# Site public de Noto

Site statique, sans dépendances ni compilation : `index.html`, `styles.css`, `site.js` et `assets/`.

## Publication GitHub Pages

État vérifié le 18 octobre 2026 via l’API GitHub Pages : `build_type=legacy`, source `arena/30f013fe-noto:/`, aucun domaine personnalisé (`cname=null`), HTTPS forcé. L’adresse actuelle `https://louxos.github.io/Noto/` publie la racine du dépôt, pas le site produit de `docs/site/`.

Pour publier ce site :

1. Fusionner les fichiers du site sur `main`.
2. Dans le dépôt GitHub, ouvrir **Settings → Pages** et choisir **GitHub Actions** comme source.
3. Lancer une fois **Actions → GitHub Pages → Run workflow** (ou attendre la prochaine poussée des fichiers du site sur `main`).
4. Vérifier l’adresse publiée et l’état HTTPS dans l’environnement `github-pages` et **Settings → Pages**. Aucun domaine personnalisé n’est actuellement configuré.

Le workflow `.github/workflows/pages.yml` publie uniquement le dossier `docs/site/`. Il est relancé automatiquement lorsqu’un fichier du site change sur `main`.

## Prévisualisation locale

Depuis la racine du dépôt :

```sh
python3 -m http.server 8000 --directory docs/site
```

Ouvrir ensuite `http://localhost:8000`. Aucun `npm install` n’est nécessaire pour le site.

## Dernière version et téléchargements

`site.js` interroge, à l’ouverture de la page, l’API publique GitHub Releases pour actualiser le numéro de version et les liens de l’installeur `.exe` et du fichier `SHA256SUMS.txt`. La requête porte uniquement sur les métadonnées de publication ; aucun nom de visiteur, document, chemin de fichier ni événement d’usage n’est transmis. En cas d’échec réseau ou de quota, les liens de secours mènent à la page officielle des Releases.

Le site ne charge ni police distante, ni analytique, ni contenu publicitaire. Les autres liens externes sont ouverts à la demande.

## Captures produit

Le dépôt ne contient pas encore de captures d’écran certifiées prises sur un poste Windows. Les présentations de l’interface sont donc **explicitement indiquées comme illustrations** ; la planche des icônes est une ressource réelle du projet (`icons-fichiers.png`). Pour remplacer les illustrations par des captures authentiques :

- capturer la version Windows publiée, en thème clair et sombre, à 1440 × 900 px ou plus ;
- recadrer les noms de fichiers et données personnelles de test ; utiliser uniquement des documents d’exemple ;
- exporter en WebP ou PNG optimisé, puis ajouter les textes alternatifs descriptifs ;
- mettre à jour les `figure` de `index.html` et vérifier sur mobile ainsi qu’avec `prefers-reduced-motion`.

Ne pas présenter de maquette ou d’illustration comme une capture réelle.
