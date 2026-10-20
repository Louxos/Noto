# Contribuer à Noto

Merci de votre intérêt pour Noto. Cette page est le point d’entrée pour GitHub ; la référence détaillée est [`docs/contributing.md`](docs/contributing.md), l’architecture est décrite dans [`docs/architecture.md`](docs/architecture.md).

## Environnement

- **Node.js 22** (voir `.nvmrc`) et npm.
- **Rust stable** et les prérequis Tauri 2, uniquement pour tester la fenêtre de bureau.
- Windows est la cible principale : l’installeur NSIS et les commandes natives ne se vérifient que là (ou en intégration continue).

```bash
git clone https://github.com/Louxos/Noto.git
cd Noto
npm ci
npm run dev
```

## Commandes de vérification

| Commande | Ce qu’elle fait |
| --- | --- |
| `npm run lint` | Analyse statique ESLint (erreurs réelles, pas de style imposé). |
| `npm run check` | Types TypeScript (`tsc -b`) puis tous les tests. |
| `npm run coverage` | Tests avec rapport de couverture dans `coverage/`. |
| `npm run build` | Construction de l’interface web dans `dist/`. |
| `npm run verify` | Les trois vérifications obligatoires, dans l’ordre. |
| `npm run tauri:build` | Installeur NSIS (Windows uniquement). |

Une contribution n’est prête que si `npm run verify` passe. Les tests doivent vérifier des **artefacts réels** (le contenu d’un PDF produit, un fichier DOCX dézippé, les octets d’une image), pas seulement l’absence d’exception.

## Principes à respecter

1. **Local et privé** : aucune donnée de document ne quitte l’appareil, aucun service payant, aucune télémétrie. Toute connexion éventuelle est affichée et soumise à un accord explicite.
2. **Pas d’interface factice** : aucun bouton décoratif, aucun résultat simulé, aucune barre de progression inventée. Une fonction n’est annoncée que lorsqu’elle traite réellement les fichiers et affiche ses erreurs.
3. **Dire ce qui est vrai** : les limites sont écrites dans l’interface et dans la documentation. Un format produit est vérifié avant d’être annoncé.
4. **Préserver l’existant** : les fonctionnalités en place ne sont ni supprimées ni réécrites sans raison forte.
5. **Modules plutôt que gros composants** : la logique de traitement vit dans `src/lib/`, l’interface consomme des modules testés.

## Pull requests

- Décrivez le problème résolu, ce qui change pour l’utilisateur et les vérifications exécutées.
- Un changement d’interface s’accompagne d’une capture réelle lorsque c’est possible.
- Les commits restent lisibles ; le modèle de PR rappelle ces points.
- Pour une faille de sécurité, n’ouvrez pas d’issue publique : suivez [`SECURITY.md`](SECURITY.md).

## Licence

En proposant une contribution, vous acceptez qu’elle soit distribuée sous la licence MIT du projet.
