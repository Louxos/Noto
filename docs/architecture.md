# Architecture de Noto

Noto est une application locale composée d’une interface React/Vite et d’un shell Windows Tauri 2. L’interface peut aussi être lancée dans un navigateur pour le développement et la prévisualisation ; les accès système restent derrière les API de sélection de fichiers.

## Couches

- **`src/App.tsx`** orchestre les fichiers ouverts, les onglets, l’historique, la recherche, l’édition et les paramètres.
- **`src/components/`** contient les viewers dédiés. Chaque viewer reçoit des données en mémoire et ne lit pas lui-même le système de fichiers.
- **`src/lib/fileTypes.ts`** classe les extensions et fournit les libellés/langages.
- **`src/lib/files.ts`** adapte les dialogues Tauri ou les File API du navigateur, limite les aperçus texte volumineux et centralise l’enregistrement.
- **`src/lib/csv.ts`** parse le CSV en respectant les guillemets, les guillemets doublés et les retours de ligne embarqués.
- **`src/lib/security.ts`** prépare une politique restrictive pour les aperçus HTML isolés.
- **`src/lib/preferences.ts`** stocke les réglages et l’historique dans le stockage local du profil.
- **`src-tauri/`** fournit le shell desktop, les permissions minimales, l’ouverture par ligne de commande et la configuration d’installateur/associations.

## Flux d’ouverture

1. Un fichier est choisi via une boîte de dialogue, déposé dans la fenêtre ou passé à Noto par Windows.
2. L’extension sélectionne un viewer ; pour un format inconnu, un échantillon permet de distinguer du texte probable d’un contenu binaire.
3. Le contenu est lu localement. Les fichiers texte de plus de 8 Mo dans le navigateur sont proposés en aperçu partiel ; les fichiers lourds demandent confirmation.
4. Le viewer reçoit un modèle `OpenDocument`. Les modifications restent en mémoire jusqu’à la sauvegarde explicite.

## Shell et sécurité

Le shell n’ajoute ni compte ni service réseau. Les permissions Tauri couvrent les dialogues et la lecture/écriture des chemins choisis par l’utilisateur ; les ouvertures par association Windows et par glisser-déposer accordent au plugin FS un scope limité au fichier explicitement fourni. L’aperçu HTML utilise `sandbox=""` et une CSP qui interdit scripts, formulaires, plugins, connexions et ressources distantes. Le parseur Markdown ne traite pas le HTML brut et les images distantes ne sont pas chargées automatiquement.

## Tests et vérifications

`npm run check` exécute TypeScript et les tests unitaires des fonctions de parsing, de détection de formats et de sécurité. `npm run build` produit l’interface web. `npm run tauri:build` produit les installateurs Windows sur une machine configurée avec la toolchain Windows/Rust.
