# Contribuer à Noto

Merci de contribuer à Noto. Le projet privilégie une ouverture rapide, une interface discrète et des comportements sûrs pour les fichiers locaux.

## Environnement

- Node.js 22 et npm
- Rust stable et les prérequis de Tauri 2 pour tester la fenêtre de bureau

```bash
npm ci
npm run dev
```

## Avant une pull request

```bash
npm run check
npm run build
```

Décrivez le problème résolu, les changements visibles et les tests effectués. Pour un changement d’interface, joignez une capture réelle si l’environnement le permet.

## Principes de contribution

- Garder l’application locale : pas de compte, de réseau applicatif, de synchronisation ou de télémétrie.
- Garder les permissions Tauri au minimum nécessaire.
- Isoler tout contenu fourni par un fichier ; ne jamais exécuter du HTML ou du code utilisateur.
- Préférer une dépendance petite et maintenue à une implémentation fragile, mais éviter les dépendances non nécessaires.
- Ajouter ou adapter les tests des parsers et des fonctions utilitaires.
- Conserver l’interface principale en français et utiliser les variables de thème existantes.
