# Tests et vérifications

Ce document décrit ce qui est réellement vérifié, avec quelle commande, et ce qui ne peut pas l’être hors de Windows ou hors de l’application de bureau. Il ne promet rien qui ne soit exécutable.

## Commandes

| Commande | Contenu | Durée indicative |
| --- | --- | --- |
| `npm run lint` | ESLint sur tout le dépôt (erreurs réelles : variables inutilisées, promesses non attendues, dépendances de hooks, `any` interdit). Aucune règle de style. | ~5 s |
| `npm run check` | `tsc -b` puis `vitest run` (54 fichiers, 278 tests au moment de la rédaction). Délai de 60 s par test : la suite construit et relit de vrais documents, et les exécuteurs d’intégration continue sont plus lents qu’un poste de développement. | ~26 s |
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
- **Ouverture depuis Windows** : le pont Tauri est simulé (`startup_paths`, événement `noto-open-files`) pour vérifier que le mode immersion s’active seul sur un fichier transmis, qu’il ne s’active pas pour un fichier choisi dans Noto, et qu’il reste désactivable par le réglage.
- **Coloration** : les sorties de `highlight.js` sont relues (classes `hljs-keyword`, `hljs-number`… présentes sur de vrais extraits de huit langages), l’échappement du code est vérifié sur du contenu hostile, et deux tests empêchent la régression silencieuse : chaque extension associée à Noto a une grammaire ou est assumée en texte simple, et chaque langage déclaré est réellement enregistré.
- **Impression** : la page produite est relue (titre, contenu échappé, aucune balise `script`, politique de sécurité empêchant tout chargement), l’impression est déclenchée sur le vrai chemin de code — `window.print()` de l’iframe d’impression — et un échec de préparation de l’iframe est vérifié comme annoncé à l’utilisateur. Le papier imprimé, lui, ne s’observe que sur une machine avec une imprimante.
- **Mesures** : chaque famille de mesures est testée sur des données construites à la main (en-têtes PNG, GIF, BMP, WebP dans ses trois variantes, JPEG, ICO, TIFF, dimensions SVG, fins de ligne, tableaux), y compris les cas qui doivent **échouer** — en-tête tronqué, format inconnu, PDF illisible, fichier énorme — pour vérifier qu’une mesure impossible est annoncée au lieu d’être inventée.
- **Renommage** : le dialogue est piloté comme un utilisateur (nom, extension, validation, avertissement de changement de lecteur) et l’on vérifie qu’un nom refusé ou un renommage sans changement n’écrit **rien**.
- **Icônes par type de fichier** : les `.ico` livrés sont relus octet par octet (en-tête, 7 tailles de 16 à 256 px, profondeur 32 bits, PNG à partir de 48 px), puis confrontés à la table du crochet NSIS et aux classes déclarées dans `tauri.conf.json` : aucune classe sans icône, aucune icône orpheline, aucune extension sans reprise de sauvegarde d’association.

## Ce qui ne peut pas être vérifié ici

Ces points sont assumés et suivis dans [`ROADMAP.md`](../ROADMAP.md) :

- **Installeur NSIS** : la construction et l’installation réelle demandent Windows. Elles ont lieu dans le workflow **Windows installers**, jamais dans cet environnement de développement. Ce workflow installe réellement l’installeur, puis vérifie dans le registre que les classes de fichiers portent bien leur icône et que les fichiers `.ico` existent dans `$INSTDIR\filetypes` — et qu’ils ont disparu après désinstallation.
- **Rendu des icônes par type** : les `.ico` sont contrôlés structurellement, et leur apparence dans l’Explorateur se constate sur une machine Windows (l’aperçu `docs/assets/icons-fichiers.png` sert de référence visuelle).
- **Rendu visuel et impression papier** : les tests s’exécutent sans moteur de rendu et sans imprimante. La page d’impression est pourtant produite et relue dans les tests (contenu, échappement, styles, images), et la boîte de dialogue du système est bien celle qui s’ouvre ; ce que l’imprimante reçoit réellement se constate sur une machine équipée.
- **Rendu visuel** : les tests s’exécutent sans moteur de rendu. Les positions, les échelles et les couleurs se contrôlent dans l’application (ou par les visuels régénérés par `python3 src-tauri/windows/installer/render_assets.py`, qui sont relus à l’œil).
- **Opérations sur canevas et WebAssembly** : OCR Tesseract, rasterisation PDF, encodage d’images. Leur logique pure est testée, leur exécution complète se vérifie dans l’application.
- **Plein écran de la fenêtre** : le niveau système (`setFullscreen` Tauri) ne peut pas être simulé ; le niveau document, lui, est testé.
- **Écran d’accueil de Windows** : la mise à l’échelle (125 %, 150 %, 200 %) ne se vérifie que sur une machine Windows.

## Couverture

`npm run coverage` produit un rapport chiffré. Au moment de la rédaction, la couverture des lignes du dossier `src/` est d’environ **34 %** : elle est concentrée sur les moteurs de traitement (registre d’opérations, écriture PDF, archives, analyse de lots, formats) et sur les fonctions pures. Les modules qui dépendent du DOM ou du canevas — rasterisation PDF, encodage d’images, sessions OCR, écrans de l’atelier — restent à 0 % ou presque, faute d’environnement d’exécution.

Ce chiffre est publié tel quel, sans seuil artificiel : un seuil obligerait soit à tester davantage, soit à le baisser, et aucun des deux ne rendrait le produit plus sûr. Les améliorations prévues consistent à extraire davantage de logique pure des modules dépendants du DOM, là où c’est possible.
