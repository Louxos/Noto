# Guide utilisateur

Noto lit les fichiers localement. L’ouverture ou la sauvegarde d’un document ne l’envoie pas vers un service distant. Les viewers reçoivent les octets en mémoire et n’exécutent pas les scripts des fichiers.

## Ouvrir et organiser

- Ouvrez un fichier par le bouton **Ouvrir**, `Ctrl+O` ou glisser-déposer. Dans l’application Windows, **Ouvrir avec Noto** peut également transmettre un ou plusieurs fichiers ; une seconde demande est remise à la fenêtre Noto déjà ouverte.
- Un fichier ouvert **depuis l’Explorateur** (double-clic sur un format associé à Noto, ou **Ouvrir avec**) s’affiche en **mode immersion** : le document seul, sans barre latérale, menus ni onglets. `Échap` ou `Ctrl+Maj+F` rétablit l’interface. Le réglage **Ouvrir en mode immersion depuis Windows** (activé par défaut, dans *Paramètres → Windows & associations*) permet de retrouver l’affichage habituel ; les fichiers ouverts depuis Noto ne changent jamais l’affichage.
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

Noto ne se contente pas d’un logo unique dans l’Explorateur : chaque famille de formats a **sa propre icône** — Markdown, texte, configuration, LaTeX, code, web, scripts, JSON, XML, YAML, comparaison, tableaux, PDF, images, documents bureautiques, présentations et livres numériques. Les icônes sont posées par l’installeur, jamais par l’application, et la désinstallation restaure vos associations d’origine. Détails et vérifications : [`docs/icons-fichiers.md`](icons-fichiers.md).

## Menus contextuels

Un clic droit ouvre un menu Noto sur l’espace de travail, les fichiers, les mots sélectionnés et les viewers. Les actions varient selon le contenu : copier/rechercher une sélection, coller dans l’éditeur, classer ou ouvrir un fichier, naviguer dans un PDF ou un diaporama et contrôler le zoom d’une image. `Échap` ferme un menu ; les flèches haut/bas permettent d’y naviguer.

Le presse-papiers reste soumis aux autorisations du navigateur ou du système. Une action indisponible est désactivée plutôt que simulée.

## Lecture des formats

- **Markdown** : rendu des titres, listes, liens, tableaux et blocs de code ; l’édition offre un aperçu en direct.
- **Texte/code/configuration** : affichage monospace, numéros de lignes et retour à la ligne réglables. Le code est **coloré** (mots-clés, chaînes, nombres, commentaires, balises) selon la palette GitHub de `highlight.js`, dans la lecture comme dans l’édition. Les fichiers sans grammaire connue restent en texte simple, et la coloration s’efface d’elle-même sur les très gros fichiers (> 200 000 caractères à l’édition, 500 000 à la lecture) pour préserver la fluidité.
- **HTML** : aperçu sandboxé ; les scripts, formulaires et accès réseau ne sont pas exécutés.
- **CSV/TSV** : tableau avec détection du séparateur parmi virgule, point-virgule, tabulation et barre verticale.
- **PDF** : navigation par boutons ou flèches gauche/droite, recherche, zoom et ajustement. Les commandes Sommaire, Signets et Miniatures ouvrent le panneau latéral ; les signets et la dernière page sont mémorisés localement par document. Le bouton **Texte** affiche une extraction sélectionnable de la page courante, que vous pouvez copier.
- **Images** : ajustement à la fenêtre, zoom et rotation ; les formats animés restent affichés via le navigateur.
- **PPTX/ODP** : Noto extrait localement le texte, les paragraphes et les images raster courants, puis les présente sur des diapositives simplifiées. Navigation avec `←`/`→`, `Page précédente`/`Page suivante`, `Début`/`Fin`, et plein écran avec `F` ; `Échap` quitte le plein écran. Les transitions, animations, polices, placements, formes, graphiques et mises en page complexes peuvent être perdus. Les `.ppt` binaires hérités ne sont pas pris en charge.
- **DOCX/ODT/RTF** : lecture seule, extraction du texte en paragraphes ; la mise en page et les éléments incorporés ne sont pas reconstruits. Le contenu original n’est jamais remplacé par le texte extrait.
- **EPUB** : lecture du texte et navigation entre les chapitres avec les flèches ou les boutons.

Les archives Office/EPUB sont lues en mémoire ; la taille de l’archive et le volume décompressé des XML/images sont plafonnés. Les macros et pièces jointes exécutables ne sont pas lancées.

## Imprimer

L’impression se lance depuis le bouton **Imprimer** de la barre d’outils, le bouton **Imprimer** de la barre d’état, le menu **Fichier → Imprimer…**, la palette de commandes ou `Ctrl+P`. La fenêtre propose d’abord ce qui sera réellement imprimé, puis ouvre la boîte de dialogue d’impression de votre système — c’est elle qui choisit l’imprimante, le nombre de copies et l’aperçu.

