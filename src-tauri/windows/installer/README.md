# Visuels de l’installeur Noto

Les deux bitmaps de ce dossier habillent l’unique installeur de Noto : l’installeur NSIS (`.exe`). La palette du projet y est reprise : encre `#292B3A`, violet `#7772D8`, surfaces claires et repères de confidentialité locale.

- `nsis-header.bmp` — bandeau NSIS, 150 × 57 px. Il porte le logo, le nom « Noto » et le slogan officiel « Vos fichiers, vos outils, un seul espace. » sur deux lignes, jamais tronqué.
- `nsis-sidebar.bmp` — panneau latéral NSIS, 164 × 314 px, affiché sur les écrans d’accueil et de fin. Il reprend le slogan complet « Noto. Vos fichiers, vos outils, un seul espace. » ainsi que la mention « Traitement local : rien n’est envoyé en ligne. ».
- `render_assets.py` — source reproductible des bitmaps ; régénération avec Pillow : `python -m pip install Pillow && python render_assets.py`.
- `hooks.nsh` — crochets NSIS (`installerHooks`) : vérification réelle de l’installation, icônes par type de fichier (`DefaultIcon` de chaque classe, plus notification `SHChangeNotify`), reprise des sauvegardes d’association des extensions qui changent de classe, confirmation explicite avant désinstallation, aucun dialogue en mode silencieux.
- `../icons/filetypes/` — 21 icônes `.ico` (7 tailles chacune) livrées dans `$INSTDIR\filetypes` par `bundle.resources`, générées par `generate_filetype_icons.py` et documentées dans [`docs/icons-fichiers.md`](../../docs/icons-fichiers.md).

Le parcours reste sans élévation (`installMode: "currentUser"`), en français. Il présente la licence MIT, le choix du dossier d’installation et du dossier du menu Démarrer, puis propose, sur l’écran final, de créer un raccourci Bureau et de lancer Noto. Les associations « Ouvrir avec » ne remplacent pas l’application par défaut de l’utilisateur.

Le paquet MSI a été retiré : les anciens visuels WiX (`wix-banner.bmp`, `wix-dialog.bmp`) et leur code de génération ne sont plus conservés, car plus aucun build ne les utilisait. Le NSIS est le seul installeur produit par `npm run tauri:build`.
