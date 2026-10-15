# Icônes par type de fichier (Windows)

Dans l’Explorateur, un fichier `.md`, un `.pdf` et une photo affichent chacun leur propre icône : Noto n’impose plus son icône unique à tous les formats qu’il peut ouvrir.

## Comment cela fonctionne

Windows choisit l’image d’un fichier en lisant la valeur par défaut de la clé `DefaultIcon` de sa **classe de fichiers** :

```
HKCU\Software\Classes\
  .md                       → valeur par défaut : « Document Markdown »
  Document Markdown\
    DefaultIcon             → « C:\…\Noto\filetypes\md.ico »
    shell\open\command     → « C:\…\Noto\Noto.exe » « %1 »
```

Trois pièces doivent rester d’accord, et un test s’en assure à chaque vérification continue ([`src/lib/installerIcons.test.ts`](../src/lib/installerIcons.test.ts)) :

1. **`src-tauri/tauri.conf.json`** déclare les classes de fichiers (`bundle.fileAssociations`) et embarque le dossier d’icônes dans l’installeur (`bundle.resources` : `icons/filetypes` → `filetypes`).
2. **`src-tauri/icons/filetypes/*.ico`** contient les images livrées, produites par [`generate_filetype_icons.py`](../src-tauri/icons/filetypes/generate_filetype_icons.py).
3. **`src-tauri/windows/installer/hooks.nsh`** écrit, après la création des associations, la table classe → icône dans le registre, puis prévient l’Explorateur (`SHChangeNotify`).

Le gabarit NSIS de Tauri écrit `« Noto.exe,0 »` pour toutes les classes : le champ `icon` de `bundle.fileAssociations` n’est lu que par le gabarit MSI, retiré du projet. C’est pourquoi les icônes passent par un crochet d’installation, et non par ce champ.

## Table des classes

21 classes couvrent 126 extensions ; une classe reçoit une icône, donc chaque extension aussi.

| Classe de fichiers | Icône | Rôle | Extensions |
| --- | --- | --- | --- |
| **Document Markdown** | `md.ico` | Viewer | `.md` · `.markdown` · `.mdown` · `.mkd` |
| **Fichier texte** | `texte.ico` | Viewer | `.txt` · `.text` · `.log` · `.rst` · `.adoc` · `.asciidoc` |
| **Fichier de comparaison** | `diff.ico` | Viewer | `.diff` · `.patch` |
| **Fichier de configuration** | `configuration.ico` | Editor | `.ini` · `.env` · `.toml` · `.conf` · `.config` · `.editorconfig` · `.gitignore` · `.gitattributes` · `.properties` · `.tf` · `.hcl` · `.lock` |
| **Document LaTeX** | `latex.ico` | Viewer | `.tex` · `.latex` |
| **Fichier de code** | `code.ico` | Editor | `.js` · `.mjs` · `.cjs` · `.ts` · `.jsx` · `.tsx` · `.css` · `.scss` · `.sass` · `.less` · `.py` · `.pyw` · `.java` · `.c` · `.cc` · `.cpp` · `.cxx` · `.h` · `.hh` · `.hpp` · `.hxx` · `.cs` · `.php` · `.sql` · `.rs` · `.go` · `.rb` · `.swift` · `.kt` · `.kts` · `.r` · `.lua` · `.pl` · `.scala` · `.dart` · `.ex` · `.exs` · `.erl` · `.hs` · `.elm` · `.clj` · `.cljs` · `.groovy` · `.gradle` · `.vb` · `.vbs` · `.fs` · `.fsx` · `.proto` · `.graphql` · `.gql` · `.dockerfile` · `.makefile` · `.mk` · `.cmake` · `.nix` · `.sol` · `.pkl` |
| **Document web** | `web.ico` | Viewer | `.html` · `.htm` · `.vue` · `.svelte` · `.astro` |
| **Script en ligne de commande** | `commandes.ico` | Editor | `.sh` · `.bash` · `.zsh` · `.fish` · `.bat` · `.cmd` · `.ps1` · `.psm1` · `.psd1` |
| **Fichier JSON** | `json.ico` | Viewer | `.json` · `.jsonc` · `.json5` · `.ipynb` |
| **Fichier XML** | `xml.ico` | Viewer | `.xml` |
| **Fichier YAML** | `yaml.ico` | Viewer | `.yaml` · `.yml` |
| **Fichier CSV** | `csv.ico` | Viewer | `.csv` |
| **Fichier TSV** | `tsv.ico` | Viewer | `.tsv` |
| **Document PDF** | `pdf.ico` | Viewer | `.pdf` |
| **Image** | `image.ico` | Viewer | `.png` · `.apng` · `.jpg` · `.jpeg` · `.gif` · `.webp` · `.bmp` · `.svg` · `.ico` · `.tif` · `.tiff` · `.avif` |
| **Document Word** | `docx.ico` | Viewer | `.docx` |
| **Document OpenDocument** | `odt.ico` | Viewer | `.odt` |
| **Document RTF** | `rtf.ico` | Viewer | `.rtf` |
| **Présentation PowerPoint** | `pptx.ico` | Viewer | `.pptx` |
| **Présentation OpenDocument** | `odp.ico` | Viewer | `.odp` |
| **Livre numérique EPUB** | `epub.ico` | Viewer | `.epub` |

