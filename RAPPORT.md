# Rapport d’exécution — évolution de Noto en suite documentaire

Date : 14 octobre 2026 · Branche : `arena/30f013fe-noto` · Dépôt : `Louxos/Noto`

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

### Application et installeur

- **Slogan** « Noto. Vos fichiers, vos outils, un seul espace. » présent sur l’écran de démarrage (avec étapes réelles : préférences chargées → interface prête) et sur les visuels de l’installeur (panneau latéral : slogan complet ; bandeau : slogan sur deux lignes, jamais tronqué).
- **Commande Tauri `reveal_path`** ajoutée pour ouvrir l’emplacement d’un fichier produit.
- **Installeur** : NSIS uniquement (`bundle.targets: ["nsis"]`), en français, `currentUser` (sans élévation), compression LZMA, visuels NSIS, crochets `installerHooks` qui vérifient réellement l’installation et confirment avant désinstallation, sans aucun dialogue en mode silencieux. Le gabarit NSIS de Tauri 2.12.3 place le panneau latéral sur la page d’accueil et la page finale (`MUI_WELCOMEFINISHPAGE_BITMAP`) et le bandeau sur les autres pages (`MUI_HEADERIMAGE_BITMAP`), et insère les quatre crochets déclarés (`!ifmacrodef` / `!insertmacro`) : les visuels du logo, du nom et du slogan apparaissent donc bien sur l’assistant, même si leur rendu final ne s’observe que sous Windows.
- **MSI supprimé** partout : configuration, assets WiX, générateur d’images, tests de fumée, signature, empreintes, artefacts et fichiers publiés de la CI. Détail complet dans [`docs/inventaire-et-migration.md`](docs/inventaire-et-migration.md).

### Documentation mise à jour

`README.md`, `CHANGELOG.md`, `INSTALLATION.md`, `docs/build-windows.md`, `docs/installation.md`, `docs/atelier.md` (nouveau), `docs/inventaire-et-migration.md` (nouveau), `ROADMAP.md`, `src-tauri/windows/installer/README.md`.

## 2. Commandes exécutées et résultats

| Commande | Résultat |
| --- | --- |
| `npm run check` (`tsc -b` + `vitest run`) | ✅ **38 fichiers de tests, 169 tests réussis** |
| `npm run build` | ✅ succès (bundle produit dans `dist/`) |
| `npx tsc -b` seul | ✅ aucune erreur (mode strict, `noUnusedLocals`, `verbatimModuleSyntax`) |
| Vitest ciblés | ✅ `operations/registry.test.ts` 7/7 · `pdfOperations.test.ts` 19/19 · `jobs/analysis.test.ts` 8/8 · `archiveWriter.test.ts` 7/7 · `image/scanCleanup.test.ts` 5/5 · `ocr/ocrConsent.test.ts` 7/7 · `ocr/ocrEngine.test.ts` 2/2 · `studio/*` 10/10 |
| CI Windows — run `38562975186` sur `arena/30f013fe-noto` | ✅ **succès** : `npm ci`, `npm run check`, `npm run build`, commandes Windows natives, **construction de l’installeur avec les crochets NSIS**, test de fumée (installation silencieuse, ouverture de fichier, associations, désinstallation), empreintes SHA-256, dépôt de l’artefact `noto-windows-installers` |
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

Aucun service payant, aucun compte, aucune API distante, aucune télémétrie. Seul téléchargement possible de toute l’application : les modèles OCR, après consentement (voir §5).

## 4. Fichiers clés modifiés ou ajoutés

- Moteurs : `src/lib/{archiveWriter,hash,history,reports}.ts`, `src/lib/documents/*`, `src/lib/operations/*`, `src/lib/jobs/*`, `src/lib/pdf/*`, `src/lib/image/*`, `src/lib/data/*`, `src/lib/ocr/*`.
- Interface : `src/studio/{useStudio.ts,StudioScreen.tsx,StudioPanels.tsx,StudioRunPanel.tsx,OcrModelsPanel.tsx,studio.css}` ; branchement dans `src/App.tsx`.
- Démarrage : `index.html`, `public/boot.css`, `public/boot.js`.
- Tauri : `src-tauri/src/main.rs` (commande `reveal_path` + test Rust), `src-tauri/tauri.conf.json`, `src-tauri/windows/installer/{hooks.nsh,render_assets.py,README.md}` (+ visuels NSIS régénérés, visuels WiX supprimés).
- CI : `.github/workflows/release.yml` (MSI retiré, NSIS seul).
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
9. **Fonctions du cahier des charges non commencées** : éditeur visuel de workflows, écran de paramètres OCR dédié hors atelier, gestionnaire de fichiers avancé (recherche/filtres sur arborescence), comparaison de documents non textuels au-delà des images et PDF, et fonctionnalités intelligentes optionnelles (§14). Le registre d’opérations, le runner et l’écriture vérifiée sont déjà en place pour les accueillir.

## 6. Livrable installeur

- **Construit et vérifié par la CI** (runs `38562975186` sur la branche, `38563865106` sur le tag `v0.2.0`) : installateur **NSIS** pour Windows x64, avec tests d’installation, de lancement et de désinstallation réels.
- Emplacement produit par la CI : `src-tauri/target/release/bundle/nsis/Noto_<version>_x64-setup.exe` — **chemin dans l’espace de travail de la CI**, pas dans ce dépôt.
- **Version 0.2.0 publiée** sur la base du tag `v0.2.0`, construite par la CI Windows avec le même parcours que celui décrit au §2 (installation silencieuse, ouverture de fichier, associations, désinstallation).
- **Page de version publiée** : titre « Noto 0.2.0 — atelier documentaire local », notes rédigées en français (`.github/release-notes/v0.2.0.md`), sans liste de commits brute ni texte généré en anglais ; le workflow `.github/workflows/release.yml` désactive désormais les notes automatiques dès qu’un fichier de notes existe pour le tag.
- Le release `v0.1.0` (13 octobre 2026, antérieur à ces travaux) ne contenait qu’une ligne de comparaison ; ses notes ont été **complétées à partir du `CHANGELOG.md`** de cette version, sans modifier une seule de ses pièces jointes (`Noto_0.1.0_x64-setup.exe`, `Noto_0.1.0_x64_fr-FR.msi`, `SHA256SUMS.txt`).
- **Aucune signature de code n’est revendiquée** : si les secrets de certificat ne sont pas configurés sur le dépôt, l’installeur publié n’est pas signé.
