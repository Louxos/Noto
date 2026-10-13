# Feuille de route de Noto

Cette feuille ne garde que les travaux **non terminés** ou les validations encore manquantes. Les fonctionnalités déjà réalisées ont été retirées. Mise à jour : 8 octobre 2026.

## Obligatoire avant une version stable — P0

- [ ] **Signature Authenticode finale** : configurer les secrets du certificat de publication, valider la signature des deux bundles Windows et surveiller la réputation SmartScreen avant la première release stable. Les sommes SHA-256 et l’explication des avertissements sont désormais générées/documentées.

## Prioritaire — P1

- [ ] Mesurer les seuils réalistes pour les fichiers volumineux et ajouter, là où c’est utile, la lecture progressive ou la virtualisation.
- [ ] Vérifier après redémarrage la persistance des groupes, réglages, récents et brouillons ; tester aussi stockage plein, mode privé et stockage indisponible.
- [ ] Ajouter des tests d’intégration clavier pour l’éditeur, les menus, la palette, les groupes et les réglages. Vérifier en particulier qu’un clic place correctement le caret/la sélection et que la saisie normale fonctionne.

## Améliorations utiles — P2

### Lecture et édition

- [ ] Markdown : sommaire cliquable, copie du code en un clic et largeur de lecture réglable.
- [ ] JSON : actions explicites pour formater/indenter et minifier, sans modifier la source sans confirmation.
- [ ] Texte/code : replier les blocs et copier le code avec son formatage.

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