Le rôle « Viewer » ou « Editor » est celui déclaré à Windows pour la commande « Ouvrir avec » : il ne modifie pas vos applications par défaut, qui restent un choix explicite dans Windows (**Paramètres → Applications par défaut**).

## Ce que les icônes contiennent

- **7 tailles** par fichier : 16, 24, 32, 48, 64, 128 et 256 pixels. Les petites tailles restent en bitmap DIB (format historique, le mieux accepté), les grandes en PNG, comme le prévoit le format `.ico` depuis Windows Vista.
- **Aucune ressource tierce** : les formes sont dessinées et les lettres proviennent de deux polices bitmap définies dans le script. Aucune licence externe ne porte donc sur ces images, et le rendu ne dépend d’aucune police installée.
- **Aucune dépendance** : le script n’utilise que la bibliothèque standard de Python (`zlib`, `struct`) ; Pillow n’est pas nécessaire.
- **Reproductible** : relancer le script produit les mêmes octets. Il relit ensuite chaque fichier écrit (en-tête, tailles, profondeur, charge utile) et échoue si un `.ico` est incomplet.

Régénération :

```bash
python3 src-tauri/icons/filetypes/generate_filetype_icons.py
```

La commande réécrit les 21 fichiers `.ico` (environ 300 Ko au total) et l’aperçu [`docs/assets/icons-fichiers.png`](assets/icons-fichiers.png).

## Limites assumées

- **Windows uniquement.** Sur les autres systèmes, les icônes de fichiers sont fournies par le bureau (GNOME, KDE, Finder) : Noto n’y écrit rien.
- **Un type de fichier par famille d’extensions.** Une famille regroupe des formats proches (`web` pour HTML, Vue, Svelte et Astro ; `code` pour 58 extensions de programmation). Les images ont leur icône propre comme famille, pas une icône par format d’image.
- **Aucune modification silencieuse.** Les icônes sont posées par l’installeur, au moment où vous l’exécutez. L’application elle-même ne réécrit aucune clé d’association : elle propose seulement d’ouvrir les paramètres Windows.
- **Rien n’est écrit pour une autre application.** La reprise des sauvegardes d’association et la suppression de l’ancienne classe `Document HTML` ne touchent qu’aux clés dont la commande d’ouverture pointe vers *cette* installation de Noto ; toute autre clé est laissée intacte.
- **La désinstallation restaure vos associations d’origine.** Les valeurs précédentes sont conservées par l’installeur, et les extensions qui ont changé de classe sont reprises une par une pour que la restauration rende bien l’application que vous utilisiez avant Noto.

## Vérifier sur une machine Windows

1. Installez Noto avec l’installeur NSIS.
2. Dans le registre, `HKCU\Software\Classes\Document Markdown\DefaultIcon` doit désigner `…\Noto\filetypes\md.ico`, et le fichier doit exister.
3. `HKCU\Software\Classes\.json`, `.xml`, `.yaml`, `.ps1` doivent désigner respectivement « Fichier JSON », « Fichier XML », « Fichier YAML » et « Script en ligne de commande ».
4. Désinstallez : les `.ico` disparaissent de `…\filetypes`, et les clés de classes de Noto aussi.

Le workflow **Windows installers** vérifie automatiquement les points 2 et 4 à chaque publication : une classe sans icône, un fichier d’icône absent ou une icône laissée après désinstallation font échouer la construction.
