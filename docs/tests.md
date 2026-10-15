# Tests et vérifications

Ce document décrit ce qui est réellement vérifié, avec quelle commande, et ce qui ne peut pas l’être hors de Windows ou hors de l’application de bureau. Il ne promet rien qui ne soit exécutable.

## Commandes

| Commande | Contenu | Durée indicative |
| --- | --- | --- |
| `npm run lint` | ESLint sur tout le dépôt (erreurs réelles : variables inutilisées, promesses non attendues, dépendances de hooks, `any` interdit). Aucune règle de style. | ~5 s |
| `npm run check` | `tsc -b` puis `vitest run` (43 fichiers, 192 tests au moment de la rédaction). | ~25 s |
| `npm run coverage` | Les mêmes tests avec rapport de couverture dans `coverage/`. | ~25 s |
| `npm run build` | Construction de l’interface (`dist/`), qui échoue si les types ne passent pas. | ~15 s |
| `npm run verify` | Les trois commandes ci-dessus, dans l’ordre. À exécuter avant toute pull request. | ~45 s |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Test de la commande native `reveal_path`. | Windows recommandé |
| `npm run tauri:build` | Installeur NSIS complet (Windows uniquement). | plusieurs minutes |

L’intégration continue exécute `npm run lint`, `npm run check`, `npm run coverage` et `npm run build` sur chaque poussée et chaque pull request (workflow **Checks**), puis CodeQL et le contrôle des avis de dépendances (workflow **Security**). Le workflow **Windows installers** (`.github/workflows/release.yml`) construit l’installeur, l’installe réellement, ouvre un fichier, contrôle les associations, désinstalle, calcule les sommes SHA-256 et publie la version sur un tag `vX.Y.Z`.

## Ce que les tests vérifient réellement

Les tests ne se contentent pas de constater l’absence d’exception : ils relisent les artefacts produits.

- **PDF** : les fichiers produits sont rechargés avec `pdf-lib` (octets, nombre de pages, dimensions, texte) ; le caviardage est confirmé en recherchant dans le fichier produit le texte censé avoir disparu.
- **DOCX/XLSX** : les archives sont réellement décompressées (`fflate`), puis `word/document.xml` ou les cellules sont inspectées.
- **ZIP** : les archives produites sont ouvertes, les noms d’entrée traversant (`..`, chemins absolus, lecteurs) sont refusés, les bornes sont éprouvées.
- **Images** : les octets produits sont relus et leur entête vérifié ; les opérations qui dépendent du canevas du système sont testées sur leur logique pure (détection de marges, estimation de rotation, contraste).
- **Barre supérieure** : la règle de mesure et la machine à états de réduction sont testées, et un garde-fou lit la feuille de style pour empêcher le retour du chevauchement d’icônes.
- **Affichage** : l’application complète est rendue dans jsdom pour vérifier l’absence d’écran blanc, l’absence de commande de plein écran quand l’environnement ne la propose pas, et le retrait de l’interface en mode immersion.

## Ce qui ne peut pas être vérifié ici

Ces points sont assumés et suivis dans [`ROADMAP.md`](../ROADMAP.md) :

- **Installeur NSIS** : la construction et l’installation réelle demandent Windows. Elles ont lieu dans le workflow **Windows installers**, jamais dans cet environnement de développement.
- **Rendu visuel** : les tests s’exécutent sans moteur de rendu. Les positions, les échelles et les couleurs se contrôlent dans l’application (ou par les visuels régénérés par `python3 src-tauri/windows/installer/render_assets.py`, qui sont relus à l’œil).
- **Opérations sur canevas et WebAssembly** : OCR Tesseract, rasterisation PDF, encodage d’images. Leur logique pure est testée, leur exécution complète se vérifie dans l’application.
- **Plein écran de la fenêtre** : le niveau système (`setFullscreen` Tauri) ne peut pas être simulé ; le niveau document, lui, est testé.
- **Écran d’accueil de Windows** : la mise à l’échelle (125 %, 150 %, 200 %) ne se vérifie que sur une machine Windows.

## Couverture

`npm run coverage` produit un rapport chiffré. Au moment de la rédaction, la couverture des lignes du dossier `src/` est d’environ **34 %** : elle est concentrée sur les moteurs de traitement (registre d’opérations, écriture PDF, archives, analyse de lots, formats) et sur les fonctions pures. Les modules qui dépendent du DOM ou du canevas — rasterisation PDF, encodage d’images, sessions OCR, écrans de l’atelier — restent à 0 % ou presque, faute d’environnement d’exécution.

Ce chiffre est publié tel quel, sans seuil artificiel : un seuil obligerait soit à tester davantage, soit à le baisser, et aucun des deux ne rendrait le produit plus sûr. Les améliorations prévues consistent à extraire davantage de logique pure des modules dépendants du DOM, là où c’est possible.
