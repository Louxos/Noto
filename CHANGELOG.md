# Journal des modifications

Les changements notables sont consignés ici, selon une version simplifiée de Keep a Changelog.

## [Non publié]

### Ajouté
- **Aperçu du lien survolé** : l’adresse du lien apparaît en bas à gauche de la fenêtre pendant le survol, comme dans un navigateur — adresse complète pour un site, adresse écrite pour un fichier local, section visée pour un renvoi interne. La nature du lien est nommée et l’infobulle porte l’adresse complète. Un écouteur unique couvre tous les lecteurs : Markdown aujourd’hui, tout futur lecteur de texte enrichi ensuite.
- **Liens vers une section du Markdown** : chaque titre reçoit un identifiant unique selon la règle de GitHub (accents conservés, ponctuation retirée, doublons suffixés `-1`, `-2`), et cliquer sur un renvoi interne amène réellement au titre — défilement dans le lecteur, focus sur le titre, repère visuel temporaire, sans rechargement. L’écriture reste indulgente (casse, accents, espaces) et un renvoi vers une section inexistante est **annoncé** dans l’aperçu du survol au lieu de passer inaperçu.
- **Impression réelle** : bouton **Imprimer** dans la barre d’outils, dans la barre d’état d’un fichier ouvert, dans le menu **Fichier… → Imprimer…**, dans la palette de commandes et par `Ctrl+P`. Noto imprime ce qu’il affiche : le texte, le code (avec numéros de ligne en option) et les tableaux sont mis en page par Noto ; le **rendu Markdown**, l’**aperçu HTML** et l’**image affichée** sont copiés tels quels ; les **PDF** et les images sont rendus en pages, avec le choix de l’étendue (page affichée ou document) et de la résolution (96, 150 ou 300 ppp). L’impression passe par la boîte de dialogue du système : Noto ne simule aucun aperçu.
- **Informations sur le fichier** (`Ctrl+I` / bouton **Informations**) : mesures réelles du fichier affiché, sans envoi en ligne — nom, type, extension, taille, emplacement, date, encodage, part chargée, puis selon le format : caractères, caractères hors espaces, mots, lignes, paragraphes, ligne la plus longue, fins de ligne ; lignes, colonnes, cellules et séparateur d’un tableau ; pages, dimensions de page, orientation et métadonnées d’un PDF ; dimensions, nombre de pixels et format d’une image (lues dans l’en-tête) ; diapositives d’une présentation ; parties et mots d’un document ou d’un livre. Chaque groupe explique ce qu’il ne mesure pas, et une mesure impossible est annoncée comme telle au lieu d’être inventée.
- **Barre d’état enrichie** : le nombre de pages, la page affichée, les dimensions, les caractères ou les lignes du fichier ouvert apparaissent en permanence, lus auprès du lecteur concerné (le lecteur PDF, par exemple, rapporte lui-même ses pages).
- **Renommage avec l’extension** : le dialogue de renommage sépare le nom et l’extension, tous deux modifiables. Les noms impossibles sous Windows (caractères interdits, noms réservés, point final, longueur) sont refusés avant l’écriture, avec l’explication, et un changement d’extension qui modifie le lecteur utilisé est annoncé avant d’appliquer.
- **Mode immersion à l’ouverture depuis Windows** : un fichier transmis par l’Explorateur — double-clic sur un format associé à Noto, ou **Ouvrir avec** — s’affiche seul, sans barre latérale, menus ni onglets. Le réglage **Ouvrir en mode immersion depuis Windows** (activé par défaut, dans *Paramètres → Windows & associations*) rétablit le comportement classique ; les fichiers choisis depuis Noto ne changent rien à l’affichage.
- **Icônes par type de fichier dans l’Explorateur** : Markdown, texte, comparaison, configuration, LaTeX, code, web, scripts, JSON, XML, YAML, CSV, TSV, PDF, images, Word/ODT/RTF, PowerPoint/ODP et EPUB ont chacun leur icône, au lieu de l’icône unique de Noto. Les 21 icônes (7 tailles chacune, de 16 à 256 px) sont générées sans dépendance ni ressource tierce (`src-tauri/icons/filetypes/generate_filetype_icons.py`) et posées dans le registre par l’installeur NSIS après la création des associations ; les extensions qui changent de classe sont reprises une par une afin que la désinstallation rende bien l’application d’origine. Détails et limites : [`docs/icons-fichiers.md`](docs/icons-fichiers.md).
- **Coloration syntaxique dans l’éditeur** : le texte est coloré pendant la frappe, dans la même palette que la lecture, avec les 21 familles supplémentaires de `highlight.js` (Rust, Go, Scala, Lua, Elixir, Erlang, Haskell, Elm, Clojure, F#, Protobuf, GraphQL, Less, LaTeX, AsciiDoc, diff…) et deux grammaires écrites ici pour ce que `highlight.js` ne fournit pas (JSON avec commentaires et JSON5 ; HCL/Terraform), plus Solidity et Pkl. La coloration renonce d’elle-même au-delà de 200 000 caractères ou 20 000 lignes, sans jamais retarder la frappe.
- **Plein écran de la fenêtre** : `F11`, bouton en haut à droite, menu **Affichage** et palette de commandes. Dans l’application de bureau, c’est la fenêtre Tauri qui bascule ; dans un navigateur, l’API plein écran du document. L’état affiché est relu du système, et aucune commande n’apparaît là où le plein écran n’existe pas.
- **Mode immersion** (`Ctrl+Maj+F`) : la barre latérale, les menus et les onglets s’effacent au profit du document, avec une sortie visible et `Échap`.
- **Réduction progressive de la barre supérieure** : les libellés laissent la place aux icônes (infobulles et libellés accessibles conservés), puis les menus se regroupent dans un bouton **Tous les menus** où aucune commande n’est perdue.
- **Garde-fou de la documentation** : un test relit les documents Markdown du dépôt — liens relatifs, ancres, chemins cités, index de `docs/`, cohérence avec la configuration réelle de l’installeur. Un renommage ou un lien mort fait échouer `npm run check` au lieu de passer inaperçu.
- Analyse statique **ESLint** (`npm run lint`, `npm run verify`) et rapport de **couverture** (`npm run coverage`), exécutés par la nouvelle vérification continue **Checks**.
- Workflow **Security** : analyse CodeQL et contrôle des avis de vulnérabilité des dépendances.
- Ossature de dépôt : `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, modèles d’issue et de pull request, `CODEOWNERS`, `dependabot.yml` (npm, Cargo, GitHub Actions), `.editorconfig`, `.gitattributes`, `.nvmrc`, et documentation des tests.

### Corrigé
- **Icônes superposées dans la barre du haut** : la zone des menus pouvait être comprimée sous sa largeur naturelle, et son contenu débordait par-dessus les actions — surtout en édition, avec le sélecteur de mode et toute la barre d’outils. Les zones fixes conservent désormais leur largeur (plus aucun chevauchement possible), et l’adaptation repose sur une mesure réelle de la mise en page, avec un retour en arrière prudent qui évite tout clignotement.
- Dépendances de hooks signalées par ESLint (`closeWelcome` mémoïsé, lignes de comparaison mémoïsées).
- Délai des tests rendu explicite : le délai par défaut de 5 s était trop court sur un exécuteur Windows pour le test de division d’un PDF page par page, qui construit et relit de vrais documents. Porté à 20 s, puis à 60 s après un second échec réel de l’exécuteur Windows sur ce même test.
- **Lien relatif mort** dans `src-tauri/windows/installer/README.md` (un niveau de dossier manquant vers `docs/icons-fichiers.md`), et une phrase fautive dans `docs/atelier.md`.

### Modifié
- **Documentation triée et alignée sur la réalité** : `docs/README.md` devient un index complet (chaque document de `docs/` y figure, avec les fichiers de la racine et leur rôle) ; le cahier des charges d’origine, laissé à la racine sous le nom `prompt`, devient `docs/cahier-des-charges.md` avec une note rappelant qu’il décrit la demande, pas l’état livré ; le raccourci racine `INSTALLATION.md` passe en français ; l’inventaire du passage au NSIS est daté et distingue ses chiffres de l’époque des compteurs actuels ; le chiffre de couverture est remis à jour ; l’exemple `examples/config.json` ne cite plus un numéro de version figé.
- **`Ctrl+P` imprime** (convention des suites documentaires) et la palette de commandes passe à **`Ctrl+Maj+P`** ; `Ctrl+I` ouvre les informations du fichier. Les libellés de la palette et la fenêtre des raccourcis suivent ce changement.
- Les **archives bureautiques** (DOCX, ODT, PPTX, ODP, EPUB) restent lues à la demande : l’impression et les mesures ne les chargent que si l’on agit sur un fichier de ce type, pour ne pas alourdir le paquet principal.
- **Palette de coloration** : les couleurs viennent désormais du thème officiel **GitHub** de `highlight.js` (clair) et de sa variante sombre, au lieu de teintes propres à Noto. La lecture et l’édition partagent exactement la même palette, posée en variables CSS.
- **Classes de fichiers affinées** : 21 classes au lieu de 14 (comparaison, configuration, LaTeX, web, scripts en ligne de commande, JSON, XML, YAML), afin que les icônes distinguent réellement les formats. Aucune extension n’est perdue et les extensions qui changent de classe voient leur sauvegarde d’association reprise à l’installation.
- `package.json` documenté : description, licence, dépôt, signaux d’anomalie, mots-clés, version de Node requise.

## [0.2.0] — 2026-10-14

Noto devient une suite documentaire locale : un atelier réunit des outils réels de traitement PDF, image, OCR, conversion et archivage, exécutés sur l’appareil, sans compte ni envoi en ligne.

### Ajouté
- **Atelier de traitement** : espace unique accessible depuis la barre latérale, le menu Affichage, la palette de commandes et le menu contextuel d’un fichier. Il n’affiche que les outils réellement capables de traiter les fichiers présents, expose les réglages (avancés masqués par défaut), la nature exacte du travail et ses limites, puis montre la progression réelle, l’état de chaque fichier, les mesures avant/après, les avertissements et un rapport exportable.
- **Registre unique de 55 opérations** (`src/lib/operations/`), réutilisé par l’atelier et par les futurs traitements par lots et workflows. Chaque opération déclare ses entrées, ses sorties, ses paramètres, ses limites et sa nature (modification native, calque, reconstruction, analyse).
- **Atelier PDF** : fusion, découpe par plages ou segments, extraction, suppression, rotation, réordonnancement, duplication, insertion, imposition 2/4/6/9 ; compression en six modes annoncés avec tailles mesurées ; filigrane, en-tête et pied de page, numérotation, signature d’image ; lecture et écriture des métadonnées ; inspection et remplissage des formulaires ; conversion vers images, texte, Markdown, Word, HTML et extraction des images ; images vers PDF ; analyse du document (pages, polices, pages numérisées) ; comparaison visuelle avec compte rendu par page.
- **Caviardage destructif vérifié** : les pages concernées sont reconstruites sans le contenu masqué, puis le texte retiré est recherché dans le fichier produit pour confirmer la suppression réelle.
- **Atelier images** : conversion, optimisation par profil, édition (rotation, retournement, recadrage, redimensionnement, luminosité/contraste/saturation, niveaux de gris, bordure, filigrane), planches-contacts, collages, découpage en tuiles, variantes, lecture et suppression des métadonnées EXIF/IPTC, comparaison perceptuelle. Les formats d’écriture sont testés avant l’annonce du résultat.
- **OCR local** : reconnaissance du texte d’images et de PDF numérisés, création de PDF interrogeable (image d’origine + couche de texte invisible), nettoyage de scan (redressement estimé par analyse des lignes, contraste, marges, débruitage, niveaux de gris), assemblage de scans en PDF.
- **Consentement explicite pour l’OCR** : ni le moteur (script de travail et cœur WebAssembly) ni les modèles de langue ne sont embarqués ou téléchargés silencieusement. L’atelier affiche langue, taille estimée, origine exacte et licence, attend un accord explicite — révocable — puis met les modèles en cache local. Un échec de chargement nomme les adresses concernées au lieu de laisser remonter une erreur réseau brute.
- **Conversion universelle** : texte/Markdown vers PDF, Word, HTML et texte brut ; CSV/TSV vers XLSX, PDF tabulaire et Markdown ; XLSX vers CSV ; DOCX, ODT, RTF, PPTX, ODP et EPUB vers PDF reconstruit ou vers texte, sans jamais exécuter de macro.
- **Archives ZIP sûres** : création avec noms uniques et compression réglable, extraction protégée contre les chemins dangereux (`..`, chemins absolus, lecteurs) et bornes de nombre d’entrées et de taille.
- **Analyse de lots** : doublons strictement identiques détectés par empreinte SHA-256 (avec espace récupérable), rapprochement prudent par nom présenté comme une simple ressemblance, filtres, tri et plan de renommage en série sans écrasement.
- **Exécution vérifiée** : progression fondée sur le travail effectué, annulation coopérative, erreurs détaillées fichier par fichier, écriture relue pour comparer la taille réellement écrite, historique local des traitements (noms, tailles, réglages — aucun contenu de document) exportable en Markdown.
- **Commande système `reveal_path`** pour ouvrir l’emplacement d’un fichier produit (Windows, macOS, Linux).
- **Test anti-dérive de version** : l’interface, le paquet npm, l’installeur Tauri et la définition Cargo doivent annoncer la même version, sinon la vérification continue échoue.

### Modifié
- **Slogan officiel** « Noto. Vos fichiers, vos outils, un seul espace. » affiché sur l’écran de démarrage et repris dans les visuels de l’installeur, sans troncature.
- **Écran de démarrage** : les messages correspondent à des étapes réellement franchies (préférences locales, préparation, interface prête), avec mise en garde honnête en cas d’attente prolongée ou de fichier d’interface manquant.
- **Installeur NSIS français** (`installMode: currentUser`, sans élévation, compression LZMA) : vérification réelle de l’installation, confirmation explicite avant désinstallation rappelant que les documents personnels sont conservés, et aucun dialogue en mode silencieux.
- Documentation alignée sur la réalité : guide de l’atelier, inventaire des fonctionnalités préservées, audit de la suppression du MSI, guide d’installation et notes de version.

### Corrigé
- « Convertir du Markdown en texte » retire désormais réellement le balisage (plus de `#` en début de titre, puces normalisées).
- L’outil d’édition d’image déclare le réglage de qualité qu’il utilisait en silence et aplatit la transparence sur un fond choisi avant tout encodage JPEG.
- La reconstruction PDF normalise les caractères non pris en charge par les polices standard et signale les remplacements.

### Supprimé
- **Génération du paquet MSI** : `bundle.targets` ne contient plus que `nsis`. La configuration WiX, les visuels WiX, leur code de génération, les tests de fumée MSI, la signature, les empreintes, les artefacts et les fichiers publiés par le workflow ont été retirés. L’installeur NSIS est l’unique canal de distribution. Détail : `docs/inventaire-et-migration.md`.

## [0.1.0] — 2026-10-13

### Ajouté
- Première version de Noto : application Tauri 2 avec interface React/Vite.
- Viewers Markdown, code/texte, HTML isolé, PDF, image et CSV.
- Édition texte simple, aperçu Markdown en direct, sauvegarde locale, recherche et raccourcis.
- Onglets, glisser-déposer, fichiers récents, thèmes et paramètres locaux.
- Configuration d’installateur Windows, associations de formats, tests et workflows GitHub Actions.
- Écran de démarrage Noto léger, cohérent avec la charte de l’application, avec indicateur de progression, prise en charge des préférences d’apparence et message après une attente prolongée.
- Workflow Windows : génération de sommes SHA-256 pour les installateurs et signature Authenticode conditionnelle lorsque le certificat des mainteneurs est configuré.
- Guide de première ouverture, rappelable depuis le menu Aide, avec raccourcis, formats, épinglage de dossiers locaux et accès aux associations Windows.
- Recherche plein texte locale à la demande dans un dossier explicitement choisi, avec emplacements épinglés, progression, annulation et plafonds de sécurité.
- Comparaison côte à côte de fichiers texte/code ouverts, avec lignes ajoutées, supprimées ou modifiées et défilement synchronisé ; comparaison en lecture seule.
- Navigation PDF enrichie : sommaire, miniatures, signets locaux, reprise à la dernière page et panneau de texte sélectionnable/copier.
- Ouverture des fichiers transmis par Windows dans la fenêtre Noto existante, et accès explicite aux paramètres Windows d’applications par défaut.
- Menus contextuels Noto dans l’espace de travail, les fichiers et les viewers : copie/recherche de sélection, classement, chemin, renommage/déplacement desktop, commandes PDF/présentation/image.
- Lecture des présentations `.pptx`/`.odp` avec navigation clavier, boutons et plein écran ; extraction locale limitée du texte et des images raster.
- Lecture seule des `.docx`, `.odt`, `.rtf` et `.epub`, avec navigation par chapitre EPUB.
- Prise en charge élargie des extensions de code/configuration, TSV, AVIF et APNG.
- PDF pilotable avec les flèches gauche/droite et PageUp/PageDown.
- Filtre et tri des lignes CSV/TSV par colonne.
- Tri de fichiers dans les groupes, ouverture de tous les fichiers d’un groupe et assignation rapide depuis le clic droit.
- Renommage/déplacement desktop avec extension préservée, confirmation anti-écrasement et synchronisation des chemins dans récents/groupes/onglets.
- Avertissement avant l’enregistrement si le fichier a été modifié en dehors de Noto.
- **Enregistrer sous** avec UTF-8, UTF-16LE ou Windows-1252, fins de ligne préservées ou choisies, extension conservée et erreurs affichées si le texte ne peut pas être encodé.
- Récupération locale des brouillons texte, désactivée par défaut, avec demande de restauration, rétention réglable (1/7/30 jours), confirmation avant désactivation/effacement et limites de taille documentées.
- Réglage de la limite des fichiers récents (4/8/12/20) et option pour masquer les chemins visibles.
- Retrait groupé de plusieurs références d’un groupe sans supprimer ni déplacer les fichiers originaux.
- Installateurs NSIS et MSI personnalisés aux couleurs Noto : licence MIT, dossier d’installation, menu Démarrer, raccourci Bureau et lancement facultatifs dans l’assistant NSIS.
- Restauration de session desktop facultative (chemins uniquement, désactivée par défaut) et export/import local des groupes/réglages sans contenu de document.
- Index documentaire centralisé dans `docs/` avec guide utilisateur et description des limites de rendu.

### Corrigé
- Éditeur : le texte visible est désormais celui du `<textarea>` natif, ce qui aligne exactement le caret et la sélection sur le clic ; insertion de tabulations et auto-indentation à Entrée.

