# Architecture de Noto

Noto est une application locale composée d’une interface React/Vite et d’un shell Tauri 2. L’interface peut aussi être lancée dans un navigateur ; les accès système restent derrière les sélecteurs explicites.

## Couches

- `src/App.tsx` orchestre onglets, récents, groupes, menus applicatifs et contextuels, éditeur, recherche, paramètres et opérations de fichiers.
- `src/components/WorkspaceTools.tsx` regroupe menus, menu contextuel accessible, palette, dialogues de groupes et aide des raccourcis.
- `src/components/` contient les viewers dédiés ; ils reçoivent un modèle `OpenDocument` et n’ouvrent pas eux-mêmes de chemins. `NotebookScreen.tsx` gère la bibliothèque locale, les sections, les pages et les suppressions ; `NotebookEditor.tsx` fournit les modes riche, Markdown et aperçu.
- `src/lib/notebookModel.ts` valide la hiérarchie et les chemins du manifeste ; `src/lib/notebooks.ts` enregistre les pages en Markdown et les pièces jointes dans les dossiers choisis.
- `src/lib/fileTypes.ts` classe les extensions, libellés, MIME et langages.
- `src/lib/files.ts` charge les documents via Tauri ou File API, impose les limites de taille et enregistre le texte éditable.
- `src/lib/fileOperations.ts` effectue renommage/déplacement uniquement dans le shell desktop, après sélection utilisateur et extension temporaire du scope Tauri.
- `src/lib/archiveReader.ts` extrait les chaînes XML/images des formats PPTX, ODP, DOCX, ODT et EPUB en mémoire avec limites par entrée et totales ; RTF est converti en texte. Aucun élément Office n’est exécuté.
- `src/lib/csv.ts`, `src/lib/highlighting.ts`, `src/lib/security.ts` et `src/lib/textFormat.ts` centralisent parsing CSV, coloration, règles de sécurité et formatage.
- `src/lib/preferences.ts`, `src/lib/groups.ts` et `src/lib/session.ts` stockent localement les préférences, références de groupes et, si activée, les chemins de session (sans contenu de document). `src/lib/drafts.ts` conserve séparément les brouillons texte uniquement sur activation explicite, avec rétention et plafonds de taille.
- `src-tauri/` contient le shell, les commandes d’accès au scope, les permissions et associations Windows.

## Flux d’ouverture et de lecture

1. L’utilisateur choisit, dépose ou passe un fichier à Noto.
2. L’extension sélectionne le viewer. Les types inconnus sont distingués du texte probable en inspectant un échantillon.
3. Le contenu est lu localement en mémoire ; les textes volumineux sont avertis ou tronqués, les binaires volumineux demandent confirmation.
4. Les archives bureautiques sont filtrées pendant la décompression : seuls les XML et images raster utiles sont lus, avec plafonds de taille. Les diaporamas sont reconstruits de façon simplifiée, les documents bureautiques sont en lecture seule.
5. L’édition ne s’applique qu’aux familles texte annoncées ; l’enregistrement est explicite et détecte les changements externes lorsque métadonnées système sont disponibles.

## Éditeur

`TextEditor` utilise un unique `<textarea>` visible : aucun calque de texte transparent ne peut désaligner le caret du texte affiché. Le code garde la coloration syntaxique dans le viewer de lecture ; l’éditeur priorise la correspondance exacte entre clic, sélection et curseur. Le gutter suit le défilement vertical. Tabulation, indentation et remplacement restaurent explicitement le point d’insertion. Les pages de carnets utilisent `NotebookEditor` (Tiptap + Markdown) et sont écrites comme fichiers `.md` dans leur dossier ; le manifeste local conserve les sections et la hiérarchie sans remplacer le contenu des pages par une base interne.

## Shell et sécurité

Les permissions Tauri activent seulement les dialogues, lecture/écriture, création/suppression, métadonnées et opérations de renommage nécessaires. À l’ouverture, le shell accorde le scope au fichier sélectionné ; pour déplacer, le dossier choisi est accordé au scope non récursif. Pour un carnet, le scope récursif est limité au dossier explicitement choisi par l’utilisateur ; créer un carnet dans un dossier parent ne donne pas à Noto un accès récursif à ses autres fichiers. Les documents HTML sont sandboxés et soumis à une CSP sans scripts ni réseau. Le Markdown ne rend pas de HTML brut.

L’ouverture d’une archive n’écrit aucun fichier sur disque. Les chemins d’archives ne sont jamais extraits vers le système de fichiers. Macros, scripts et objets actifs ne sont pas lancés. Les menus de fichiers limitent les opérations destructrices aux fichiers desktop sélectionnés ; les groupes restent de simples références.

## Développement et vérifications

- `npm run check` : TypeScript et tests unitaires.
- `npm run build` : bundle web.
- `npm run tauri:dev` / `npm run tauri:build` : shell et installateurs Windows sur une machine avec la toolchain Tauri.

Les tests couvrent les parseurs, détection des formats, archives/RTF simples, groupes, préférences et sécurité. Les interactions clavier et les builds de packages Windows doivent aussi être validés sur Windows avant publication stable.
