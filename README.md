<p align="center">
  <img src="assets/noto-logo.svg" alt="Noto" width="220" />
</p>

<p align="center"><strong>Ouvrez. Consultez. Modifiez, si besoin.</strong></p>

<p align="center">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2B-7772d8?logo=windows&logoColor=white" />
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" />
  <img alt="Licence MIT" src="https://img.shields.io/badge/Licence-MIT-6b9c85" />
</p>

**Noto** est un lecteur de fichiers Windows minimaliste. Il ouvre rapidement les documents courants dans une interface lisible, avec une édition simple quand elle est utile. Les fichiers restent sur votre appareil : pas de compte, de cloud ni de télémétrie.

> Version de travail : **0.1.0**. Cette première version fournit l’interface fonctionnelle, les viewers principaux et la configuration de packaging Windows. Le binaire installable est produit par la CI Windows lors d’une release taguée.

## Fonctionnalités

- Markdown rendu avec tableaux, listes de tâches, liens et blocs de code ; mode édition avec aperçu en direct.
- Texte, code et configuration avec coloration syntaxique, numéros de lignes, recherche et modifications rapides.
- HTML affiché dans un aperçu isolé, sans scripts ni accès réseau.
- PDF avec navigation par page, zoom et ajustement à la largeur.
- Images PNG, JPEG, GIF animé, WebP, BMP, SVG, ICO et TIFF, avec zoom et rotation.
- CSV présenté en tableau, avec détection des séparateurs usuels et des champs entre guillemets.
- Onglets, glisser-déposer, fichiers récents locaux, thèmes clair et sombre, préférences et raccourcis clavier.
- Ouverture et sauvegarde locale. Dans le navigateur, l’accès aux fichiers est accordé par le sélecteur système ; lorsqu’il n’est pas disponible, l’enregistrement produit une copie téléchargée.

### Formats pris en charge

| Famille | Extensions |
| --- | --- |
| Markdown | `.md`, `.markdown` |
| Texte | `.txt`, `.text`, `.log` |
| Code et configuration | `.js`, `.ts`, `.jsx`, `.tsx`, `.html`, `.css`, `.scss`, `.json`, `.xml`, `.yaml`, `.yml`, `.py`, `.java`, `.c`, `.cpp`, `.h`, `.hpp`, `.cs`, `.php`, `.sql`, `.sh`, `.bat`, `.cmd`, `.ps1`, `.ini`, `.env`, `.toml`, `.conf`, `.editorconfig`, `.gitignore`, `.gitattributes` |
| Documents | `.pdf` |
| Images | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.svg`, `.ico`, `.tif`, `.tiff` |
| Données | `.csv` |

Un fichier texte d’extension inconnue peut être ouvert comme texte. Les autres formats inconnus produisent un message explicite sans modifier le fichier.

## Aperçu

Les captures de l’application seront ajoutées dans [`screenshots/`](screenshots/) après la génération d’un build Windows. Les indications et les vues à documenter sont listées dans [`screenshots/README.md`](screenshots/README.md). Pour le moment, lancez Noto en développement pour voir l’interface réelle.

## Installation et développement

### Prérequis

- Node.js 22 et npm
- Pour le shell Windows : Rust stable, les outils C++ de Visual Studio et le SDK Windows nécessaires à Tauri 2

```bash
git clone https://github.com/Louxos/Noto.git
cd Noto
npm ci
npm run dev
```

Le serveur de développement écoute sur `http://localhost:1420`. Dans un navigateur, les fichiers sont ouverts via le sélecteur système ou par glisser-déposer. Les navigateurs qui prennent en charge l’API File System permettent de réenregistrer le fichier sélectionné ; sinon Noto télécharge une copie.

Pour démarrer la fenêtre de bureau Tauri en développement :

```bash
npm run tauri:dev
```

### Vérifications et build

```bash
npm run check      # vérification TypeScript et tests unitaires
npm run build      # bundle web de production
npm run tauri:build # installateurs Windows NSIS (.exe) et MSI
```

Les associations de formats déclarées dans l’installateur rendent Noto disponible dans **Ouvrir avec** ; Noto ne remplace pas l’application par défaut choisie par l’utilisateur. L’installateur NSIS s’installe pour l’utilisateur courant et ajoute une entrée au menu Démarrer.

Les builds Windows sont également exécutés par GitHub Actions. Pour publier les installateurs, créez un tag `v*` après vérification ; le workflow `Release Windows` construit et attache les fichiers `.exe` et `.msi` à la release.

## Raccourcis

| Raccourci | Action |
| --- | --- |
| `Ctrl + O` | Ouvrir un ou plusieurs fichiers |
| `Ctrl + S` | Enregistrer |
| `Ctrl + Maj + S` | Enregistrer sous |
| `Ctrl + F` | Rechercher |
| `Ctrl + H` | Rechercher et remplacer |
| `Ctrl + W` | Fermer le fichier actif |
| `Ctrl + Z` / `Ctrl + Y` | Annuler / rétablir dans l’éditeur |

## Architecture

```text
src/
├── components/       # viewers PDF, CSV, image, Markdown et éditeur texte
├── lib/              # ouverture locale, types, CSV, préférences et sécurité HTML
├── App.tsx           # navigation, onglets, historique et actions
└── styles.css        # thèmes et interface
src-tauri/            # shell léger Tauri 2, permissions et packaging Windows
assets/               # identité Noto
.github/workflows/    # CI et build de release Windows
```

Des fichiers de démonstration sont disponibles dans [`examples/`](examples/) : Markdown, JSON compact, CSV à séparateur français et HTML dont le script reste inactif dans l’aperçu. Voir [`docs/architecture.md`](docs/architecture.md) pour les choix de conception et [`docs/adding-a-viewer.md`](docs/adding-a-viewer.md) pour ajouter un format.

## Sécurité et confidentialité

- L’ouverture est locale ; aucun contenu de fichier n’est téléversé.
- L’aperçu HTML est sandboxé, sans script, formulaire, plugin ni accès réseau. Le Markdown ne rend pas de HTML brut.
- Les permissions du shell sont limitées aux dialogues de sélection et à la lecture/écriture des fichiers choisis.
- Les fichiers récents et préférences sont stockés localement dans le profil de l’application.

Pour signaler une vulnérabilité, consultez [`SECURITY.md`](SECURITY.md).

## Contribuer

Les contributions sont les bienvenues. Lisez [`CONTRIBUTING.md`](CONTRIBUTING.md), exécutez `npm run check` et `npm run build` avant d’ouvrir une pull request.

## Licence

Noto est distribué sous licence [MIT](LICENSE).
