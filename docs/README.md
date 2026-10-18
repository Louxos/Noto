# Documentation Noto

Toute la documentation de référence vit dans `docs/`. Ce fichier en est l’index : chaque document y figure avec ce qu’il couvre réellement. Les liens sont vérifiés par un test (`src/lib/docsIntegrity.test.ts`), pas seulement à la main.

## Utiliser Noto

- [Guide utilisateur](user-guide.md) — ouvrir, lire, éditer, enregistrer, imprimer, mesurer, liens et sections, raccourcis, limites de chaque format.
- [L’atelier](atelier.md) — l’espace de traitement local : accès, trois colonnes, familles d’outils, niveaux de prise en charge, rapports, réseau et confidentialité.
- [Recherche indexée locale](local-search.md) — index à la demande, limites de parcours, persistance locale et effacement.
- [Langues de l’interface](language.md) — état réel des catalogues français/anglais et règles d’ajout de chaînes.
- [Mises à jour](update-check.md) — vérification manuelle actuelle et prérequis d’un futur updater Tauri signé.
- [Icônes par type de fichier sous Windows](icons-fichiers.md) — fonctionnement, table des 21 classes, limites, régénération des `.ico`.
- [Installation et téléchargement Windows](installation.md) — release publiée, vérification SHA-256, build de test, construction depuis le dépôt, dépannage.
- [Signer l’installeur Windows](release-signing.md) — secrets d’Actions attendus, vérification Authenticode et configuration sécurisée.

## Développer

- [Architecture](architecture.md) — couches, flux d’ouverture, moteurs, shell Tauri.
- [Ajouter un viewer](adding-a-viewer.md) — étapes d’intégration d’un nouveau format, règles de sécurité.
- [Build Windows](build-windows.md) — prérequis, développement desktop, installeur NSIS.
- [Contribuer](contributing.md) — environnement, vérifications avant pull request, principes.
- [Tests et vérifications](tests.md) — commandes, ce qui est réellement vérifié, ce qui ne peut l’être que sous Windows, couverture.

## Suivi, sécurité et historique

- [Politique de sécurité](security.md) — modèle de sécurité détaillé de l’application ; la politique publique (versions prises en charge, signalement, périmètre) est dans [`../SECURITY.md`](../SECURITY.md).
- [Inventaire des fonctionnalités et audit de suppression du MSI](inventaire-et-migration.md) — état daté du passage à l’installeur NSIS unique, conservé comme trace vérifiable.
- [Feuille de route](../ROADMAP.md) — uniquement les travaux non terminés et les validations restantes.
- [Journal des changements](../CHANGELOG.md) — ce qui a changé, version par version.
- [Rapport d’exécution](../RAPPORT.md) — ce qui est livré et vérifié, ce qui reste partiel, commandes et résultats.
- [Cahier des charges d’origine](cahier-des-charges.md) — le texte qui a piloté l’évolution de Noto, conservé tel quel (il ne décrit pas l’état courant).

## Fichiers de la racine

| Fichier | Rôle |
| --- | --- |
| [`README.md`](../README.md) | Présentation, fonctionnalités, formats, développement. |
| [`INSTALLATION.md`](../INSTALLATION.md) | Raccourci vers [installation.md](installation.md). |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Guide de contribution ; la référence détaillée est [contributing.md](contributing.md). |
| [`SECURITY.md`](../SECURITY.md) | Politique de sécurité publique. |
| [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) | Règles de conduite. |
| [`CHANGELOG.md`](../CHANGELOG.md), [`ROADMAP.md`](../ROADMAP.md), [`RAPPORT.md`](../RAPPORT.md) | Journal des changements, travaux restants, rapport d’exécution. |
| [`LICENSE`](../LICENSE) | Licence MIT. |
| [`examples/`](../examples) | Fichiers d’essai : Markdown, CSV, JSON, HTML (dont un script volontairement bloqué par le bac à sable). |
