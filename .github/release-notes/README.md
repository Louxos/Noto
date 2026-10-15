# Notes de version rédigées

Ce dossier contient les notes publiées sur la page GitHub Releases, une par tag.

## Convention

- Un fichier `vX.Y.Z.md` **exactement nommé comme le tag** (par exemple `v0.2.0.md`).
- Le workflow `Windows installers` cherche ce fichier au moment de publier :
  - s’il existe, ce sont **ces notes** qui sont publiées et les notes générées automatiquement par GitHub sont désactivées ;
  - sinon, GitHub génère les notes à partir des commits (liste brute : à éviter pour une vraie version).
- Le contenu suit le modèle des notes `v0.2.0` : phrase d’introduction, points forts, installeur, téléchargements, vérification SHA-256, signature (jamais revendiquée à tort), configuration requise, limites connues, traçabilité, liens.

## Corriger une page déjà publiée

Une note publiée peut être mise à jour sans retoucher les fichiers joints :

```bash
gh release edit v0.2.0 --title "Noto 0.2.0 — atelier documentaire local" --notes-file .github/release-notes/v0.2.0.md
```

`gh release edit` ne modifie ni les binaires ni leurs sommes : ne réécrivez jamais une version passée au point de changer les fichiers qu’elle contient.