| Fichier ouvert | Ce qui est imprimé |
| --- | --- |
| Texte, code, configuration, Markdown source | Le contenu affiché, mis en page par Noto ; les numéros de ligne sont facultatifs. |
| Markdown, HTML en aperçu | Le rendu affiché, copié tel quel. Pour le HTML, le balisage est d’abord assaini : scripts retirés, images distantes non imprimées (elles ne sont pas chargées hors ligne, comme dans l’aperçu). |
| CSV/TSV | Un tableau, dans la limite de 2 000 lignes, avec en-tête répété. La fenêtre annonce le nombre de lignes imprimées. |
| PDF | Les pages rendues en images, page affichée ou document entier, à 96, 150 ou 300 ppp (150 par défaut), dans la limite de 200 pages par impression. Le texte imprimé n’est alors pas sélectionnable : c’est le prix d’une impression fidèle au rendu de Noto. |
| Image | L’image affichée, ajustée à la largeur de la page ; les formats que le navigateur ne décode pas (TIFF) sont imprimés sous leur forme convertie, et la rotation choisie à l’écran est conservée. |
| PPTX/ODP | Une diapositive par page, à partir du texte extrait ; la mise en page d’origine et les images ne sont pas reproduites, comme dans le diaporama. |
| DOCX/ODT/RTF/EPUB | Une partie par page, dans l’ordre du document. |

Rien n’est envoyé en ligne : la page imprimée est construite sur votre appareil, et aucune ressource distante n’y est chargée. Dans l’application de bureau comme dans un navigateur, c’est la boîte de dialogue d’impression du système qui choisit l’imprimante, les copies et l’aperçu — Noto n’en fabrique aucun.

## Informations et mesures

`Ctrl+I`, le bouton **Informations** de la barre d’outils ou de la barre d’état ouvrent la fenêtre **Informations sur le fichier**. Tout y est mesuré sur l’appareil, et rien n’y est deviné :

- **Fichier** : nom, type, extension, taille (octets et unité lisible), emplacement, date de modification, encodage du texte, part chargée si le fichier est très volumineux.
- **Texte** : caractères, caractères hors espaces, mots, lignes (une dernière ligne vide compte comme une ligne, comme dans l’éditeur), paragraphes, ligne la plus longue, nature des fins de ligne (LF, CRLF, CR, ou mélange), saut de ligne final.
- **Tableau (CSV/TSV)** : lignes, colonnes, cellules et séparateur détecté.
- **Document PDF** : pages, dimensions et orientation de la première page, titre, auteur, producteur, logiciel d’origine, dates de création et de modification, signalement d’un document chiffré et du texte sélectionnable. Un fichier de plus de 200 Mo n’est pas analysé ici : la fenêtre l’explique et renvoie au lecteur PDF, qui affiche toujours le nombre de pages.
- **Image** : format, dimensions, nombre de pixels, dimensions lues dans l’en-tête (sans décodage complet). Pour un SVG, ce sont les dimensions déclarées.
- **Présentation** : diapositives, paragraphes, caractères, images intégrées.
- **Document ou livre** : parties ou sections, paragraphes, caractères, mots.
- **Affichage en cours** : ce que le lecteur affiché sait déjà mieux que quiconque (page courante d’un PDF, diapositive affichée…).

Le bouton **Copier** place ces informations au format Markdown dans le presse-papiers. Une mesure impossible est expliquée — jamais remplacée par une valeur inventée. La **barre d’état** affiche en permanence les mesures essentielles du fichier ouvert.

## Liens et sections d’un document

- **Aperçu au survol** : passer la souris sur un lien affiche son adresse en bas à gauche de la fenêtre, à la place du statut, exactement comme dans un navigateur — l’adresse complète pour un site, l’adresse telle qu’écrite pour un fichier local, et pour un renvoi interne la section visée. La nature du lien est nommée à côté (*site web*, *fichier local*, *section de ce document*) et l’adresse complète reste accessible par l’infobulle.
- **Un renvoi vers une section est vérifié** : si le titre visé n’existe pas dans le document, l’aperçu l’annonce (*section introuvable dans ce document*) au lieu d’afficher une adresse qui ne mènerait nulle part.
- **Les liens internes fonctionnent** : chaque titre reçoit un identifiant unique, fabriqué selon la règle de GitHub — minuscules, ponctuation retirée, espaces remplacés par des tirets, accents conservés (`## Introduction générale` → `introduction-générale`). Deux titres qui se ressemblent sont distingués par un suffixe (`notes`, `notes-1`). Cliquer sur `[voir](#introduction-générale)` amène au titre dans le lecteur, lui donne le focus (utile au clavier) et le signale brièvement : la page n’est jamais rechargée.
- **Écriture indulgente** : `#Introduction générale`, `#introduction-generale` (sans accents) ou `#INTRODUCTION-GENERALE` mènent tous au même titre. Seule différence assumée avec GitHub : les tirets de bord sont retirés, `Questions ?` donnant `questions` plutôt que `questions-`.
- **Limites** : les liens vers une autre section d’un **autre** document, et les liens à l’intérieur de l’**aperçu HTML** (qui s’exécute dans un cadre isolé, sans script), ne sont pas interceptés. Ils restent des liens ordinaires.

