# Ajouter un viewer

1. Ajoutez ou vérifiez l’extension dans `getFileKind` de `src/lib/fileTypes.ts`.
2. Définissez le type MIME si le viewer crée une URL de Blob.
3. Ajoutez la lecture adaptée dans `loadBrowserFile` / `readDesktopPath` : texte en `content`, binaire en `bytes`.
4. Créez un composant dans `src/components/`. Il reçoit `OpenDocument` et ne doit pas ouvrir de chemin lui-même.
5. Branchez le composant dans `ViewerContent` (`src/App.tsx`). Chargez paresseusement les dépendances lourdes.
6. Ajoutez les extensions aux dialogues Windows si un filtre est utilisé, à `bundle.fileAssociations` et à la liste des formats du README.
7. Ajoutez des tests unitaires au parseur ou au détecteur, puis exécutez `npm run check` et `npm run build`.

## Sécurité et performances

- Traitez les octets des fichiers comme des entrées non fiables.
- N’exécutez pas le contenu d’un fichier et ne faites pas de requêtes réseau implicites.
- Créez puis révoquez les `blob:` URLs dans un effet React.
- Pour les fichiers volumineux, avertissez l’utilisateur avant de décoder ou de créer des milliers d’éléments DOM.
- Les erreurs du viewer doivent être expliquées en français, sans laisser la zone vide.
