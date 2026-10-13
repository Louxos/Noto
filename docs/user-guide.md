# Guide utilisateur

Noto lit les fichiers localement. L’ouverture ou la sauvegarde d’un document ne l’envoie pas vers un service distant. Les viewers reçoivent les octets en mémoire et n’exécutent pas les scripts des fichiers.

## Ouvrir et organiser

- Ouvrez un fichier par le bouton **Ouvrir**, `Ctrl+O` ou glisser-déposer. Dans l’application Windows, **Ouvrir avec Noto** peut également transmettre un ou plusieurs fichiers ; une seconde demande est remise à la fenêtre Noto déjà ouverte.
- Le guide de prise en main apparaît au premier lancement. Il reste accessible ensuite via **Aide → Guide de prise en main**. Vous pouvez y épingler un dossier pour la recherche locale ou ouvrir les paramètres d’associations Windows.
- Utilisez les onglets, les fichiers récents, les groupes locaux et les collections intelligentes **PDF récents** / **Images récentes**. Une collection ne déplace pas les originaux. Les récents peuvent être filtrés par texte/type, triés par nom/type/date et épinglés. Les paramètres permettent de régler leur limite (4 à 20) et de masquer les chemins visibles ; l’action explicite **Copier le chemin** reste disponible.
- Réordonnez les onglets par glisser-déposer ; faites un clic droit sur un onglet pour l’épingler, le désépingler ou fermer les autres onglets (les modifications non enregistrées sont confirmées).
- Dans l’application Tauri, faites un clic droit sur un fichier pour l’ouvrir, le classer, copier son chemin, le renommer ou le déplacer. Le nom de l’extension est conservé lors du renommage. La destination d’un déplacement doit être choisie par l’utilisateur.
- Dans le navigateur, renommer et déplacer l’original sont désactivés : le navigateur ne donne pas une permission portable permettant ces opérations.
- L’option **Restaurer la session bureau** est désactivée par défaut. Si vous l’activez, Noto conserve localement les chemins, l’ordre des onglets, l’onglet actif et le groupe actif desktop, jamais le contenu ; les chemins sont effacés lorsque l’option est désactivée.

## Recherche locale et comparaison

- **Fichier → Rechercher dans un dossier** lance une recherche à la demande dans un dossier choisi. Noto ne parcourt pas le disque sans votre action et n’indexe rien en arrière-plan. Les dossiers épinglés ne conservent que leurs chemins dans le stockage local ; cliquez de nouveau sur l’épingle pour les retirer.
- La recherche couvre les formats texte, code, Markdown, HTML et CSV. Pour préserver la réactivité, elle ignore les dossiers de dépendances/générés, descend au plus à 10 niveaux, lit au plus 5 000 fichiers et 64 Mo au total, et ignore les fichiers de plus de 1 Mo. Les résultats sont limités à 200 fichiers ; les limites et fichiers ignorés sont signalés.
- **Fichier → Comparer des fichiers texte** affiche deux onglets texte/code côte à côte. Vous pouvez ouvrir un deuxième fichier depuis la fenêtre de comparaison. Les différences d’ajout, de suppression et de modification sont distinguées ; les volets défilent ensemble. La comparaison n’écrit jamais dans les originaux et est limitée à 3 000 lignes par fichier et à une taille de calcul raisonnable.

## Associations Windows

Dans **Paramètres → Windows & associations**, **Ouvrir les paramètres Windows** mène à la page des applications par défaut. Choisissez Noto uniquement pour les extensions souhaitées : Windows reste seul à décider de l’application par défaut. Les fichiers transmis par l’Explorateur s’ouvrent dans Noto ; Noto ne remplace jamais silencieusement un choix existant.

## Menus contextuels

Un clic droit ouvre un menu Noto sur l’espace de travail, les fichiers, les mots sélectionnés et les viewers. Les actions varient selon le contenu : copier/rechercher une sélection, coller dans l’éditeur, classer ou ouvrir un fichier, naviguer dans un PDF ou un diaporama et contrôler le zoom d’une image. `Échap` ferme un menu ; les flèches haut/bas permettent d’y naviguer.

Le presse-papiers reste soumis aux autorisations du navigateur ou du système. Une action indisponible est désactivée plutôt que simulée.

## Lecture des formats

