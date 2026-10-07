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

Le bundle configuré produit NSIS (`.exe`) et MSI (`.msi`) sous `src-tauri/target/release/bundle/`. Le NSIS reste en installation utilisateur sans élévation et crée l’entrée Menu Démarrer. Le parcours présente la licence MIT, laisse choisir les dossiers d’installation et du menu Démarrer, puis propose de créer un raccourci Bureau et de lancer Noto. Le MSI reprend la direction artistique via ses bannières WiX ; l’exécutable NSIS offre le parcours le plus riche.

Les fichiers `src-tauri/windows/installer/*.bmp` adaptent le bandeau et le panneau d’accueil à la palette Noto. Le script `render_assets.py` permet de les régénérer avec Pillow. Les associations de fichiers déclarent Noto dans **Ouvrir avec** sans remplacer le choix d’application par défaut.

Le workflow `.github/workflows/release.yml` (**Windows installers**) utilise le même build sur `windows-latest` et publie l’artefact temporaire `noto-windows-installers` sur les branches `arena/**`. C’est ce workflow qu’il faut utiliser pour télécharger un build Windows de test. Le workflow `.github/workflows/ci.yml` (**CI**) ne produit aucun installateur. La publication d’un tag `v*` ajoute les deux installateurs à la release GitHub ; la page Releases est actuellement vide.
