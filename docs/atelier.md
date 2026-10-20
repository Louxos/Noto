# L’atelier Noto

L’atelier est l’espace de traitement local de Noto : il réunit tous les outils dans une seule fenêtre, sur des fichiers que vous choisissez. Aucun fichier n’est envoyé en ligne, aucun compte n’est demandé, et le fichier d’origine n’est jamais modifié.

## Comment y accéder

- Barre latérale → **Atelier**.
- Menu **Affichage** → *Atelier de traitement*, *Atelier PDF*, *Atelier images*, *OCR et nettoyage de scans*, *Conversion de documents*.
- Palette de commandes (`Ctrl+P`) → « atelier », « OCR », « images »…
- Menu contextuel d’un fichier (dans l’accueil, les récents ou un groupe) → **Ouvrir dans l’atelier** : le fichier est ajouté immédiatement.

## Les trois colonnes

1. **Outils** : uniquement ceux qui savent traiter les fichiers présents. Un filtre permet de chercher par nom ou par description. Si aucun outil n’est disponible, Noto le dit clairement au lieu d’afficher un bouton inactif.
2. **Fichiers et réglages** : la liste des fichiers de travail, les réglages de l’outil choisi (les réglages avancés restent masqués jusqu’à demande), la nature réelle du travail et les limites connues.
3. **Traitement** : progression réelle, annulation, détail par fichier, mesures avant/après, rapport exportable, confidentialité et historique local.

## Règles tenues par l’atelier

- **Rien de factice.** Chaque bouton exécute un moteur d’opération réel ; la barre de progression suit le travail effectué, pas un minuteur.
- **Écriture vérifiée.** Chaque fichier produit est écrit puis relu (`writeFile` suivi d’un `stat`) : si la taille écrite ne correspond pas aux octets produits, l’opération est signalée en échec.
- **Aucun écrasement.** Un nom déjà pris reçoit un suffixe « (2) », « (3) »… Les noms sont nettoyés des caractères interdits par Windows.
- **Erreurs par fichier.** Un document protégé ou corrompu n’interrompt pas le lot : il est marqué en échec avec sa cause, les autres continuent.
- **Annulation coopérative.** « Annuler » demande l’arrêt ; le traitement s’arrête à la prochaine étape vérifiée et le dit.
- **Nature annoncée.** Chaque outil indique s’il modifie nativement le document, ajoute un calque, le reconstruit ou se contente de l’analyser.
- **Historique local.** Seuls des noms, tailles, réglages et résultats sont conservés ; aucun contenu de document. L’historique peut être exporté (Markdown) ou vidé.

## Familles d’outils

| Catégorie | Exemples |
| --- | --- |
| Pages PDF | Fusionner, découper, extraire, supprimer, réordonner, faire pivoter, dupliquer, insérer, imposer (2/4/6/9 par feuille) |
| Optimiser un PDF | Modes structure, équilibré, fort, numérisation, impression, partage — avec tailles réelles avant/après |
| Marquer un PDF | Filigrane, en-tête et pied de page, numérotation, signature d’image, caviardage destructif vérifié |
| Protéger / analyser | Analyse du document (pages, police, texte, pages numérisées), liste et remplissage de formulaires |
| Convertir un PDF | Vers images, texte, Markdown, Word, HTML, extraction des images ; images vers PDF |
| Images | Convertir, optimiser, modifier (rotation, recadrage, couleur, bordure, filigrane), planches-contacts, collages, tuiles, variantes, métadonnées, comparaison |
| OCR et scans | Reconnaître le texte d’une image ou d’un PDF, créer un PDF interrogeable, nettoyer un scan, assembler des scans en PDF |
| Tableaux et texte | CSV/TSV vers XLSX, PDF ou Markdown ; XLSX vers CSV ; texte/Markdown vers PDF, Word, HTML |
| Documents bureautiques | DOCX, ODT, RTF, PPTX, ODP, EPUB vers PDF reconstruit ou vers texte |
| Organiser | Création d’archive ZIP avec noms uniques et extraction protégée contre les chemins dangereux |

## Formats et niveaux de prise en charge

L’atelier affiche, pour les formats présents dans la liste, le niveau réellement constaté :

- **Lecture et écriture complètes** : le format peut être lu et produit par Noto.
- **Écriture partielle** : la lecture est fidèle, la production est une reconstruction annoncée comme telle.
- **Lecture seule** : Noto lit le fichier (ou en extrait le contenu) mais ne le réécrit pas dans son format d’origine.

Ces niveaux viennent de la table des formats (`src/lib/documents/formats.ts`) et sont repris dans la documentation ; ils ne sont jamais devinés à l’affichage.

## Résultats et rapports

À la fin d’un traitement, l’atelier affiche :

- l’état de chaque fichier (terminé, échec avec cause, annulé) et les fichiers produits, cliquables pour ouvrir leur emplacement ;
- les mesures réelles lorsque l’opération en produit (taille avant/après avec écart en pourcentage, nombre de pages, nombre de mots, etc.) ;
- les avertissements à lire (par exemple : « le mode maximal peut allonger le temps de traitement ») ;
- un rapport exportable en Markdown (`Exporter le rapport`), qui reprend sources, réglages, résultats, avertissements et erreurs.

## Réseau et confidentialité

Toutes les opérations de l’atelier s’exécutent sur votre appareil. Aucun fichier, aucun extrait de texte et aucun nom de fichier n’est envoyé où que ce soit : il n’existe ni compte, ni synchronisation, ni télémétrie.

La seule connexion que Noto peut initier concerne l’OCR, et uniquement après votre accord explicite, révocable depuis le panneau **Modèles OCR** :

| Élément téléchargé | Adresse annoncée dans le panneau | Taille | Quand |
| --- | --- | --- | --- |
| Script de travail du moteur | `https://cdn.jsdelivr.net/npm/tesseract.js@v…` | ~121 Ko | premier traitement OCR |
| Cœur WebAssembly du moteur | `https://cdn.jsdelivr.net/npm/tesseract.js-core@v…` | ~4,5 Mo | premier traitement OCR |
| Modèles de langue choisis | `https://tessdata.projectnaptha.com/4.0.0` | 4 Mo (orientation), 11 à 12 Mo par langue | premier traitement de chaque langue |

Les modèles sont ensuite conservés dans le cache local de l’application ; les deux fichiers du moteur dépendent du cache du moteur de rendu. Sans connexion, aucun de ces téléchargements n’a lieu et l’OCR refuse de démarrer avec un message explicite, plutôt que d’échouer en silence.

## Limites assumées

- Le traitement est local : sur un très gros lot, le temps dépend de votre processeur, pas d’un serveur.
- Les conversions bureautiques sont des reconstructions : le texte, les tableaux et les images courantes sont conservés, la mise en page d’origine ne l’est pas.
- Certaines opérations dépendent de formats que le moteur graphique du système ne sait pas encoder (par exemple AVIF ou HEIC en écriture) : dans ce cas, Noto refuse l’opération avec un message explicite plutôt que de produire un fichier invalide.
- L’édition du texte natif d’un PDF n’est pas proposée ; le caviardage, lui, retire réellement le contenu sous-jacent et le vérifie après écriture.
