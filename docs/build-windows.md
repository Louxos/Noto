# Build Windows

## Prérequis

- Windows 10 ou ultérieur
- Node.js 22
- Rust stable via rustup
- Build Tools Visual Studio (C++ Build Tools) et WebView2 Runtime, conformément aux prérequis Tauri 2

## Développement desktop

```powershell
npm ci
npm run tauri:dev
```

## Installateurs

```powershell
npm ci
npm run check
npm run tauri:build
```

Le bundle configuré produit NSIS (`.exe`) et MSI (`.msi`) sous `src-tauri/target/release/bundle/`. Le NSIS est en installation utilisateur, propose la désinstallation et crée l’entrée Menu Démarrer. Les associations de fichiers déclarent Noto dans « Ouvrir avec » sans remplacer le choix d’application par défaut.

Le workflow `.github/workflows/release.yml` utilise le même build sur `windows-latest`. La publication d’un tag `v*` ajoute les deux installateurs à la release GitHub.