## Éditer et enregistrer

Markdown, texte, code, HTML source, CSV et TSV peuvent être édités lorsque l’aperçu n’est pas tronqué. Le champ de saisie natif reste au-dessus d’une couche colorée : le clic, la sélection et le curseur suivent exactement la position affichée, tandis que le texte apparaît coloré. `Tab` insère deux espaces et `Maj+Tab` retire l’indentation courante ; `Entrée` conserve l’indentation de la ligne précédente.

- `Ctrl+E` active ou termine l’édition ; `Ctrl+G` ouvre le sélecteur de ligne.
- `Ctrl+S` enregistre ; `Ctrl+Maj+S` ouvre les options d’une copie (UTF-8, UTF-16LE ou Windows-1252 ; fins de ligne préservées, LF, CRLF ou CR). L’extension d’origine est conservée ; un caractère non représentable en Windows-1252 est signalé.
- `Ctrl+F` recherche dans le document actif ou, via **Tous les onglets**, dans les fichiers texte ouverts. Les résultats indiquent fichier/ligne, sélectionnent la correspondance et ouvrent l’onglet correspondant. `PDF` conserve sa recherche native.
- Les options de recherche couvrent la casse, les mots entiers et les expressions régulières ; `Entrée` / `Maj+Entrée` ou `F3` / `Maj+F3` passent au résultat suivant/précédent. `Ctrl+H` remplace dans le fichier actif (désactivez **Tous les onglets** pour remplacer).
- Avant d’écraser un fichier modifié en dehors de Noto, Noto demande confirmation lorsque le système expose la date de modification.
- La récupération locale des brouillons est désactivée par défaut. Si vous l’activez dans les paramètres, Noto conserve les modifications des fichiers texte sur cet appareil pendant 1, 7 ou 30 jours et demande confirmation avant de les restaurer ; Noto avertit aussi si le fichier source semble avoir changé. Choisir **Annuler** dans l’invite de restauration supprime ce brouillon. La limite est de 750 000 caractères par brouillon et 1,5 million au total ; les réglages permettent d’effacer les brouillons. Désactiver la récupération demande confirmation et efface les brouillons locaux.
- Les viewers Office et EPUB sont en lecture seule : utilisez **Enregistrer sous** uniquement depuis un format éditable.
- **Renommer** (menu contextuel d’un fichier → **Renommer…**) modifie le nom **et l’extension** : le dialogue les présente séparément, prévient avant d’écrire quand le nouveau nom est impossible sous Windows (caractères interdits, nom réservé, point final, longueur), et annonce lorsque l’extension change de nature — un `notes.txt` renommé en `notes.md` n’est pas converti, il change simplement de lecteur.

## Affichage : plein écran et immersion

Deux niveaux distincts, utilisables ensemble :

- **Plein écran de la fenêtre** (`F11`, ou menu **Affichage → Plein écran de la fenêtre**, ou le bouton en haut à droite) : la fenêtre Noto occupe tout l’écran du système, sans barre de titre. Dans l’application de bureau, c’est la fenêtre elle-même qui bascule ; dans un navigateur, c’est l’API plein écran du document. L’état affiché est relu du système : si vous quittez le plein écran par un autre moyen, le bouton se remet à jour tout seul. Quand l’environnement ne sait pas faire de plein écran, la commande n’est **pas** affichée.
- **Mode immersion** (`Ctrl+Maj+F`, ou menu **Affichage → Mode immersion**) : la fenêtre garde sa taille, mais la barre latérale, les menus et les onglets s’effacent pour ne laisser que le document et les actions utiles. Un bouton reste visible en haut à droite ; `Échap` en sort également. Ce mode s’active **automatiquement** lorsqu’un fichier vous est transmis par l’Explorateur Windows (voir *Ouvrir et organiser*).

La barre supérieure s’adapte d’elle-même quand la place manque : les libellés des actions laissent d’abord la place aux icônes (les infobulles et les libellés accessibles sont conservés), puis les menus se regroupent derrière un seul bouton **Tous les menus**, où chaque commande reste disponible avec son raccourci. Aucune action ne disparaît, et les zones ne se chevauchent jamais.

## Raccourcis des viewers

| Contenu actif | Précédent / suivant | Plein écran |
| --- | --- | --- |
| PDF | `←` / `→`, `Page précédente` / `Page suivante` | — |
| Diaporama | `←` / `→`, `Page précédente` / `Page suivante` | `F`, puis `Échap` |
| EPUB | `←` / `→`, `Page précédente` / `Page suivante` | — |

La liste complète des raccourcis globaux est accessible depuis le menu **Aide → Raccourcis clavier**.
