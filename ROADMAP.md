# Feuille de route de Noto

Cette feuille ne garde que les travaux **non terminés** ou les validations encore manquantes. Les fonctionnalités déjà réalisées ont été retirées. Mise à jour : 15 octobre 2026.

## Obligatoire avant une version stable — P0

- [ ] **Constater les icônes par type dans l’Explorateur Windows** : le registre, les fichiers `.ico` et la désinstallation sont contrôlés automatiquement par le workflow **Windows installers**, mais l’apparence réelle (petites tailles 16/24 px, mise à l’échelle 125–200 %, contraste sur fond clair/sombre) et la restitution des associations d’origine après une mise à jour 0.2.0 → 0.3.0 demandent une machine Windows avec une version antérieure installée. Aperçu de référence : `docs/assets/icons-fichiers.png`.
- [ ] **Signature Authenticode finale** : configurer les secrets du certificat de publication, valider la signature de l’installeur NSIS et surveiller la réputation SmartScreen avant la première release stable. Les sommes SHA-256 et l’explication des avertissements sont déjà générées/documentées. (Le paquet MSI n’existe plus : le NSIS est l’unique installeur.)

## Prioritaire — P1

- [ ] Mesurer les seuils réalistes pour les fichiers volumineux et ajouter, là où c’est utile, la lecture progressive ou la virtualisation.
- [ ] Vérifier après redémarrage la persistance des groupes, réglages, récents et brouillons ; tester aussi stockage plein, mode privé et stockage indisponible.
- [ ] Ajouter des tests d’intégration clavier pour l’éditeur, les menus, la palette, les groupes et les réglages. Vérifier en particulier qu’un clic place correctement le caret/la sélection et que la saisie normale fonctionne.

## Améliorations utiles — P2

### Lecture et édition

- [ ] **Coloration chargée à la demande** : les 30 grammaires sont aujourd’hui embarquées d’avance (+73 ko, +20 ko compressés, mesurés) pour que la coloration soit immédiate ; un chargement par langage, à l’ouverture d’un fichier, réduirait le paquet au prix d’un premier rendu sans couleurs.
- [ ] Markdown : sommaire cliquable, copie du code en un clic et largeur de lecture réglable.
- [ ] JSON : actions explicites pour formater/indenter et minifier, sans modifier la source sans confirmation.
- [ ] Texte/code : replier les blocs et copier le code avec son formatage.

### Gestion des fichiers

- [ ] Révéler un fichier dans l’Explorateur et proposer de l’ouvrir dans une autre application. (L’atelier révèle déjà les fichiers produits ; l’action manque encore pour les fichiers d’origine.)
- [ ] Glisser un onglet vers un groupe avec un indicateur clair de destination.

### Ergonomie

- [ ] Choisir la police de lecture, la largeur du panneau latéral et la taille des onglets.
- [ ] Ajouter un thème automatique selon Windows, une option de réduction des animations et un contraste renforcé.
- [ ] Ajouter des profils de barre d’outils (Lecture, Édition, Minimal).

## Optionnel — P3, seulement si le besoin le justifie

- [ ] Traduction anglaise de l’application avec choix manuel de la langue.
- [ ] Favoris et étiquettes libres, avec recherche locale.
- [ ] Extensions de viewers à permissions limitées, après revue de sécurité.
- [ ] Embarquer le moteur OCR et les modèles dans l’installeur (choix de langue à l’installation) pour supprimer le premier téléchargement. Aujourd’hui, l’OCR demande un accord explicite, télécharge une fois le script de travail et le cœur WebAssembly du moteur (`cdn.jsdelivr.net`, environ 4,6 Mo) ainsi que les modèles choisis (`tessdata.projectnaptha.com`, 11 à 12 Mo par langue), puis les réutilise hors ligne. Tant que ce n’est pas fait, un premier traitement hors ligne est impossible et c’est la seule connexion réseau de l’application.
- [ ] Protéger un PDF par mot de passe en écriture : l’ouverture de documents protégés est prise en charge, mais aucune solution libre et locale n’est retenue pour le chiffrement à l’écriture. La fonction n’est donc pas proposée plutôt que simulée.
- [ ] Synchronisation cloud facultative, jamais activée automatiquement et uniquement après choix explicite du fournisseur et des dossiers.
- [ ] Historique local de versions avec limite de stockage et suppression simple.
- [ ] Actions personnalisées ou modèles de documents, sans exécuter de scripts de fichiers par défaut.
- [ ] Aide intégrée plus détaillée et raccourcis configurables.
