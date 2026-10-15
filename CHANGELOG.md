# Journal des modifications

Les changements notables sont consignés ici, selon une version simplifiée de Keep a Changelog.

## [Non publié]

### Ajouté
- **Plein écran de la fenêtre** : `F11`, bouton en haut à droite, menu **Affichage** et palette de commandes. Dans l’application de bureau, c’est la fenêtre Tauri qui bascule ; dans un navigateur, l’API plein écran du document. L’état affiché est relu du système, et aucune commande n’apparaît là où le plein écran n’existe pas.
- **Mode immersion** (`Ctrl+Maj+F`) : la barre latérale, les menus et les onglets s’effacent au profit du document, avec une sortie visible et `Échap`.
- **Réduction progressive de la barre supérieure** : les libellés laissent la place aux icônes (infobulles et libellés accessibles conservés), puis les menus se regroupent dans un bouton **Tous les menus** où aucune commande n’est perdue.
- Analyse statique **ESLint** (`npm run lint`, `npm run verify`) et rapport de **couverture** (`npm run coverage`), exécutés par la nouvelle vérification continue **Checks**.
- Workflow **Security** : analyse CodeQL et contrôle des avis de vulnérabilité des dépendances.
- Ossature de dépôt : `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, modèles d’issue et de pull request, `CODEOWNERS`, `dependabot.yml` (npm, Cargo, GitHub Actions), `.editorconfig`, `.gitattributes`, `.nvmrc`, et documentation des tests.

### Corrigé
- **Icônes superposées dans la barre du haut** : la zone des menus pouvait être comprimée sous sa largeur naturelle, et son contenu débordait par-dessus les actions — surtout en édition, avec le sélecteur de mode et toute la barre d’outils. Les zones fixes conservent désormais leur largeur (plus aucun chevauchement possible), et l’adaptation repose sur une mesure réelle de la mise en page, avec un retour en arrière prudent qui évite tout clignotement.
- Dépendances de hooks signalées par ESLint (`closeWelcome` mémoïsé, lignes de comparaison mémoïsées).
- Délai des tests rendu explicite (20 s) : le délai par défaut de 5 s était trop court sur un exécuteur Windows pour le test de division d’un PDF page par page, qui construit et relit de vrais documents.

### Modifié
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

