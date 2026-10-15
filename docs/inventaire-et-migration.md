# Inventaire des fonctionnalités et audit de suppression du MSI

Ce document répond à l’étape A du cahier des charges : il recense ce que Noto savait faire avant l’évolution, ce qui a été ajouté sans le casser, et ce qui a réellement disparu du dépôt lors du passage à un installeur NSIS unique. Il est vérifiable : chaque point renvoie au fichier concerné.

> **Audit daté du 14 octobre 2026** (version 0.2.0). Il décrit un instant précis et n’est pas mis à jour à chaque version : les compteurs cités ci-dessous sont ceux de ce jour-là. L’état courant est décrit dans [`../RAPPORT.md`](../RAPPORT.md), [`../ROADMAP.md`](../ROADMAP.md) et [`tests.md`](tests.md).

## 1. Fonctionnalités préservées (aucune suppression, aucune réécriture)

| Domaine | Comportement conservé | Où |
| --- | --- | --- |
| Ouverture de fichiers | Sélecteur système, glisser-déposer, ouverture depuis l’Explorateur, instance unique transférant les chemins à la fenêtre existante | `src/lib/files.ts`, `src-tauri/src/main.rs` |
| Lecture texte | Aperçu progressif par tranches de 1 Mo (limite d’aperçu 8 Mo), confirmation au-delà de 50 Mo pour les binaires | `src/lib/files.ts` |
| Onglets | Ouverture, fermeture, réordonnancement par glisser-déposer, épinglage, restauration de session | `src/lib/tabs.ts`, `src/lib/session.ts` |
| Groupes de fichiers | Création, renommage, duplication, suppression, ajout/retrait de fichiers, couleurs, limite de 30 groupes | `src/lib/groups.ts` |
| Recherche | Recherche dans le document actif, dans les onglets ouverts, options casse/mot entier/expression régulière, remplacement, aller à la ligne | `src/lib/search.ts`, `src/App.tsx` |
| Recherche de dossier | Recherche locale à la demande avec dossiers épinglés | `src/lib/folderSearch.ts`, `src/lib/searchFolders.ts` |
| Comparaison de texte | Comparaison de deux onglets, options espaces/fins de ligne | `src/lib/textDiff.ts` |
| Édition et enregistrement | Bascule lecture/édition, enregistrement, « Enregistrer sous », choix de l’encodage et des fins de ligne, sauvegarde de l’encodage d’origine | `src/lib/saveFormat.ts`, `src/lib/files.ts` |
| Brouillards | Brouillons locaux, sauvegarde automatique, restauration | `src/lib/drafts.ts` |
| Sauvegarde locale | Export/import d’une sauvegarde des groupes, préférences et brouillons | `src/lib/backup.ts` |
| Visionneuses | Markdown, code (coloration), HTML en bac à sable, CSV interactif, PDF, images, présentations (PPTX/ODP), documents bureautiques et livres numériques | `src/components/*` |
| Préférences | Thème clair/sombre, accent, densité de barre d’outils, taille de texte, masquage des chemins, limite de récents | `src/lib/preferences.ts` |
| Raccourcis et menus | Palette de commandes, barre de menus, menus contextuels, boîte des raccourcis | `src/App.tsx`, `src/components/WorkspaceTools.tsx` |
| Icônes et marque | Logo et monogramme Noto | `assets/noto-logo.svg`, `assets/noto-icon.svg` |
| Associations « Ouvrir avec » | Déclarées, sans jamais remplacer l’application par défaut sans action de l’utilisateur | `src-tauri/tauri.conf.json` |
| Sécurité locale | Aucun envoi réseau, stockage local uniquement, bac à sable HTML sans script | `src/lib/security.ts`, `docs/security.md` |
| Écran de démarrage | Écran de préchargement avant React, thème appliqué depuis les préférences | `index.html`, `public/boot.js` |

Les tests qui protégeaient ces comportements existaient déjà (`src/lib/*.test.ts`, `src/components/*.test.tsx`) et continuaient de passer à cette date : **35 fichiers, 158 tests**. Ils n’ont pas été supprimés depuis ; la suite compte aujourd’hui **57 fichiers et 298 tests** (voir [`tests.md`](tests.md)).

## 2. Ajouts de cette évolution

