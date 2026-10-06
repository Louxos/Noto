# Feuille de route de Noto

Cette liste sépare les garde-fous nécessaires à une version stable des améliorations importantes, des fonctions de confort et des idées facultatives. Elle ne promet pas que toutes les fonctions seront ajoutées : elle sert à prioriser le travail. **La confidentialité locale reste une règle de conception** : pas de compte, de télémétrie ni de synchronisation activés par défaut.

## Déjà ajouté dans la version de travail

- [x] Menus **Fichier**, **Édition**, **Affichage** et **Aide**.
- [x] Palette de commandes filtrable (`Ctrl + Maj + P`) et aide visuelle des raccourcis.
- [x] Groupes locaux : création, couleurs, renommage (`F2`), suppression, ajout/retrait de fichiers et ouverture depuis un groupe.
- [x] Les groupes ne déplacent pas les fichiers et ne mémorisent que leurs métadonnées (nom et chemin), pas leur contenu.
- [x] Barre d’outils personnalisable : masquer/afficher, réordonner et activer le mode compact.
- [x] Personnalisation de la couleur d’accent, du thème et de la barre latérale compacte.
- [x] Raccourcis de navigation entre onglets et d’accès aux commandes courantes.

## Obligatoire avant une version stable — P0

- [ ] **Validation Windows de bout en bout** : installer/désinstaller les bundles NSIS et MSI sur Windows 10/11, vérifier WebView2, les fichiers ouverts par glisser-déposer et « Ouvrir avec ».
- [ ] **Préservation des modifications** : confirmer les dialogues de fermeture, protéger contre la perte de brouillons à la fermeture de l’application et après un plantage ; proposer une récupération locale explicite.
- [ ] **Sauvegarde fiable** : signaler les erreurs d’écriture, détecter autant que possible qu’un fichier a été modifié à l’extérieur et éviter d’écraser silencieusement la version la plus récente.
- [ ] **Permissions minimales** : conserver l’accès aux seuls fichiers choisis par l’utilisateur ; tester les limites de taille, les fichiers binaires et les encodages inhabituels.
- [ ] **Sécurité des aperçus** : garder HTML/Markdown sans exécution de scripts ni chargement distant automatique ; ajouter des tests de non-régression sur les liens, images et contenus hostiles.
- [ ] **Accessibilité** : navigation clavier complète, focus visible, modales qui conservent/restaurent le focus, noms accessibles, contraste vérifié et tests lecteur d’écran.
- [ ] **Installateur digne de confiance** : publier sommes SHA-256, expliquer les avertissements SmartScreen et, quand un certificat est disponible, signer les exécutables.
- [ ] **CI Windows durable** : vérifier le build `.exe` et `.msi` sur chaque changement pertinent, conserver un artefact temporaire pour les branches et publier seulement des versions identifiées.
- [ ] **Dépannage compréhensible** : messages précis en cas de format inconnu, fichier trop volumineux, permission refusée, échec de sauvegarde ou WebView2 absent.

## Urgent — P1, prochaines versions

### Espace de travail et organisation

- [ ] Restaurer au démarrage les onglets, le groupe actif et l’ordre des onglets, avec option « reprendre la dernière session » désactivée par défaut si la confidentialité l’exige.
- [ ] Réordonner les onglets par glisser-déposer, épingler les fichiers importants et fermer les autres onglets en une action.
- [ ] Ajouter/supprimer plusieurs fichiers d’un groupe en une fois ; réordonner les fichiers dans un groupe et choisir son tri (nom, type, date d’ouverture).
- [ ] Exporter/importer les groupes et préférences dans un fichier de sauvegarde local, sans jamais y inclure le contenu des documents.
- [ ] Ajouter un groupe intelligent facultatif, par exemple « PDF ouverts récemment » ou « Images », sans déplacer les fichiers.
- [ ] Permettre de dupliquer un groupe et d’ouvrir tout son contenu, avec confirmation si un grand nombre de fichiers est concerné.

### Recherche et édition

- [ ] Recherche transversale dans tous les onglets ouverts, avec surlignage et accès direct au résultat.
- [ ] Options de recherche : respecter la casse, mot entier, expressions régulières, compteur et raccourcis suivant/précédent.
- [ ] Historique d’annulation/rétablissement fiable dans l’éditeur, indentation cohérente avec Tab, sélection de lignes et aller à la ligne.
- [ ] Détection de modifications externes avant l’enregistrement et choix entre recharger, comparer ou garder la version en mémoire.
- [ ] Sauvegarde de brouillon de récupération strictement locale, avec durée de conservation réglable et bouton pour l’effacer.
- [ ] Enregistrer sous avec choix d’encodage et de fins de ligne, extension préservée et avertissement de remplacement.

