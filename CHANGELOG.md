# Journal des modifications

Les changements notables sont consignés ici, selon une version simplifiée de Keep a Changelog.

## [Non publié] — 2026-10-07

### Ajouté
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
- Installateurs NSIS/MSI personnalisés aux couleurs Noto, avec licence MIT, choix de dossier et options de raccourci/lancement dans l’assistant NSIS.
- Restauration de session desktop facultative (chemins uniquement, désactivée par défaut) et export/import local des groupes/réglages sans contenu de document.
- Index documentaire centralisé dans `docs/` avec guide utilisateur et description des limites de rendu.

### Corrigé
- Éditeur : le texte visible est désormais celui du `<textarea>` natif, ce qui aligne exactement le caret et la sélection sur le clic ; insertion de tabulations et auto-indentation à Entrée.

## [0.1.0] — 2026-10-05

### Ajouté
- Première version de Noto : application Tauri 2 avec interface React/Vite.
- Viewers Markdown, code/texte, HTML isolé, PDF, image et CSV.
- Édition texte simple, aperçu Markdown en direct, sauvegarde locale, recherche et raccourcis.
- Onglets, glisser-déposer, fichiers récents, thèmes et paramètres locaux.
- Configuration d’installateur Windows, associations de formats, tests et workflows GitHub Actions.
