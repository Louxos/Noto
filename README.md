<p align="center"><img src="assets/noto-logo.svg" alt="Noto" width="210" /></p>

<p align="center"><strong>Ouvrez. Consultez. Modifiez, si besoin.</strong></p>

<p align="center">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2B-7772d8?logo=windows&logoColor=white" />
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" />
  <img alt="Licence MIT" src="https://img.shields.io/badge/Licence-MIT-6b9c85" />
</p>

**Noto** est un lecteur et un éditeur de fichiers local, développé avec React et Tauri 2. Pas de compte, de cloud ni de télémétrie : les documents restent sur votre appareil.

> **Installation Windows — état vérifié le 7 octobre 2026 :** aucune release officielle n’est publiée sur la page [Releases](https://github.com/Louxos/Noto/releases). Pour un build de test, choisissez le workflow **Windows installers** (et non **CI**) et son artefact `noto-windows-installers` dans les [exécutions GitHub Actions](https://github.com/Louxos/Noto/actions/workflows/release.yml). Le workflow produit les installateurs aux couleurs Noto ; ils ne sont pas signés et les artefacts sont conservés 30 jours. Consultez le [guide d’installation](docs/installation.md) pour savoir quel fichier lancer.

## Fonctionnalités

- **Lecture :** Markdown, texte, nombreux formats de code/configuration, HTML sandboxé, CSV/TSV, PDF, images, présentations `.pptx`/`.odp`, documents `.docx`/`.odt`/`.rtf` et livres `.epub`.
- **Diaporamas :** navigation au clavier et par boutons, mode plein écran, extraction locale du texte et des images courants. Les animations, transitions et mises en page complexes ne sont pas fidèlement reproduites.
- **Bureautique et EPUB :** aperçu en lecture seule, reconstruit à partir du texte intégré ; Noto ne modifie pas le fichier source.
- **Édition :** Markdown, texte, code, HTML source et CSV ; sélection et curseur natifs, indentation, tabulation, recherche/remplacement, **Enregistrer sous** avec encodage/fins de ligne au choix et récupération locale de brouillons opt-in.
- **Navigation et organisation :** PDF avec flèches, images avec zoom/rotation, onglets multiples, fichiers récents et groupes locaux qui référencent les originaux.
- **Carnets locaux :** plusieurs dossiers de carnets, organisés en sections, pages et sous-pages ; édition riche ou Markdown, aperçu, liens vers des fichiers Noto et pièces jointes locales. Les suppressions demandent si les fichiers doivent être conservés.
- **Clic droit :** menus contextuels Noto dans l’espace de travail, les fichiers, les sections/pages, les textes et les viewers ; actions de copie/recherche, classement, renommage ou déplacement (application de bureau), navigation et zoom selon le contenu.
- **Personnalisation :** thèmes, couleur d’accent, tailles de texte, numéros de lignes, retour à la ligne et commandes réorganisables.
- **Installateur Windows :** NSIS et MSI aux couleurs Noto ; le parcours NSIS propose la licence, les dossiers d’installation/menu Démarrer, puis les options raccourci Bureau et lancement.

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
- [Carnets locaux](docs/notebooks.md)
- [Installation Windows](docs/installation.md)
- [Architecture et sécurité](docs/architecture.md), [politique de sécurité](docs/security.md)
- [Ajouter un viewer](docs/adding-a-viewer.md), [construire sous Windows](docs/build-windows.md)
- [Contribuer](docs/contributing.md)
- [Feuille de route](ROADMAP.md) et [journal des changements](CHANGELOG.md)

Des exemples sont disponibles dans [`examples/`](examples/). Noto est distribué sous licence [MIT](LICENSE).
