<p align="center"><img src="assets/noto-logo.svg" alt="Noto" width="210" /></p>

<p align="center"><strong>Ouvrez. Consultez. Modifiez, si besoin.</strong></p>

<p align="center">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2B-7772d8?logo=windows&logoColor=white" />
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" />
  <img alt="Licence MIT" src="https://img.shields.io/badge/Licence-MIT-6b9c85" />
</p>

**Noto** est un lecteur et un éditeur de fichiers local, développé avec React et Tauri 2. Pas de compte, de cloud ni de télémétrie : les documents restent sur votre appareil.

> **Installation Windows — état vérifié le 12 octobre 2026 :** la page [Releases](https://github.com/Louxos/Noto/releases/latest) ne contient pas encore de version stable. C’est le canal recommandé pour les distributions : chaque tag `vX.Y.Z` publiera séparément l’installateur `.exe`, le `.msi` et `SHA256SUMS.txt`, avec des notes de version générées par GitHub. En attendant, le dernier build de test se télécharge depuis l’artefact `noto-windows-installers` de l’unique workflow [Windows installers](https://github.com/Louxos/Noto/actions/workflows/release.yml) ; cet artefact est une archive ZIP temporaire (30 jours), destinée aux tests, pas une release. Le workflow regroupe les vérifications et la construction Windows. Authenticode n’est activé que si les secrets de certificat sont configurés ; sinon les installateurs restent non signés. Consultez le [guide d’installation](docs/installation.md).

## Fonctionnalités

- **Lecture :** Markdown, texte, nombreux formats de code/configuration, HTML sandboxé, CSV/TSV, PDF, images, présentations `.pptx`/`.odp`, documents `.docx`/`.odt`/`.rtf` et livres `.epub`.
- **Diaporamas :** navigation au clavier et par boutons, mode plein écran, extraction locale du texte et des images courants. Les animations, transitions et mises en page complexes ne sont pas fidèlement reproduites.
- **Bureautique et EPUB :** aperçu en lecture seule, reconstruit à partir du texte intégré ; Noto ne modifie pas le fichier source.
- **Édition :** Markdown, texte, code, HTML source et CSV ; sélection et curseur natifs, indentation, tabulation, recherche/remplacement, **Enregistrer sous** avec encodage/fins de ligne au choix et récupération locale de brouillons opt-in.
- **Navigation et organisation :** sommaire, signets, miniatures et reprise locale de page PDF ; images avec zoom/rotation ; onglets, fichiers récents et groupes locaux qui référencent les originaux.
- **Recherche locale par dossier :** choisissez un dossier, lancez la recherche à la demande et épinglez jusqu’à dix emplacements. Noto n’indexe rien en arrière-plan et ne transmet aucun contenu.
- **Comparaison :** diff côte à côte de deux fichiers texte/code ouverts ; les originaux ne sont jamais modifiés par la comparaison.
- **Prise en main :** écran de démarrage discret, puis guide affiché au premier lancement et accessible ensuite par Aide ; association de fichiers Windows gérée par l’utilisateur dans les paramètres du système.
- **Clic droit :** menu contextuel Noto dans l’espace de travail, les fichiers, les textes et les viewers ; actions de copie/recherche, classement, renommage ou déplacement (application de bureau), navigation et zoom selon le contenu.
- **Personnalisation :** thèmes, couleur d’accent, tailles de texte, numéros de lignes, retour à la ligne et commandes réorganisables.
- **Installateur Windows :** NSIS et MSI aux couleurs Noto ; le parcours NSIS propose la licence, les dossiers d’installation/menu Démarrer, puis les options raccourci Bureau et lancement. Noto peut recevoir les fichiers ouverts depuis l’Explorateur, sans remplacer silencieusement les applications par défaut.

### Formats

| Famille | Formats reconnus |
| --- | --- |
| Markdown | `.md`, `.markdown`, `.mdown`, `.mkd` |
| Texte et documentation | `.txt`, `.text`, `.log`, `.diff`, `.patch`, `.tex`, `.rst`, `.adoc`, `.asciidoc`, licences et fichiers sans extension connus |
| Code et configuration | JavaScript/TypeScript, JSX, HTML/CSS, JSON, XML, YAML, TOML, Python, Java, C/C++, C#, PHP, SQL, shell/PowerShell, Rust, Go, Ruby, Swift, Kotlin, Vue, Svelte, Astro, R, Lua, Scala, Dart, Haskell, Elixir, Erlang, GraphQL, protobuf, Terraform, Docker/Make/CMake et formats apparentés |
| Tableaux | `.csv`, `.tsv` |
| PDF | `.pdf` |
| Images | PNG/APNG, JPEG, GIF, WebP, BMP, SVG, ICO, TIFF, AVIF |
| Présentations | `.pptx`, `.odp` (texte/images extraits ; rendu simplifié) |
| Documents | `.docx`, `.odt`, `.rtf` (texte extrait en lecture seule) |
| Livres numériques | `.epub` (chapitres et navigation, texte extrait) |

Les formats Office hérités `.ppt` et `.doc` ne sont pas annoncés comme pris en charge. Pour les archives bureautiques, Noto limite la taille et le volume décompressés et n’exécute jamais les éléments incorporés.

## Développement

Prérequis : Node.js 22 et npm. Pour lancer l’interface web :

```bash
git clone --branch arena/01a10cf9-noto https://github.com/Louxos/Noto.git
cd Noto
npm ci
npm run dev
```

Vite écoute sur `http://localhost:1420`. Pour la fenêtre native Tauri, installez les prérequis Windows dans le [guide de build](docs/build-windows.md), puis lancez `npm run tauri:dev`.

```bash
npm run check       # TypeScript + tests
npm run build       # bundle web
npm run tauri:build # installateurs Windows (à compiler sous Windows)
```

## Documentation

- [Index de la documentation](docs/README.md)
- [Guide utilisateur et formats](docs/user-guide.md)
- [Installation Windows](docs/installation.md)
- [Architecture et sécurité](docs/architecture.md), [politique de sécurité](docs/security.md)
- [Ajouter un viewer](docs/adding-a-viewer.md), [construire sous Windows](docs/build-windows.md)
- [Contribuer](docs/contributing.md)
- [Feuille de route](ROADMAP.md) et [journal des changements](CHANGELOG.md)

Des exemples sont disponibles dans [`examples/`](examples/). Noto est distribué sous licence [MIT](LICENSE).