### Confort et compatibilité

- [ ] Tester des fichiers très volumineux avec des seuils mesurés ; ajouter une lecture progressive ou virtualisée quand c’est pertinent.
- [ ] Vérifier la persistance des groupes et préférences après redémarrage de l’application, y compris en mode privé navigateur et sans espace de stockage.
- [ ] Ajouter des tests d’intégration clavier pour menus, palette, groupes et paramètres.
- [ ] Ajouter un petit parcours de première ouverture, désactivable, qui montre les raccourcis et le glisser-déposer sans envoyer de données.

## Utile — P2

### Outils de lecture

- [ ] PDF : table des matières, signets locaux, miniatures, rotation, sélection/copie de texte et mémorisation locale de la dernière page.
- [ ] Images : bouton « ajuster à la fenêtre », arrière-plan damier/blanc/noir, dimensions en pixels et navigation entre images ouvertes.
- [ ] CSV : tri et filtre par colonne, largeur réglable, recherche, aperçu des guillemets et export de la sélection.
- [ ] Markdown : sommaire cliquable, copie du code en un clic et réglage de largeur de lecture.
- [ ] JSON : validation syntaxique, erreurs avec ligne/colonne et actions explicites formater/minifier (sans changer le fichier juste à l’affichage).
- [ ] Texte/code : aller à la ligne, replier les blocs, copier le chemin, copier la sélection avec mise en forme ou texte brut.
- [ ] Comparer deux fichiers texte ou deux versions d’un même fichier avec différences côte à côte.

### Gestion des fichiers

- [ ] Filtrer et trier les récents par nom, famille de format et date ; épingler quelques récents.
- [ ] Copier le chemin complet, ouvrir l’emplacement dans l’Explorateur et ouvrir le fichier avec une autre application.
- [ ] Renommer un fichier depuis Noto uniquement après confirmation, avec gestion des collisions et sans changer son extension par surprise.
- [ ] Détecter les doublons par nom/taille (sans lire ni envoyer le contenu) et proposer une comparaison avant suppression.
- [ ] Glisser un onglet vers un groupe, avec indicateur clair de destination.
- [ ] Ajouter des filtres rapides par type : texte, code, PDF, image et données.

### Personnalisation et ergonomie

- [ ] Choix de police de lecture, largeur du panneau latéral et taille des onglets.
- [ ] Thème automatique selon Windows, réglage réduit des animations et contraste renforcé.
- [ ] Profils de barre d’outils (Lecture, Édition, Minimal) en plus du réglage commande par commande.
- [ ] Réglage du nombre de fichiers récents et option pour masquer les chemins dans l’interface.
- [ ] Ouvrir les réglages depuis la palette, restaurer les paramètres par défaut et exporter la configuration.

## Optionnel — P3, seulement si cela reste simple et privé

- [ ] Traduction anglaise en plus du français, avec choix manuel de la langue.
- [ ] Favoris et étiquettes libres (à distinguer des groupes) avec recherche locale.
- [ ] Extensions de viewer à permissions limitées, uniquement si un vrai besoin apparaît et après revue sécurité.
- [ ] OCR local activable pour les images/PDF numérisés, clairement séparé d’un service en ligne.
- [ ] Sauvegarde/synchronisation cloud **facultative**, jamais activée automatiquement et uniquement après choix explicite du fournisseur et des dossiers.
- [ ] Historique de versions local avec limite de stockage réglable et suppression simple.
- [ ] Actions personnalisées ou modèles de documents, sans exécuter de scripts de fichiers par défaut.
- [ ] Aide intégrée plus détaillée, raccourcis configurables et pages d’onboarding à ignorer.

## Décisions de produit à garder

1. Les fichiers restent à leur emplacement ; un groupe est une collection de références, pas un dossier déplacé.
2. Toute opération destructive demande une confirmation et ne doit jamais supprimer un original lors de la suppression d’un groupe.
3. Pas de code HTML/JavaScript des documents exécuté dans l’application ; les aperçus réseau restent bloqués par défaut.
4. Les préférences et l’historique restent locaux ; toute fonction de synchronisation future est opt-in, documentée et désactivable.
5. Priorité à la stabilité, à l’ouverture rapide et à la récupération des modifications avant l’ajout d’options avancées.
