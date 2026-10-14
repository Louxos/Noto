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

Le bundle configuré produit un unique installeur NSIS (`.exe`) sous `src-tauri/target/release/bundle/nsis/`. Le paquet MSI n’est plus généré : `bundle.targets` ne contient que `nsis` et l’entrée WiX a été retirée de `tauri.conf.json`. Toutes les anciennes options WiX sont supprimées du dépôt, y compris les visuels `wix-banner.bmp` et `wix-dialog.bmp` qui n’étaient utilisés que par le MSI.

L’installeur NSIS est en français (`languages: ["French"]`), en installation par utilisateur (`currentUser`, donc sans élévation ni droits administrateur) et en compression LZMA. Le parcours présente la licence MIT, laisse choisir le dossier d’installation et le dossier du menu Démarrer, puis propose de créer un raccourci Bureau et de lancer Noto. L’écran d’accueil et le panneau latéral portent le logo, le nom et le slogan officiel « Noto. Vos fichiers, vos outils, un seul espace. ».

Deux crochets NSIS (`src-tauri/windows/installer/hooks.nsh`, déclarés par `bundle.windows.nsis.installerHooks`) encadrent l’installation :
- après l’installation, Noto vérifie que `Noto.exe` et le désinstalleur sont réellement présents ; sinon l’installeur se termine en **erreur** (`SetErrors`) au lieu d’afficher un succès trompeur ;
- avant la désinstallation, une confirmation rappelle que les documents, groupes, brouillons et préférences sont conservés ; la case « Supprimer les données de l’application » reste le seul moyen explicite de les effacer.
Aucune boîte de dialogue n’est affichée en mode silencieux (`/S`) : les déploiements automatisés et la CI ne peuvent pas rester bloqués.

Les fichiers `src-tauri/windows/installer/*.bmp` adaptent le bandeau et le panneau d’accueil à la palette Noto. Le script `render_assets.py` permet de les régénérer avec Pillow. Les associations de fichiers déclarent Noto dans **Ouvrir avec** sans remplacer le choix d’application par défaut.

L’unique workflow `.github/workflows/release.yml` (**Windows installers**) exécute les vérifications et les tests de fumée, construit l’installeur NSIS sur `windows-latest`, puis publie l’artefact temporaire `noto-windows-installers` sur les pushes `main` et `arena/**` ainsi que lors d’un lancement manuel. Cet artefact ZIP est destiné aux essais des builds de branche. Le test de fumée installe réellement l’installeur en mode silencieux, vérifie que `Noto.exe` est présent, ouvre un fichier d’exemple, lance la désinstallation et contrôle qu’il ne reste ni fichier ni association. Pour distribuer une version aux utilisateurs, poussez un tag `vX.Y.Z` : le workflow crée une GitHub Release et joint séparément le `.exe` et `SHA256SUMS.txt`. Si `.github/release-notes/<tag>.md` existe, ce sont ces notes rédigées qui sont publiées et les notes générées par GitHub sont désactivées ; sinon le workflow retombe sur les notes générées. Les tags avec suffixe (`-rc.1`, par exemple) deviennent des préversions et ne remplacent pas la dernière version stable.
