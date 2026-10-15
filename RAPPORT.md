# Rapport d’exécution — évolution de Noto en suite documentaire

Date : 15 octobre 2026 · Branche : `arena/30f013fe-noto` · Dépôt : `Louxos/Noto`

Ce rapport décrit **ce qui fonctionne réellement**, ce qui est partiel et ce qui reste à faire. Aucune fonctionnalité n’est annoncée comme terminée sans interface, traitement réel, gestion d’erreur, résultat exploitable et test.

## 1. Ce qui est implémenté et vérifié

### Moteurs de traitement (`src/lib/`)

| Domaine | Contenu | Fichier |
| --- | --- | --- |
| Registre d’opérations | 55 opérations déclarées une seule fois, avec paramètres, limites honnêtes, nature du travail (native / calque / reconstruction / mesure) et détection de capacités par format | `operations/index.ts`, `operations/*.ts` |
| PDF — pages | Fusion, découpe (plages/segments), extraction, suppression, rotation, réordonnancement, duplication, insertion, imposition 2/4/6/9 | `pdf/pdfWrite.ts`, `operations/pdfOperations.ts` |
| PDF — contenu | Filigrane, en-tête/pied, numérotation, signature d’image, métadonnées (lecture/écriture/suppression), formulaires (liste + remplissage) | idem |
| PDF — conversion | Vers images, texte, Markdown, Word, HTML, extraction des images ; images vers PDF | `pdf/pdfImages.ts`, `data/docx.ts` |
| PDF — sécurité | Ouverture de documents protégés (mot de passe), analyse (pages, polices, texte, pages numérisées), comparaison visuelle, **caviardage destructif avec vérification après écriture** | `pdf/pdfEngine.ts`, `pdf/pdfRaster.ts` |
| PDF — compression | Six modes annoncés, avec tailles mesurées avant/après | `pdf/pdfWrite.ts` |
| Images | Conversion, optimisation, édition (rotation, recadrage, couleur, bordure, filigrane), planches-contacts, collages, tuiles, variantes, métadonnées (lecture + suppression), comparaison perceptuelle | `image/imageEngine.ts`, `image/imageMetadata.ts` |
| OCR et scans | OCR d’images et de PDF, PDF interrogeable (couche de texte invisible), nettoyage de scan (redressement estimé, contraste, marges, débruitage), assemblage de scans | `ocr/ocrEngine.ts`, `pdf/pdfSearchable.ts`, `image/scanCleanup.ts` |
| Texte, tableaux, bureautique | Texte/Markdown vers PDF, Word, HTML ; CSV/TSV vers XLSX, PDF, Markdown ; XLSX vers CSV ; DOCX/ODT/RTF/PPTX/ODP/EPUB vers PDF reconstruit ou texte | `documents/pdfRender.ts`, `documents/officeImport.ts`, `data/xlsx.ts` |
| Archives | Création de ZIP avec noms uniques, extraction protégée contre les chemins dangereux (`..`, absolus, lecteurs) et bornes de taille | `archiveWriter.ts` |
| Exécution | Runner commun (progression réelle, annulation coopérative, erreurs par fichier), écriture vérifiée par relecture de taille, destinations dossier/téléchargements | `jobs/runner.ts`, `jobs/output.ts` |
| Analyse et suivi | Doublons exacts par SHA-256, rapprochement prudent par nom (« ressemblance », jamais « identique »), renommage en série, filtres/tri, rapports Markdown, historique local sans contenu de document | `jobs/analysis.ts`, `reports.ts`, `history.ts` |

### Interface

