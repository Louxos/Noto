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

L’unique workflow `.github/workflows/release.yml` (**Windows installers**) exécute les vérifications, construit NSIS et MSI sur `windows-latest`, puis publie l’artefact téléchargeable `noto-windows-installers` sur les pushes `main` et `arena/**` ainsi que lors d’un lancement manuel. C’est le workflow à utiliser pour récupérer directement les installateurs de test. Un tag `v*` ajoute aussi les installateurs et `SHA256SUMS.txt` à la release GitHub ; la page Releases est actuellement vide.