- Registre unique de 55 opérations (`src/lib/operations/`), réutilisé par l’atelier, les traitements par lots et les workflows.
- Moteurs : PDF (`src/lib/pdf/`), images (`src/lib/image/`), OCR local (`src/lib/ocr/`), tableaux et bureautique (`src/lib/data/`, `src/lib/documents/`), archives ZIP (`src/lib/archiveWriter.ts`).
- Exécution, écriture vérifiée et rapports (`src/lib/jobs/`), historique local (`src/lib/history.ts`).
- Interface de l’atelier (`src/studio/`), accessible depuis la barre latérale, le menu « Affichage », le menu contextuel d’un fichier et la palette de commandes.
- Slogan officiel sur l’écran de démarrage et dans l’installeur.
- Commande Tauri `reveal_path` pour ouvrir l’emplacement d’un fichier produit.

## 3. Audit du MSI : ce qui a été retiré, et pourquoi

Le MSI (`bundle.windows.wix`) servait à produire `Noto_<version>_x64_fr-FR.msi`. Le cahier des charges demande que le NSIS soit le seul canal de distribution : tout ce qui n’existait que pour le MSI a donc été supprimé, et rien d’autre.

| Élément retiré | Fichier | Raison |
| --- | --- | --- |
| `"msi"` dans `bundle.targets` | `src-tauri/tauri.conf.json` | Le MSI n’est plus produit. |
| Bloc `bundle.windows.wix` (`language: fr-FR`, `bannerPath`, `dialogImagePath`) | `src-tauri/tauri.conf.json` | Cette configuration n’alimentait que le MSI. |
| `wix-banner.bmp` (493 × 58) | `src-tauri/windows/installer/` | Visuel utilisé uniquement par les dialogues WiX. |
| `wix-dialog.bmp` (493 × 312) | `src-tauri/windows/installer/` | Idem. |
| Fonctions `wix_banner()` et `wix_dialog()` | `src-tauri/windows/installer/render_assets.py` | Le générateur ne produit plus que les deux visuels NSIS. |
| Étape de test de fumée MSI (`msiexec /i`, `msiexec /x`, nettoyage HKCU associé) | `.github/workflows/release.yml` | Testait un paquet qui n’existe plus. |
| Glob `*.msi` de signature Authenticode | `.github/workflows/release.yml` | Aucun `.msi` à signer. |
| Glob `*.msi` des empreintes `SHA256SUMS.txt` | `.github/workflows/release.yml` | Les sommes ne couvrent que les fichiers réellement distribués. |
| Glob `*.msi` de l’artefact `noto-windows-installers` | `.github/workflows/release.yml` | Idem. |
| Glob `*.msi` de la liste `files:` de la GitHub Release | `.github/workflows/release.yml` | `fail_on_unmatched_files` est actif : un glob sans fichier ferait échouer la publication. |
| Mention « MSI » dans les guides d’installation et de build | `README.md`, `INSTALLATION.md`, `docs/build-windows.md`, `docs/installation.md`, `CHANGELOG.md` | Les documents doivent décrire ce qui existe réellement. |
| Visuels WiX du dossier d’installateur | `src-tauri/windows/installer/README.md` | Documentation alignée sur le contenu réel du dossier. |

### Ce qui a été conservé et reste partagé

- Les visuels NSIS (`nsis-header.bmp`, `nsis-sidebar.bmp`) et leur générateur `render_assets.py`.
- La licence MIT du bundle, les icônes, les associations de fichiers, le mode d’installation par utilisateur.
- Le plugin NSIS fourni par Tauri, qui gère déjà la case « Supprimer les données de l’application » : c’est cette case explicite qui autorise la suppression des données locales, jamais la désinstallation seule.

### Conséquence pour les versions déjà publiées

La version `v0.1.0`, publiée avant ce changement, contient encore `Noto_0.1.0_x64_fr-FR.msi`. Ses pièces jointes n’ont pas été touchées : réécrire une release passée fausserait ses sommes de contrôle. Seul le texte descriptif de sa page a été complété à partir du `CHANGELOG.md`, car il ne contenait qu’une ligne de comparaison. Les versions suivantes ne publieront que l’installeur NSIS et `SHA256SUMS.txt`.
