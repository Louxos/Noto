# Feuille de route de Noto

Cette feuille ne garde que les travaux **non terminés** ou les validations encore manquantes. Les fonctionnalités déjà réalisées ont été retirées. Mise à jour : 7 octobre 2026.

## Obligatoire avant une version stable — P0

- [ ] **Valider l’installateur Windows à jour** : un artefact NSIS/MSI récent est disponible dans les [exécutions Windows installers](https://github.com/Louxos/Noto/actions/workflows/release.yml). L’installer, le mettre à jour et le désinstaller sous Windows 10/11 ; vérifier WebView2, l’apparence Noto et les options de l’assistant, le glisser-déposer, « Ouvrir avec » et l’absence de changement involontaire d’application par défaut.
- [ ] **Fiabilité de l’édition** : tester l’annulation/rétablissement avec sélection de lignes et gros documents ; définir et tester le comportement de récupération pour les brouillons qui dépassent les limites actuelles ; en cas de modification externe, proposer un parcours sûr pour comparer, recharger ou conserver la version éditée.
- [ ] **Revue sécurité Windows** : tester le scope des permissions fichiers, les refus d’accès et les chemins inhabituels ; ajouter des tests de non-régression pour les archives Office/EPUB malformées ou hostiles et pour les encodages rares.
- [ ] **Accessibilité** : vérifier la navigation clavier complète, les noms accessibles, le contraste, les lecteurs d’écran et les états de focus dans les écrans principaux, menus, viewers et dialogues.
- [ ] **Confiance dans la distribution** : publier les sommes SHA-256, expliquer clairement les avertissements SmartScreen et signer les exécutables dès qu’un certificat de signature est disponible.
- [ ] **Dépannage** : documenter et vérifier les parcours d’erreur pour permission refusée, échec de lecture/écriture, WebView2 absent et annulation d’une opération.

## Prioritaire — P1

- [ ] **Carnets locaux — validation native** : compiler le shell Tauri sur Windows, puis tester création/ouverture de plusieurs dossiers, restauration après redémarrage, hiérarchie sections/pages/sous-pages, édition riche et Markdown, autosauvegarde, liens/pièces jointes, refus d’accès et suppressions avec conservation ou suppression explicite des fichiers.
- [ ] Mesurer les seuils réalistes pour les fichiers volumineux et ajouter, là où c’est utile, la lecture progressive ou la virtualisation.
- [ ] Vérifier après redémarrage la persistance des groupes, réglages, récents et brouillons ; tester aussi stockage plein, mode privé et stockage indisponible.
- [ ] Ajouter des tests d’intégration clavier pour l’éditeur, les menus, la palette, les groupes et les réglages. Vérifier en particulier qu’un clic place correctement le caret/la sélection et que la saisie normale fonctionne.
- [ ] Ajouter un premier parcours d’accueil léger et désactivable, avec les raccourcis et le glisser-déposer, sans télémétrie ni envoi de données.

## Améliorations utiles — P2

### Lecture et édition

- [ ] PDF : sommaire, signets locaux, miniatures, sélection/copie de texte et mémorisation locale de la dernière page.
- [ ] Images : passer d’une image ouverte à la suivante ou à la précédente.
- [ ] CSV/TSV : régler la largeur des colonnes et exporter la sélection.
- [ ] Markdown : sommaire cliquable, copie du code en un clic et largeur de lecture réglable.
- [ ] JSON : actions explicites pour formater/indenter et minifier, sans modifier la source sans confirmation.
- [ ] Texte/code : replier les blocs et copier le code avec son formatage.
- [ ] Comparer deux fichiers texte ou deux versions avec affichage côte à côte des différences.

### Gestion des fichiers

- [ ] Détecter les doublons potentiels par nom et taille, puis proposer une comparaison avant toute action ; ne jamais supprimer un original sans confirmation.
- [ ] Révéler un fichier dans l’Explorateur et proposer de l’ouvrir dans une autre application.
- [ ] Glisser un onglet vers un groupe avec un indicateur clair de destination.

### Ergonomie

- [ ] Choisir la police de lecture, la largeur du panneau latéral et la taille des onglets.
- [ ] Ajouter un thème automatique selon Windows, une option de réduction des animations et un contraste renforcé.
- [ ] Ajouter des profils de barre d’outils (Lecture, Édition, Minimal).

## Optionnel — P3, seulement si le besoin le justifie

- [ ] Traduction anglaise de l’application avec choix manuel de la langue.
- [ ] Favoris et étiquettes libres, avec recherche locale.
- [ ] Extensions de viewers à permissions limitées, après revue de sécurité.
- [ ] OCR local facultatif pour les images et PDF numérisés.
- [ ] Synchronisation cloud facultative, jamais activée automatiquement et uniquement après choix explicite du fournisseur et des dossiers.
- [ ] Historique local de versions avec limite de stockage et suppression simple.
- [ ] Actions personnalisées ou modèles de documents, sans exécuter de scripts de fichiers par défaut.
- [ ] Aide intégrée plus détaillée et raccourcis configurables.
