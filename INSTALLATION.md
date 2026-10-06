# Guide d’installation de Noto

Ce guide couvre les deux cas : installer une version publiée de Noto sur Windows, ou construire l’application depuis le dépôt. **Pour installer une release, Node.js, Rust et Visual Studio ne sont pas nécessaires.** Ces outils ne sont requis que pour le développement et la génération des installateurs.

La génération des releases est configurée, mais aucun installateur Windows n’a encore été publié. Si la page Releases ne propose pas de binaire, utilisez la procédure de build local plus bas.

## 1. Installer Noto — utilisateur Windows

### Configuration requise

- Windows 10 version 1803 ou ultérieure, ou Windows 11. Le build publié par la CI vise Windows x64 ; les autres architectures ne sont pas validées pour l’instant.
- Microsoft Edge WebView2 Runtime. Il est généralement déjà présent sur les versions récentes de Windows. S’il manque, installez le runtime Evergreen depuis le [site officiel de Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).
- Une connexion Internet peut être nécessaire si WebView2 doit être installé pendant l’installation de Noto.

### Installation avec l’installateur `.exe`

1. Ouvrez la page [Releases de Noto](https://github.com/Louxos/Noto/releases) et téléchargez l’installateur `.exe` de la version souhaitée.
2. Double-cliquez sur le fichier téléchargé et suivez l’assistant. L’installateur NSIS est configuré pour l’utilisateur courant : il ne devrait pas demander de droits administrateur.
3. Lancez **Noto** depuis le menu Démarrer.
4. Pour supprimer Noto, utilisez **Paramètres Windows → Applications → Applications installées**, ou l’entrée de désinstallation de Noto dans le menu Démarrer.

Si Windows affiche un avertissement SmartScreen, vérifiez que le fichier provient bien de la page Releases officielle avant de décider de l’exécuter. Les builds actuels ne sont pas signés numériquement.

### Installation avec le `.msi`

Le package MSI est une alternative à l’installateur `.exe`. Téléchargez-le depuis la même page Releases, ouvrez-le et suivez l’assistant Windows Installer. Windows peut demander une confirmation ou des droits supplémentaires selon la configuration de la machine.

### Ouvrir des fichiers avec Noto

Noto est déclaré comme application compatible avec les formats pris en charge. Depuis l’Explorateur, choisissez **Ouvrir avec → Noto**. Windows garde le contrôle de l’application par défaut : l’installation de Noto ne doit pas remplacer votre choix actuel. Vous pouvez choisir « Toujours utiliser cette application » dans Windows si vous le souhaitez.

Les fichiers récents et les préférences sont stockés localement sur l’appareil. Noto ne synchronise pas vos documents et ne propose pas de mise à jour automatique ; pour mettre à jour l’application, installez une nouvelle release.

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

Le workflow `.github/workflows/release.yml` construit les installateurs sur `windows-latest` lorsqu’un tag `v*` est poussé. Avant une nouvelle release, mettez à jour la version de façon cohérente dans :

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `CHANGELOG.md`

Puis créez et poussez le tag correspondant depuis la branche de release :

```powershell
git tag v0.2.0
git push origin v0.2.0
```

Après le succès du workflow, les fichiers `.exe` et `.msi` sont attachés à la release GitHub.

## Dépannage

| Problème | À vérifier |
| --- | --- |
| `cargo` ou `rustc` introuvable | Installez Rust avec rustup, sélectionnez `stable-msvc`, puis fermez et rouvrez PowerShell. |
| Erreur `link.exe`, MSVC ou SDK | Dans Visual Studio Installer, ajoutez **Développement Desktop en C++** et le Windows SDK. |
| Erreur WebView2 au démarrage | Installez le WebView2 Evergreen Runtime depuis le site officiel de Microsoft, puis relancez Noto. |
| Échec MSI autour de `light.exe` | Activez la fonctionnalité Windows facultative **VBScript**, puis relancez le build. |
| `npm ci` échoue | Vérifiez Node.js 22, l’accès réseau au registre npm et que `package-lock.json` n’a pas été modifié sans `package.json`. |
| Windows signale que l’éditeur est inconnu | Les builds actuels ne sont pas signés. Vérifiez l’origine du téléchargement dans la page Releases officielle. |