- **Atelier** (`src/studio/`) accessible depuis la barre latérale, le menu **Affichage** (Atelier, Atelier PDF, Atelier images, OCR et nettoyage de scans, Conversion de documents), la **palette de commandes** et le **menu contextuel d’un fichier** (« Ouvrir dans l’atelier »).
- Trois colonnes : outils réellement applicables aux fichiers présents, fichiers + réglages (avancés masqués par défaut) + nature du travail et limites, traitement (progression, annulation, détail par fichier, mesures avant/après, avertissements, rapport, confidentialité, historique).
- **Panneau Modèles OCR** : langue, taille estimée, origine exacte et licence affichées avant tout téléchargement ; accord explicite obligatoire, révocable.
- **Barre supérieure adaptative** : les zones fixes (menus, actions) ne peuvent plus être comprimées sous leur largeur naturelle, donc **plus aucun chevauchement d’icônes**. Quand la place manque, un `ResizeObserver` mesure la mise en page réelle et réduit l’affichage par étapes — libellés remplacés par les icônes (infobulle et libellé accessible conservés), puis menus regroupés dans un bouton **Tous les menus** où chaque commande et son raccourci restent disponibles. Le retour en arrière demande une marge réelle, ce qui évite tout clignotement.
- **Plein écran** : `F11`, bouton en haut à droite, menu **Affichage** et palette. Niveau « fenêtre » (`setFullscreen` Tauri, permissions `core:window:allow-set-fullscreen` et `allow-is-fullscreen` ajoutées ; API plein écran du document dans un navigateur). L’état est relu du système (`isFullscreen`, `fullscreenchange`, retour de focus) ; la commande n’apparaît pas quand l’environnement ne la propose pas, et un refus affiche une erreur explicite.
- **Mode immersion** : `Ctrl+Maj+F` retire barre latérale, menus, onglets et sous-titre, laisse une sortie visible et répond à `Échap`.
- **Ouverture depuis l’Explorateur → immersion automatique** : quand Windows lance Noto avec un fichier (`startup_paths`) ou lui transmet un fichier alors qu’il tourne (événement `noto-open-files` de l’instance unique), l’immersion s’active une fois par lancement et un message explique comment en sortir. Le réglage **Ouvrir en mode immersion depuis Windows** (activé par défaut, dans *Paramètres → Windows & associations*) rend le comportement classique ; un fichier choisi dans Noto ne change jamais l’affichage (`src/lib/launchMode.ts`).
- **Coloration syntaxique dans l’éditeur** : le texte est coloré pendant la frappe. Le `textarea` natif reste au-dessus (curseur, sélection et clic inchangés) et son texte devient transparent ; une couche `<pre>` colorée, en `aria-hidden`, se synchronise au défilement. La coloration renonce d’elle-même au-delà de 200 000 caractères ou 20 000 lignes (`useDeferredValue` évite que la frappe attende le calcul).
- **Coloration : palette et langages** : thème officiel **GitHub** de `highlight.js` et sa variante sombre, posés en variables CSS communes à la lecture et à l’édition. 30 langages enregistrés (dont Rust, Scala, Lua, Elixir, Erlang, Haskell, Elm, Clojure, F#, Protobuf, GraphQL, Less, LaTeX, AsciiDoc, diff) plus deux grammaires écrites ici (JSON avec commentaires et JSON5 ; HCL/Terraform), Solidity et Pkl.

### Application et installeur

- **Slogan** « Noto. Vos fichiers, vos outils, un seul espace. » présent sur l’écran de démarrage (avec étapes réelles : préférences chargées → interface prête) et sur les visuels de l’installeur (panneau latéral : slogan complet ; bandeau : slogan sur deux lignes, jamais tronqué).
- **Commande Tauri `reveal_path`** ajoutée pour ouvrir l’emplacement d’un fichier produit.
- **Installeur** : NSIS uniquement (`bundle.targets: ["nsis"]`), en français, `currentUser` (sans élévation), compression LZMA, visuels NSIS, crochets `installerHooks` qui vérifient réellement l’installation et confirment avant désinstallation, sans aucun dialogue en mode silencieux. Le gabarit NSIS de Tauri 2.12.3 place le panneau latéral sur la page d’accueil et la page finale (`MUI_WELCOMEFINISHPAGE_BITMAP`) et le bandeau sur les autres pages (`MUI_HEADERIMAGE_BITMAP`), et insère les quatre crochets déclarés (`!ifmacrodef` / `!insertmacro`) : les visuels du logo, du nom et du slogan apparaissent donc bien sur l’assistant, même si leur rendu final ne s’observe que sous Windows.
- **Icônes par type de fichier dans l’Explorateur** : 21 classes de fichiers (au lieu de 14) couvrent 126 extensions, chacune avec son icône — Markdown, texte, comparaison, configuration, LaTeX, code, web, scripts, JSON, XML, YAML, CSV, TSV, PDF, images, Word, OpenDocument, RTF, PowerPoint, ODP, EPUB. Les 21 `.ico` (7 tailles de 16 à 256 px, DIB pour les petites, PNG à partir de 48 px) sont produits par `src-tauri/icons/filetypes/generate_filetype_icons.py`, qui n’utilise que la bibliothèque standard de Python, ne reprend aucune ressource tierce et relit chaque fichier écrit. `bundle.resources` les copie dans `$INSTDIR\filetypes`, et le crochet NSIS `NOTO_APPLY_FILE_TYPE_ICONS` écrit la table classe → icône dans `DefaultIcon` après la création des associations, puis notifie l’Explorateur (`SHChangeNotify`). Le gabarit NSIS de Tauri écrivant `Noto.exe,0` pour toutes les classes, le champ `icon` de `fileAssociations` (lu par le seul gabarit MSI, retiré) n’aurait rien changé : c’est pourquoi tout passe par le crochet.
- **Associations reprises à l’installation** : 33 extensions changent de classe ; `NOTO_FLATTEN_BACKUP` remonte la chaîne `<classe>_backup` de `FileAssociation.nsh` pour que la désinstallation rende l’application d’origine plutôt qu’une classe Noto supprimée. L’ancienne classe `Document HTML` n’est supprimée que si sa commande d’ouverture pointe vers cette installation ; aucun autre programme n’est touché. Un test de dérive (`src/lib/installerIcons.test.ts`) confronte `tauri.conf.json`, les `.ico` et le crochet NSIS.
- **MSI supprimé** partout : configuration, assets WiX, générateur d’images, tests de fumée, signature, empreintes, artefacts et fichiers publiés de la CI. Détail complet dans [`docs/inventaire-et-migration.md`](docs/inventaire-et-migration.md).

### Dépôt et vérifications continues

- **Analyse statique ESLint** (`npm run lint`) en configuration « flat » : erreurs réelles uniquement (`no-explicit-any` interdit, dépendances de hooks, variables inutilisées, promesses), aucune règle de style. Le dépôt est propre : 0 erreur, 0 avertissement.
- **Couverture** (`npm run coverage`, `@vitest/coverage-v8`) et commande unique **`npm run verify`** (ESLint + types + tests + construction).
- **Workflow Checks** : lint, types, tests, couverture et construction sur chaque poussée et chaque pull request ; rapport de couverture conservé 7 jours.
- **Workflow Security** : analyse CodeQL (JavaScript/TypeScript) et `npm audit --audit-level=high`.
- **Dependabot** : npm, Cargo et GitHub Actions, propositions groupées, hebdomadaires ou mensuelles.
- **Vie du dépôt** : `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), modèles d’issue (bug, idée) et de pull request, `CODEOWNERS`, `.editorconfig`, `.gitattributes` (binaires et fins de ligne), `.nvmrc`, convention des notes de version rédigées.
- **Métadonnées de `package.json`** : description, licence MIT, dépôt, signaux d’anomalie, mots-clés, Node requis.

### Documentation mise à jour

`README.md` (badges de vérification), `CHANGELOG.md` (section « Non publié »), `INSTALLATION.md`, `docs/build-windows.md`, `docs/installation.md`, `docs/atelier.md`, `docs/inventaire-et-migration.md`, `docs/tests.md` (nouveau : ce qui est vérifié, comment, et ce qui ne peut l’être que sous Windows), `docs/user-guide.md` (plein écran, immersion, icônes par type, coloration), `docs/icons-fichiers.md` (nouveau : fonctionnement des icônes, table des 21 classes, limites, régénération), `docs/assets/icons-fichiers.png` (aperçu des 21 icônes), `docs/contributing.md`, `docs/README.md`, `ROADMAP.md`, `src-tauri/windows/installer/README.md`.

## 2. Commandes exécutées et résultats

| Commande | Résultat |
| --- | --- |
| `npm run check` (`tsc -b` + `vitest run`) | ✅ **47 fichiers de tests, 222 tests réussis** |
| `npm run lint` (ESLint) | ✅ **0 erreur, 0 avertissement** sur tout le dépôt |
| `npm run coverage` | ✅ rapport produit dans `coverage/` — couverture des lignes de `src/` : **34,07 %** (concentrée sur les moteurs ; voir §5) |
| `npm run verify` | ✅ les trois vérifications enchaînées, terminées sans échec |
| CI — workflow **Windows installers**, exécution `38745773040` (commit `a729a1c`) | ❌ **échec réel, puis corrigé** : le test « divise un PDF en une page par fichier » dépassait le délai par défaut de 5 s sur un exécuteur Windows. Le rapporteur `github-actions` ajouté au workflow a permis de lire l’annotation exacte (`Error: Test timed out in 5000ms`) malgré un journal inaccessible par l’API ; le délai des tests est désormais explicite (20 s) |
| `npm run build` | ✅ succès (bundle produit dans `dist/`) |
| `npx tsc -b` seul | ✅ aucune erreur (mode strict, `noUnusedLocals`, `verbatimModuleSyntax`) |
| `npm run check` après l’ajout des icônes, de l’immersion à l’ouverture et de la coloration | ✅ **47 fichiers, 222 tests** (dont 7 nouveaux fichiers/30 nouveaux tests) |
| `python3 src-tauri/icons/filetypes/generate_filetype_icons.py` | ✅ 21 `.ico` écrits puis relus (7 tailles, profondeur 32 bits, PNG à partir de 48 px) — environ 300 ko au total, aperçu `docs/assets/icons-fichiers.png` |
| Vitest ciblés | ✅ `operations/registry.test.ts` 7/7 · `pdfOperations.test.ts` 19/19 · `jobs/analysis.test.ts` 8/8 · `archiveWriter.test.ts` 7/7 · `image/scanCleanup.test.ts` 5/5 · `ocr/ocrConsent.test.ts` 7/7 · `ocr/ocrEngine.test.ts` 2/2 · `studio/*` 10/10 |
| CI — workflow **Checks**, exécution `38743804838` (commit `61a24ea`) | ✅ **succès** : ESLint, types, 192 tests, couverture, construction |
| CI Windows — runs `38562975186`, `38565457534` puis `38566768987` sur `arena/30f013fe-noto` | ✅ **succès** : `npm ci`, `npm run check`, `npm run build`, commandes Windows natives, **construction de l’installeur avec les crochets NSIS**, test de fumée (installation silencieuse, ouverture de fichier, associations, désinstallation), empreintes SHA-256, dépôt de l’artefact `noto-windows-installers` |
| CI Windows — run `38563865106` sur le tag `v0.2.0` | ✅ **tous les pas verts** : mêmes vérifications, puis sélection des notes rédigées (`generate_release_notes: false`), publication du release avec `Noto_0.2.0_x64-setup.exe` et `SHA256SUMS.txt` |
| `gh release view v0.2.0` / `v0.1.0` (API GitHub) | ✅ titres, dates et **tailles réelles des fichiers publiés** relevés (ex. `Noto_0.2.0_x64-setup.exe` = 3 442 384 octets) ; les pages de version ne contiennent plus aucun texte généré en anglais |
| `gh run download … --name noto-windows-installers` | ❌ **impossible dans cet environnement** (échec `EOF` du service d’artefacts, 3 tentatives) : l’installeur de la CI n’a **pas** pu être inspecté localement, seuls les pas de la CI et les métadonnées publiées font foi |
| `python3 src-tauri/windows/installer/render_assets.py` | ✅ visuels NSIS régénérés et contrôlés visuellement (slogan complet, sans troncature) |
| `npm run tauri:build` | ❌ **impossible dans cet environnement** : pas de Windows ni de `cargo`. La construction réelle est assurée par la CI (voir ci-dessus). |

Ces tests vérifient des artefacts réels : PDF relus avec pdf.js (octets, pages, texte), DOCX dézippés et inspectés (`word/document.xml`), XLSX relus cellule par cellule, archives ZIP réellement ouvertes, caviardage confirmé par recherche du texte dans le fichier produit, écritures relues et tailles comparées.

## 3. Dépendances ajoutées

| Dépendance | Version | Licence | Coût / réseau |
| --- | --- | --- | --- |
| `pdf-lib` | 1.17.1 | MIT | gratuit, 100 % local |
| `exifr` | 7.1.3 | MIT | gratuit, 100 % local |
| `tesseract.js` | 5.1.1 | Apache-2.0 | gratuit ; **modèles téléchargés une seule fois après accord explicite**, puis cache local |

Dépendances de développement ajoutées (jamais embarquées dans l’application) :

| Dépendance | Version | Licence | Usage |
| --- | --- | --- | --- |
| `eslint`, `@eslint/js`, `typescript-eslint` | 9.39.5 / 9.39.5 / 8.71.2 | MIT | analyse statique |
| `eslint-plugin-react-hooks` | 5.2.0 | MIT | dépendances de hooks |
| `globals` | 16.5.0 | MIT | environnement des scripts navigateur |
| `@vitest/coverage-v8` | 5.0.4 | MIT | rapport de couverture |

Aucun service payant, aucun compte, aucune API distante, aucune télémétrie. Seule connexion initiée par l’application : le moteur et les modèles OCR, après consentement (voir §5).

## 4. Fichiers clés modifiés ou ajoutés

- Moteurs : `src/lib/{archiveWriter,hash,history,reports}.ts`, `src/lib/documents/*`, `src/lib/operations/*`, `src/lib/jobs/*`, `src/lib/pdf/*`, `src/lib/image/*`, `src/lib/data/*`, `src/lib/ocr/*`.
- Interface : `src/studio/{useStudio.ts,StudioScreen.tsx,StudioPanels.tsx,StudioRunPanel.tsx,OcrModelsPanel.tsx,studio.css}` ; branchement dans `src/App.tsx`.
- Démarrage : `index.html`, `public/boot.css`, `public/boot.js`.
- Tauri : `src-tauri/src/main.rs` (commande `reveal_path` + test Rust), `src-tauri/tauri.conf.json`, `src-tauri/windows/installer/{hooks.nsh,render_assets.py,README.md}` (+ visuels NSIS régénérés, visuels WiX supprimés).
- CI et vie du dépôt : `.github/workflows/{release,ci,security}.yml`, `.github/dependabot.yml`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/release-notes/`.
- Icônes et associations : `src-tauri/icons/filetypes/generate_filetype_icons.py` (+ 21 `.ico`), `src-tauri/tauri.conf.json` (21 classes, 126 extensions, `bundle.resources`), `src-tauri/windows/installer/hooks.nsh` (icônes + reprise des sauvegardes), `src/lib/installerIcons.test.ts`, `docs/icons-fichiers.md`, `docs/assets/icons-fichiers.png`, `.github/workflows/release.yml` (contrôle de fumée des icônes).
- Coloration et ouverture : `src/lib/highlighting.ts`, `src/lib/fileTypes.ts` (`LANGUAGE_BY_EXTENSION`), `src/components/TextEditor.tsx`, `src/styles.css` (palette GitHub), `src/lib/launchMode.ts`, `src/lib/preferences.ts` (`immersiveOnFileOpen`), `src/App.tsx`, `src/App.launch.test.tsx`, `src/lib/highlighting.test.ts`, `src/components/TextEditor.test.tsx`.
- Barre supérieure et affichage : `src/lib/topbarLayout.ts`, `src/components/useTopbarFit.ts`, `src/lib/fullscreen.ts`, `src/components/WorkspaceTools.tsx` (menu regroupé), `src/App.tsx` (immersion et plein écran), `src/styles.css`.
- Outillage : `eslint.config.js`, `vite.config.ts` (couverture), `package.json` (scripts `lint`, `coverage`, `verify`).
- Fichiers racine : `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.editorconfig`, `.gitattributes`, `.nvmrc`, `docs/tests.md`.
- Documentation : voir §1.

## 5. Limites connues, assumées et documentées

1. **Protection d’un PDF par mot de passe (écriture)** : non prise en charge. `pdf-lib` ne sait pas chiffrer, et aucune bibliothèque libre, locale et maintenue n’a été retenue. L’**ouverture** de documents protégés fonctionne. La fonction n’est pas proposée plutôt que simulée.
2. **OCR** : ni les modèles de langue (11 à 12 Mo par langue, 4 Mo pour la détection d’orientation) ni les deux fichiers du moteur (script de travail d’environ 121 Ko et cœur WebAssembly d’environ 4,5 Mo) ne sont embarqués dans l’installeur. Le premier traitement les télécharge depuis les adresses affichées dans le panneau « Modèles OCR » — `tessdata.projectnaptha.com` pour les modèles, `cdn.jsdelivr.net` pour le script et le cœur — après accord explicite. Les modèles sont ensuite écrits dans le cache local de l’application (IndexedDB) ; les fichiers du moteur dépendent du cache HTTP du moteur de rendu. **Un premier traitement hors ligne est donc impossible**, et c’est la seule connexion réseau que Noto initie : embarquer le moteur et les modèles est un travail futur identifié dans le ROADMAP.
3. **Édition du texte natif d’un PDF** : non proposée. Le caviardage, lui, est destructif et vérifié.
4. **Conversions bureautiques** : reconstructions annoncées comme telles (texte, tableaux, images courantes conservés ; mise en page d’origine non reproduite).
5. **Ajout de fichiers dans l’atelier, en navigateur** : impossible pour l’instant (le bouton explique la limitation au lieu d’échouer). L’application de bureau n’a pas cette limite.
6. **Tests de l’interface graphique sur canevas** : les opérations d’image dépendent du canevas du navigateur/webview ; leur logique pure est testée (redressement, contraste, détection de marges), mais le rendu complet se vérifie dans l’application.
7. **Comparaison visuelle et ressemblance** : jamais présentée comme une preuve d’identité ; seuls les doublons SHA-256 sont qualifiés d’identiques.
8. **Signature de code** : l’installeur reste **non signé** tant que les secrets de certificat ne sont pas configurés. Aucune signature n’est revendiquée.
9. **Vérification visuelle** : les tests s’exécutent sans moteur de rendu et aucun navigateur n’est disponible dans l’environnement de développement utilisé. La correction du chevauchement de la barre supérieure est donc garantie par construction (zones non compressibles) et vérifiée par la mesure, la machine à états et un garde-fou sur la feuille de style — mais elle n’a pas été observée à l’écran ici. Le rendu final de l’application et de l’installeur se contrôle sous Windows.
10. **Couverture de tests de 34 % des lignes** : le chiffre est publié tel quel. Les modules dépendant du canevas ou du WebAssembly (rasterisation PDF, encodage d’images, OCR) et les écrans de l’atelier restent à 0 % faute d’environnement d’exécution ; aucun seuil artificiel n’est imposé.
11. **Délai des tests** : porté à 20 s par configuration, parce que la suite construit et relit de vrais documents et que les exécuteurs d’intégration continue sont plus lents qu’un poste de développement. Un test réellement bloqué échoue donc plus tard, mais échoue quand même.
12. **Workflow Security** : CodeQL et `npm audit` s’exécutent sur les poussées de `main` et `arena/**` et sur les pull requests. Ils ne sont pas bloquants par choix (un avis publié sur une dépendance transitive ne doit pas bloquer les corrections).
13. **Icônes par type : rendu non observé ici** : les `.ico` sont contrôlés structurellement (en-tête, 7 tailles, profondeur, PNG à partir de 48 px), leur cohérence avec la configuration et le crochet NSIS est testée, et la CI Windows vérifie dans le registre que chaque classe porte l’icône attendue et que le fichier existe — mais l’aspect des icônes dans l’Explorateur ne s’observe que sur une machine Windows. L’aperçu `docs/assets/icons-fichiers.png` sert de référence visuelle.
14. **Taille du paquet** : la coloration ajoute **73 ko** (20 ko compressés) au paquet principal, mesurés avant/après (`dist/assets/index-*.js` : 506 ko → 579 ko). Choix assumé : les grammaires sont chargées d’avance, ce qui rend la coloration immédiate à l’ouverture d’un fichier et évite une attente au premier caractère. Un chargement à la demande est un travail futur possible.
15. **Coloration de l’éditeur** : c’est une couche colorée sous le champ de saisie natif, pas un éditeur de code complet. Il n’y a ni complétion, ni correspondance de parenthèses, ni pliage de blocs, et la coloration s’arrête au-delà de 200 000 caractères ou 20 000 lignes (le texte redevient uniforme, la saisie reste identique).
16. **Fonctions du cahier des charges non commencées** : éditeur visuel de workflows, écran de paramètres OCR dédié hors atelier, gestionnaire de fichiers avancé (recherche/filtres sur arborescence), comparaison de documents non textuels au-delà des images et PDF, et fonctionnalités intelligentes optionnelles (§14). Le registre d’opérations, le runner et l’écriture vérifiée sont déjà en place pour les accueillir.

## 6. Livrable installeur

- **Construit et vérifié par la CI** (runs `38562975186` sur la branche, `38563865106` sur le tag `v0.2.0`) : installateur **NSIS** pour Windows x64, avec tests d’installation, de lancement et de désinstallation réels.
- Emplacement produit par la CI : `src-tauri/target/release/bundle/nsis/Noto_<version>_x64-setup.exe` — **chemin dans l’espace de travail de la CI**, pas dans ce dépôt.
- **Version 0.2.0 publiée** sur la base du tag `v0.2.0`, construite par la CI Windows avec le même parcours que celui décrit au §2 (installation silencieuse, ouverture de fichier, associations, désinstallation).
- **Page de version publiée** : titre « Noto 0.2.0 — atelier documentaire local », notes rédigées en français (`.github/release-notes/v0.2.0.md`), sans liste de commits brute ni texte généré en anglais ; le workflow `.github/workflows/release.yml` désactive désormais les notes automatiques dès qu’un fichier de notes existe pour le tag.
- Le release `v0.1.0` (13 octobre 2026, antérieur à ces travaux) ne contenait qu’une ligne de comparaison ; ses notes ont été **complétées à partir du `CHANGELOG.md`** de cette version, sans modifier une seule de ses pièces jointes (`Noto_0.1.0_x64-setup.exe`, `Noto_0.1.0_x64_fr-FR.msi`, `SHA256SUMS.txt`).
- **Aucune signature de code n’est revendiquée** : si les secrets de certificat ne sont pas configurés sur le dépôt, l’installeur publié n’est pas signé.
