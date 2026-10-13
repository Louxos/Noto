# Visuels de l’installateur Noto

Les bitmaps de ce dossier habillent les installateurs NSIS (`.exe`) et WiX (`.msi`) avec la palette du projet : encre `#292B3A`, violet `#7772D8`, surfaces claires et repères de confidentialité locale.

- `nsis-header.bmp` — bandeau NSIS, 150 × 57 px.
- `nsis-sidebar.bmp` — panneaux Bienvenue et Terminé NSIS, 164 × 314 px.
- `wix-banner.bmp` — bandeau WiX, 493 × 58 px.
- `wix-dialog.bmp` — visuel des dialogues d’accueil et de fin WiX, 493 × 312 px.
- `render_assets.py` — source reproductible des bitmaps ; régénération avec Pillow : `python render_assets.py`.

Le parcours reste sans élévation par défaut (`currentUser`). Il présente la licence MIT et le choix du dossier d’installation et du dossier du menu Démarrer. NSIS propose également, sur l’écran final, de créer un raccourci Bureau et de lancer Noto. Les associations « Ouvrir avec » ne remplacent pas l’application par défaut de l’utilisateur.
