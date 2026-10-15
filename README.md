<p align="center"><img src="assets/noto-logo.svg" alt="Noto" width="210" /></p>

<p align="center"><strong>Ouvrez. Consultez. Modifiez, si besoin.</strong></p>

<p align="center">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2B-7772d8?logo=windows&logoColor=white" />
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" />
  <img alt="Licence MIT" src="https://img.shields.io/badge/Licence-MIT-6b9c85" />
</p>

<p align="center">
  <a href="https://github.com/Louxos/Noto/actions/workflows/ci.yml"><img alt="Vérifications" src="https://github.com/Louxos/Noto/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/Louxos/Noto/actions/workflows/security.yml"><img alt="Sécurité" src="https://github.com/Louxos/Noto/actions/workflows/security.yml/badge.svg" /></a>
  <a href="https://github.com/Louxos/Noto/actions/workflows/release.yml"><img alt="Installeurs Windows" src="https://github.com/Louxos/Noto/actions/workflows/release.yml/badge.svg" /></a>
</p>

**Noto** est un lecteur et un éditeur de fichiers local, développé avec React et Tauri 2. Pas de compte, de cloud ni de télémétrie : les documents restent sur votre appareil.

> **Installation Windows — état vérifié le 14 octobre 2026 :** la version stable **0.2.0** est publiée sur la page [Releases](https://github.com/Louxos/Noto/releases/latest) avec l’installeur NSIS `Noto_0.2.0_x64-setup.exe` et `SHA256SUMS.txt`. Chaque tag `vX.Y.Z` publie ces deux fichiers, accompagnés de notes de version rédigées en français ; les versions antérieures à la 0.2.0 diffusaient aussi un paquet MSI, qui n’est plus produit. L’installeur s’exécute sans droits administrateur et ne supprime jamais vos données locales, sauf si vous cochez explicitement la case dédiée à la désinstallation. L’artefact `noto-windows-installers` du workflow [Windows installers](https://github.com/Louxos/Noto/actions/workflows/release.yml) reste une archive temporaire de test (30 jours), pas une release. Authenticode n’est activé que si les secrets de certificat sont configurés ; sinon les installateurs restent non signés. Consultez le [guide d’installation](docs/installation.md).

## Fonctionnalités

- **Lecture :** Markdown, texte, nombreux formats de code/configuration, HTML sandboxé, CSV/TSV, PDF, images, présentations `.pptx`/`.odp`, documents `.docx`/`.odt`/`.rtf` et livres `.epub`.
- **Coloration syntaxique :** le code est coloré à la lecture **et pendant la frappe**, avec la palette GitHub de `highlight.js` (thèmes clair et sombre) et plus de trente langages, dont JSON avec commentaires (JSON5), Terraform/HCL, Solidity et Pkl. Les langages sans grammaire connue restent en texte simple, et la coloration s’efface au-delà de 200 000 caractères pour ne jamais ralentir la saisie.
- **Diaporamas :** navigation au clavier et par boutons, mode plein écran, extraction locale du texte et des images courants. Les animations, transitions et mises en page complexes ne sont pas fidèlement reproduites.
- **Bureautique et EPUB :** aperçu en lecture seule, reconstruit à partir du texte intégré ; Noto ne modifie pas le fichier source.
- **Édition :** Markdown, texte, code, HTML source et CSV ; sélection et curseur natifs, indentation, tabulation, recherche/remplacement, **Enregistrer sous** avec encodage/fins de ligne au choix et récupération locale de brouillons opt-in.
- **Navigation et organisation :** sommaire, signets, miniatures et reprise locale de page PDF ; images avec zoom/rotation ; onglets, fichiers récents et groupes locaux qui référencent les originaux.
- **Recherche locale par dossier :** choisissez un dossier, lancez la recherche à la demande et épinglez jusqu’à dix emplacements. Noto n’indexe rien en arrière-plan et ne transmet aucun contenu.
- **Comparaison :** diff côte à côte de deux fichiers texte/code ouverts ; les originaux ne sont jamais modifiés par la comparaison.
- **Prise en main :** écran de démarrage discret, puis guide affiché au premier lancement et accessible ensuite par Aide ; association de fichiers Windows gérée par l’utilisateur dans les paramètres du système.
- **Clic droit :** menu contextuel Noto dans l’espace de travail, les fichiers, les textes et les viewers ; actions de copie/recherche, classement, renommage ou déplacement (application de bureau), navigation et zoom selon le contenu.
- **Personnalisation :** thèmes, couleur d’accent, tailles de texte, numéros de lignes, retour à la ligne et commandes réorganisables.
- **Installateur Windows :** un seul installeur NSIS aux couleurs Noto (installation par utilisateur, sans élévation), en français, dont l’écran d’accueil reprend le logo, le nom et le slogan « Noto. Vos fichiers, vos outils, un seul espace. ». Le parcours propose la licence MIT, le dossier d’installation, le menu Démarrer, puis la création éventuelle d’un raccourci Bureau et le lancement de Noto. La désinstallation ne supprime aucun document personnel sans un choix explicite. Noto peut recevoir les fichiers ouverts depuis l’Explorateur, sans remplacer silencieusement les applications par défaut.
- **Explorateur Windows :** chaque famille de formats affiche **sa propre icône** (Markdown, texte, configuration, LaTeX, code, web, scripts, JSON, XML, YAML, tableaux, PDF, images, bureautique) au lieu du logo unique de Noto. Un fichier ouvert par double-clic s’affiche en **mode immersion**, et la désinstallation restaure vos associations d’origine.

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
git clone https://github.com/Louxos/Noto.git
cd Noto
npm ci
npm run dev
```

Vite écoute sur `http://localhost:1420`. Pour la fenêtre native Tauri, installez les prérequis Windows dans le [guide de build](docs/build-windows.md), puis lancez `npm run tauri:dev`.

```bash
npm run verify      # analyse statique + types + tests + construction
npm run coverage    # les mêmes tests avec rapport de couverture
npm run tauri:build # installeur NSIS (à compiler sous Windows)
```

## Documentation

- [Index de la documentation](docs/README.md)
- [Guide utilisateur et formats](docs/user-guide.md)
- [Icônes par type de fichier (Windows)](docs/icons-fichiers.md)
- [Installation Windows](docs/installation.md)
- [Architecture et sécurité](docs/architecture.md), [politique de sécurité](docs/security.md)
- [Ajouter un viewer](docs/adding-a-viewer.md), [construire sous Windows](docs/build-windows.md)
- [Contribuer](docs/contributing.md)
- [Feuille de route](ROADMAP.md) et [journal des changements](CHANGELOG.md)

Des exemples sont disponibles dans [`examples/`](examples/). Noto est distribué sous licence [MIT](LICENSE).
