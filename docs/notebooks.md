# Carnets locaux

Les carnets complètent le visualiseur de fichiers de Noto : ils ne le remplacent pas. Les fichiers déjà ouverts restent dans leurs onglets, tandis que les carnets sont gérés depuis **Carnets** dans la barre latérale. Plusieurs dossiers de carnets peuvent être conservés dans la bibliothèque locale et ouverts à tour de rôle.

La gestion des carnets nécessite l’application de bureau Noto, car elle utilise les sélecteurs natifs et le scope de fichiers Tauri. Le navigateur n’a pas de permission portable permettant de créer et de gérer ces dossiers.

## Créer ou ouvrir un carnet

- **Nouveau carnet** demande un dossier parent et crée un nouveau dossier de carnet à l’intérieur.
- **Ouvrir un dossier…** permet de choisir un dossier existant. Si ce dossier n’a pas encore de métadonnées Noto, une confirmation est demandée avant de l’initialiser. L’initialisation ajoute les fichiers et sous-dossiers nécessaires sans remplacer les autres fichiers présents.
- La bibliothèque mémorise localement le chemin du dossier pour permettre de rouvrir le carnet. Retirer un carnet de cette liste demande confirmation et **ne supprime pas son dossier**.

## Organisation et fichiers

Un carnet est un vrai dossier local. Sa structure est portable et lisible :

```text
Mon carnet/
├── .noto-notebook.json         # noms, sections et hiérarchie des pages
├── sections/
│   └── <identifiant-section>/
│       └── <titre>-<identifiant>.md
└── attachments/
    └── <identifiant-page>/
        └── <pièce-jointe>
```

Les sections et les pages/sous-pages sont indexées dans `.noto-notebook.json`. Chaque page est un fichier Markdown ordinaire enregistré dans `sections/`. Le texte est sauvegardé automatiquement sur disque après une courte pause de saisie. Une pièce jointe choisie est **copiée** dans le dossier `attachments/` : le fichier source n’est ni déplacé ni modifié. Les liens vers ces pièces jointes sont relatifs, ce qui permet de copier tout le dossier du carnet.

Une page peut être modifiée en mode riche, en source Markdown ou consultée dans l’aperçu. L’éditeur permet aussi d’ajouter une image/pièce jointe ou de créer un lien vers un fichier ouvert dans le visualiseur Noto. Un lien `noto-file:` référence le chemin local du fichier et peut donc devenir invalide si celui-ci est déplacé ; les pièces jointes copiées dans le carnet, elles, restent relatives.

## Suppression et conservation

La suppression d’une page ou d’une section ouvre un dialogue qui demande s’il faut garder ou supprimer les fichiers Markdown et pièces jointes concernés. Supprimer une page inclut ses sous-pages. Les fichiers sources ayant été copiés en pièces jointes restent toujours à leur emplacement d’origine. Aucune synchronisation cloud n’est activée : les pages, pièces jointes et chemins de carnets restent sur cet appareil.
