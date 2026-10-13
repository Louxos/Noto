# Ajouter un viewer

1. Ajoutez l’extension dans `src/lib/fileTypes.ts` et écrivez un test de classification.
2. Définissez le MIME si le viewer crée une URL Blob ; vérifiez également le chemin d’ouverture navigateur/desktop dans `src/lib/files.ts`.
3. Créez le composant dans `src/components/`. Il reçoit `OpenDocument` et ne lit jamais directement un chemin système.
4. Branchez-le dans `ViewerContent` (`src/App.tsx`) et chargez paresseusement les dépendances lourdes.
5. Ajoutez ses actions au menu contextuel du viewer, en réutilisant `ContextMenu` et les actions fichier communes si nécessaire.
6. Pour les archives, ne les extrayez pas sur disque : sélectionnez uniquement les entrées requises, vérifiez les chemins, plafonnez les tailles décompressées et traitez le XML/texte comme une entrée non fiable.
7. Actualisez les associations Tauri dans `src-tauri/tauri.conf.json`, puis la liste des formats dans `README.md` et `docs/user-guide.md`.
8. Ajoutez des tests au parseur/détecteur, puis exécutez `npm run check` et `npm run build`.

## Sécurité et performances

- N’exécutez pas le contenu d’un fichier et ne faites pas de requêtes réseau implicites.
- Créez puis révoquez les URL `blob:` dans un effet React.
- Pour les formats compressés, résistez aux bombes de décompression et refusez les fichiers surdimensionnés.
- Pour les fichiers volumineux, avertissez l’utilisateur avant de décoder ou de créer des milliers d’éléments DOM.
- Les erreurs du viewer doivent être expliquées en français, sans laisser la zone vide.