- **Markdown** : rendu des titres, listes, liens, tableaux et blocs de code ; l’édition offre un aperçu en direct.
- **Texte/code/configuration** : affichage monospace, numéros de lignes et retour à la ligne réglables.
- **HTML** : aperçu sandboxé ; les scripts, formulaires et accès réseau ne sont pas exécutés.
- **CSV/TSV** : tableau avec détection du séparateur parmi virgule, point-virgule, tabulation et barre verticale.
- **PDF** : navigation par boutons ou flèches gauche/droite, recherche, zoom et ajustement. Les commandes Sommaire, Signets et Miniatures ouvrent le panneau latéral ; les signets et la dernière page sont mémorisés localement par document. Le bouton **Texte** affiche une extraction sélectionnable de la page courante, que vous pouvez copier.
- **Images** : ajustement à la fenêtre, zoom et rotation ; les formats animés restent affichés via le navigateur.
- **PPTX/ODP** : Noto extrait localement le texte, les paragraphes et les images raster courants, puis les présente sur des diapositives simplifiées. Navigation avec `←`/`→`, `Page précédente`/`Page suivante`, `Début`/`Fin`, et plein écran avec `F` ; `Échap` quitte le plein écran. Les transitions, animations, polices, placements, formes, graphiques et mises en page complexes peuvent être perdus. Les `.ppt` binaires hérités ne sont pas pris en charge.
- **DOCX/ODT/RTF** : lecture seule, extraction du texte en paragraphes ; la mise en page et les éléments incorporés ne sont pas reconstruits. Le contenu original n’est jamais remplacé par le texte extrait.
- **EPUB** : lecture du texte et navigation entre les chapitres avec les flèches ou les boutons.

Les archives Office/EPUB sont lues en mémoire ; la taille de l’archive et le volume décompressé des XML/images sont plafonnés. Les macros et pièces jointes exécutables ne sont pas lancées.

## Éditer et enregistrer

Markdown, texte, code, HTML source, CSV et TSV peuvent être édités lorsque l’aperçu n’est pas tronqué. Le champ de saisie natif reste visible afin que le clic, la sélection et le curseur suivent exactement la position affichée. `Tab` insère deux espaces et `Maj+Tab` retire l’indentation courante ; `Entrée` conserve l’indentation de la ligne précédente.

- `Ctrl+E` active ou termine l’édition ; `Ctrl+G` ouvre le sélecteur de ligne.
- `Ctrl+S` enregistre ; `Ctrl+Maj+S` ouvre les options d’une copie (UTF-8, UTF-16LE ou Windows-1252 ; fins de ligne préservées, LF, CRLF ou CR). L’extension d’origine est conservée ; un caractère non représentable en Windows-1252 est signalé.
- `Ctrl+F` recherche dans le document actif ou, via **Tous les onglets**, dans les fichiers texte ouverts. Les résultats indiquent fichier/ligne, sélectionnent la correspondance et ouvrent l’onglet correspondant. `PDF` conserve sa recherche native.
- Les options de recherche couvrent la casse, les mots entiers et les expressions régulières ; `Entrée` / `Maj+Entrée` ou `F3` / `Maj+F3` passent au résultat suivant/précédent. `Ctrl+H` remplace dans le fichier actif (désactivez **Tous les onglets** pour remplacer).
- Avant d’écraser un fichier modifié en dehors de Noto, Noto demande confirmation lorsque le système expose la date de modification.
- La récupération locale des brouillons est désactivée par défaut. Si vous l’activez dans les paramètres, Noto conserve les modifications des fichiers texte sur cet appareil pendant 1, 7 ou 30 jours et demande confirmation avant de les restaurer ; Noto avertit aussi si le fichier source semble avoir changé. Choisir **Annuler** dans l’invite de restauration supprime ce brouillon. La limite est de 750 000 caractères par brouillon et 1,5 million au total ; les réglages permettent d’effacer les brouillons. Désactiver la récupération demande confirmation et efface les brouillons locaux.
- Les viewers Office et EPUB sont en lecture seule : utilisez **Enregistrer sous** uniquement depuis un format éditable.

## Raccourcis des viewers

| Contenu actif | Précédent / suivant | Plein écran |
| --- | --- | --- |
| PDF | `←` / `→`, `Page précédente` / `Page suivante` | — |
| Diaporama | `←` / `→`, `Page précédente` / `Page suivante` | `F`, puis `Échap` |
| EPUB | `←` / `→`, `Page précédente` / `Page suivante` | — |

La liste complète des raccourcis globaux est accessible depuis le menu **Aide → Raccourcis clavier**.
