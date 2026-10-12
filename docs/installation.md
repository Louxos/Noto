# Guide d’installation de Noto

Ce guide explique comment installer Noto sur Windows, récupérer un build de test depuis GitHub Actions, ou construire l’application depuis le dépôt. **Vous n’avez pas besoin de Node.js, Rust ni Visual Studio pour installer un binaire déjà construit.**

> **État vérifié le 8 octobre 2026 :** la page [Releases](https://github.com/Louxos/Noto/releases) est vide, donc il n’y a pas encore de release officielle. Le dépôt utilise un seul workflow GitHub Actions, **Windows installers**, qui regroupe les vérifications front-end et la construction des installateurs Windows. Pour un build de test, il publie l’artefact `noto-windows-installers` et un fichier `SHA256SUMS.txt` sur les branches `arena/**` ; le build Windows s’exécute aussi pour un tag `v*` ou un lancement manuel. La signature Authenticode est facultative et n’est activée que si les secrets du certificat sont configurés ; sinon, les installateurs restent non signés. Les artefacts de test sont conservés 30 jours. Les exécutions récentes sont listées sur la page [Windows installers](https://github.com/Louxos/Noto/actions/workflows/release.yml).

## 1. Installer Noto — utilisateur Windows

### Configuration requise

- Windows 10 version 1803 ou ultérieure, ou Windows 11. Les builds CI visent Windows x64 ; les autres architectures ne sont pas validées pour l’instant.
- Microsoft Edge WebView2 Runtime. Il est généralement déjà présent sur les versions récentes de Windows. S’il manque, installez le runtime Evergreen depuis le [site officiel de Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).
- Une connexion Internet peut être nécessaire si WebView2 doit être installé pendant l’installation de Noto.

### Télécharger et lancer le build de test

1. Ouvrez les [exécutions de l’unique workflow **Windows installers**](https://github.com/Louxos/Noto/actions/workflows/release.yml) et choisissez le succès le plus récent sur la branche `arena/01a10cf9-noto`, avec les vérifications front-end et le job Windows réussis.
2. Dans la section **Artifacts** de cette exécution, téléchargez `noto-windows-installers`, puis décompressez l’archive ZIP.
3. Vérifiez les sommes si vous le souhaitez. `SHA256SUMS.txt` donne le hash de chaque fichier `.exe`/`.msi`. Depuis PowerShell, dans le dossier décompressé :
   ```powershell
   $root = (Get-Location).Path
   Get-Content .\SHA256SUMS.txt | ForEach-Object {
     if ($_ -notmatch '^([0-9a-fA-F]{64})  (.+)$') { throw "Ligne de somme invalide : $_" }
     $expected = $Matches[1].ToLowerInvariant()
     $name = $Matches[2]
     $file = Get-ChildItem -Path $root -Recurse -File | Where-Object { $_.Name -eq $name } | Select-Object -First 1
     if (-not $file) { throw "Fichier absent : $name" }
     $actual = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
     if ($actual -ne $expected) { throw "Somme SHA-256 incorrecte : $name" }
     Write-Host "OK $name"
   }
   ```
4. Lancez le fichier `.exe` NSIS (recommandé pour le parcours Noto complet) et suivez l’assistant. Il présente la licence MIT, vous laisse choisir le dossier d’installation et le dossier du menu Démarrer, puis propose un raccourci Bureau et le lancement de Noto. Il est configuré pour l’utilisateur courant et ne devrait pas demander de droits administrateur. Le `.msi` est une alternative avec les mêmes visuels Noto.
5. Lancez **Noto** depuis le menu Démarrer.
6. Pour supprimer Noto, utilisez **Paramètres Windows → Applications → Applications installées**, ou l’entrée de désinstallation de Noto dans le menu Démarrer.

Cet artefact est un build de test de la branche de travail, pas une release stable. Il peut rester non signé si aucun certificat des mainteneurs n’est configuré ; SmartScreen peut aussi avertir pour une application signée dont la réputation est encore faible. Vérifiez que le téléchargement vient bien du dépôt officiel `Louxos/Noto` et comparez la somme SHA-256 avant de décider de l’exécuter. Les versions stables seront publiées sur la page [Releases](https://github.com/Louxos/Noto/releases) après validation.

### Ouvrir des fichiers avec Noto

Noto est déclaré comme application compatible avec les formats pris en charge. Depuis l’Explorateur, choisissez **Ouvrir avec → Noto**. Windows garde le contrôle de l’application par défaut : l’installation de Noto ne doit pas remplacer votre choix actuel. Vous pouvez choisir « Toujours utiliser cette application » dans Windows si vous le souhaitez.

Les fichiers récents et les préférences sont stockés localement sur l’appareil. Noto ne synchronise pas vos documents et ne propose pas de mise à jour automatique ; pour mettre à jour l’application, installez un nouveau build ou une release.

## 2. Construire Noto depuis le dépôt

Cette procédure est destinée aux développeurs qui veulent lancer la fenêtre Tauri ou produire eux-mêmes les installateurs Windows.

### Prérequis de développement

1. **Windows 10/11 x64** recommandé. Les builds `.exe` et `.msi` configurés ici sont des bundles Windows.
2. **Node.js 22.12 ou ultérieur** et npm. Installer Node depuis [nodejs.org](https://nodejs.org/). La version 22 est celle utilisée par la CI.
3. **Rust stable avec la toolchain MSVC**, installé avec [rustup](https://rustup.rs/). Après l’installation ou dans un terminal Windows :
   ```powershell
   rustup default stable-msvc
   rustc --version
   cargo --version
   ```
4. **Microsoft C++ Build Tools**. Dans Visual Studio Installer, sélectionnez la charge de travail **Développement Desktop en C++** (*Desktop development with C++*) et le Windows SDK. Le Visual Studio complet n’est pas obligatoire ; les Build Tools suffisent.
5. **Microsoft Edge WebView2 Runtime**, nécessaire à l’affichage de la fenêtre de bureau. Consultez la section précédente si le runtime n’est pas présent.
6. Pour compiler le MSI, la fonctionnalité Windows facultative **VBScript** doit être activée sur les machines où elle est désactivée. Elle est activée par défaut sur la plupart des installations Windows.

Les outils officiels et les prérequis Tauri sont détaillés dans la [documentation Tauri pour Windows](https://v2.tauri.app/start/prerequisites/).

### Récupérer le code et installer les dépendances

Dans PowerShell :

```powershell
git clone --branch arena/01a10cf9-noto https://github.com/Louxos/Noto.git
cd Noto
npm ci
```

`npm ci` installe exactement les versions enregistrées dans `package-lock.json`. La première compilation Rust peut également télécharger des crates ; une connexion Internet est donc nécessaire lors de la première préparation de l’environnement.

### Lancer Noto en développement

Pour prévisualiser l’interface web seulement, sans compiler le shell Windows :

```powershell
npm run dev
```

Ouvrez ensuite `http://localhost:1420` dans un navigateur. Les accès aux fichiers passent par le sélecteur de fichiers du navigateur ou le glisser-déposer.

Pour démarrer l’application dans sa véritable fenêtre Tauri :

```powershell
npm run tauri:dev
```

### Vérifier le projet et produire les installateurs

```powershell
npm run check
npm run build
npm run tauri:build
```

La dernière commande produit les bundles configurés dans `src-tauri/target/release/bundle/` :

- NSIS : `src-tauri/target/release/bundle/nsis/*.exe`
- MSI : `src-tauri/target/release/bundle/msi/*.msi`

Exécutez l’un des installateurs générés pour tester l’installation et la désinstallation sur Windows. Vérifiez également l’ouverture par **Ouvrir avec**, le choix de l’application par défaut et l’ouverture d’un fichier de chaque famille importante.

### Publier une release

L’unique workflow `.github/workflows/release.yml` (**Windows installers**) exécute les vérifications front-end et, pour les pushes sur `arena/**`, construit les installateurs sur `windows-latest`, puis publie l’artefact temporaire `noto-windows-installers` avec les fichiers `.exe`, `.msi` et `SHA256SUMS.txt` (conservation de 30 jours). Les sommes sont calculées après la signature éventuelle afin de couvrir exactement les fichiers distribués. Les pull requests vers `main` et les pushes sur `main` exécutent uniquement les vérifications front-end. Un tag `v*` déclenche aussi le build Windows et attache les installateurs et le fichier de sommes à la release GitHub ; le build Windows peut également être lancé manuellement.

Pour signer les builds, les mainteneurs peuvent définir les secrets GitHub Actions `NOTO_WINDOWS_SIGNING_CERTIFICATE_BASE64` (certificat de signature de code PFX encodé en base64) et `NOTO_WINDOWS_SIGNING_CERTIFICATE_PASSWORD`. Si les deux sont absents, le workflow saute la signature ; si un seul manque ou si la signature/sa vérification échoue, le build échoue au lieu de publier un installateur dont le statut serait ambigu. Le fichier PFX n’est écrit que temporairement sur l’agent Windows, puis supprimé. Une signature valide n’élimine pas nécessairement SmartScreen : la réputation de l’éditeur se construit dans le temps.

Avant une release, mettez à jour la version de façon cohérente dans :

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `CHANGELOG.md`

Puis créez et poussez le tag correspondant depuis la branche de release :

```powershell
git tag v0.2.0
git push origin v0.2.0
```

Après le succès du workflow, les fichiers `.exe`, `.msi` et `SHA256SUMS.txt` sont attachés à la release GitHub.

## Dépannage

| Problème | À vérifier |
| --- | --- |
| `cargo` ou `rustc` introuvable | Installez Rust avec rustup, sélectionnez `stable-msvc`, puis fermez et rouvrez PowerShell. |
| Erreur `link.exe`, MSVC ou SDK | Dans Visual Studio Installer, ajoutez **Développement Desktop en C++** et le Windows SDK. |
| Erreur WebView2 au démarrage | Installez le WebView2 Evergreen Runtime depuis le site officiel de Microsoft, puis relancez Noto. |
| Échec MSI autour de `light.exe` | Activez la fonctionnalité Windows facultative **VBScript**, puis relancez le build. |
| `npm ci` échoue | Vérifiez Node.js 22, l’accès réseau au registre npm et que `package-lock.json` n’a pas été modifié sans `package.json`. |
| SmartScreen avertit ou l’éditeur est inconnu | Vérifiez la provenance officielle, validez le hash avec `SHA256SUMS.txt`, puis contrôlez si le build a été signé. Une signature n’assure pas immédiatement une réputation SmartScreen établie. |
