; Crochets NSIS de Noto — installeur et désinstalleur en français.
;
; Ce fichier est inséré par Tauri aux moments clés de l’installation :
; `NSIS_HOOK_PREINSTALL`, `NSIS_HOOK_POSTINSTALL`, `NSIS_HOOK_PREUNINSTALL`,
; `NSIS_HOOK_POSTUNINSTALL`. Règles appliquées ici :
;   - aucune boîte de dialogue pendant une installation silencieuse (`/S`) :
;     les scripts d’entreprise et la CI ne doivent jamais rester bloqués ;
;   - Noto ne se déclare installé que si ses fichiers sont réellement présents ;
;   - la désinstallation ne supprime aucun document personnel sans un choix
;     explicite de l’utilisateur (case « Supprimer les données de l’application »
;     fournie par l’installeur lui-même).

; --- Avant l’installation -----------------------------------------------------
; Rien n’est écrit avant que l’utilisateur ait choisi son dossier et son menu
; Démarrer : ce crochet existe comme point d’extension documenté.

!macro NSIS_HOOK_PREINSTALL
!macroend

; --- Après l’installation : vérification réelle ------------------------------

!macro NSIS_HOOK_POSTINSTALL
  !ifdef MAINBINARYNAME
    ; Le lancement de Noto est le seul vrai test d’une installation réussie.
    IfFileExists "$INSTDIR\${MAINBINARYNAME}.exe" noto_binary_present
      SetErrors
      IfSilent noto_postinstall_done
      MessageBox MB_OK|MB_ICONSTOP|MB_TOPMOST "L’installation est incomplète : « ${MAINBINARYNAME}.exe » est introuvable dans $INSTDIR.$\r$\n$\r$\nDésinstallez puis réinstallez Noto, ou choisissez un autre dossier d’installation."
      Goto noto_postinstall_done
    noto_binary_present:
  !endif

  ; Sans désinstalleur, l’utilisateur ne pourrait plus retirer Noto : c’est une
  ; installation en échec, même si les fichiers de l’application sont présents.
  IfFileExists "$INSTDIR\uninstall.exe" noto_uninstaller_present
    SetErrors
    IfSilent noto_uninstaller_present
    MessageBox MB_OK|MB_ICONEXCLAMATION|MB_TOPMOST "Le désinstalleur n’a pas pu être écrit dans $INSTDIR.$\r$\n$\r$\nVous pourrez malgré tout retirer Noto depuis « Applications » dans les paramètres de Windows."
  noto_uninstaller_present:

  !ifdef MAINBINARYNAME
    noto_postinstall_done:
  !endif

  ; Icônes par type de fichier, puis reprise des sauvegardes d’association.
  ; L’ordre compte : les classes de fichiers viennent d’être écrites (section
  ; d’installation), et la notification de changement informe l’Explorateur.
  !insertmacro NOTO_APPLY_FILE_TYPE_ICONS
  !insertmacro NOTO_MIGRATE_FILE_TYPE_ICONS
  !insertmacro UPDATEFILEASSOC
!macroend

; --- Icônes par type de fichier ----------------------------------------------
; Windows affiche, pour chaque fichier, l’image désignée par la valeur par défaut
; de la clé `DefaultIcon` de sa classe. Le gabarit NSIS de Tauri écrit
; « Noto.exe,0 » pour toutes les classes (le champ `icon` de `tauri.conf.json`
; n’est lu que par le gabarit MSI, retiré du projet) : sans ce crochet, tous les
; formats auraient l’icône de l’application. Les icônes livrées dans
; `$INSTDIR\filetypes` viennent de `src-tauri/icons/filetypes/` et sont copiées
; par `bundle.resources`.

!macro NOTO_SET_FILE_ICON FILECLASS ICON
  ; Si l’icône est absente — installation partielle, fichier effacé à la main —
  ; on ne touche à rien : l’icône de l’application reste en place plutôt qu’un
  ; chemin sans image. Rien n’est écrit pour une classe qui n’appartient pas à
  ; cette installation : seule la classe que l’installeur vient de créer est
  ; concernée.
  ${If} ${FileExists} "$INSTDIR\filetypes\${ICON}"
    WriteRegStr SHCTX "Software\Classes\${FILECLASS}\DefaultIcon" "" "$INSTDIR\filetypes\${ICON}"
  ${EndIf}
!macroend

!macro NOTO_APPLY_FILE_TYPE_ICONS
  !insertmacro NOTO_SET_FILE_ICON "Document Markdown" "md.ico"
  !insertmacro NOTO_SET_FILE_ICON "Fichier texte" "texte.ico"
  !insertmacro NOTO_SET_FILE_ICON "Fichier de comparaison" "diff.ico"
  !insertmacro NOTO_SET_FILE_ICON "Fichier de configuration" "configuration.ico"
  !insertmacro NOTO_SET_FILE_ICON "Document LaTeX" "latex.ico"
  !insertmacro NOTO_SET_FILE_ICON "Fichier de code" "code.ico"
  !insertmacro NOTO_SET_FILE_ICON "Document web" "web.ico"
  !insertmacro NOTO_SET_FILE_ICON "Script en ligne de commande" "commandes.ico"
  !insertmacro NOTO_SET_FILE_ICON "Fichier JSON" "json.ico"
  !insertmacro NOTO_SET_FILE_ICON "Fichier XML" "xml.ico"
  !insertmacro NOTO_SET_FILE_ICON "Fichier YAML" "yaml.ico"
  !insertmacro NOTO_SET_FILE_ICON "Fichier CSV" "csv.ico"
  !insertmacro NOTO_SET_FILE_ICON "Fichier TSV" "tsv.ico"
  !insertmacro NOTO_SET_FILE_ICON "Document PDF" "pdf.ico"
  !insertmacro NOTO_SET_FILE_ICON "Image" "image.ico"
  !insertmacro NOTO_SET_FILE_ICON "Document Word" "docx.ico"
  !insertmacro NOTO_SET_FILE_ICON "Document OpenDocument" "odt.ico"
  !insertmacro NOTO_SET_FILE_ICON "Document RTF" "rtf.ico"
  !insertmacro NOTO_SET_FILE_ICON "Présentation PowerPoint" "pptx.ico"
  !insertmacro NOTO_SET_FILE_ICON "Présentation OpenDocument" "odp.ico"
  !insertmacro NOTO_SET_FILE_ICON "Livre numérique EPUB" "epub.ico"
!macroend

; --- Passage des versions 0.2 à 0.3 -------------------------------------------
; `FileAssociation.nsh` enregistre, dans la clé de chaque extension, la valeur
; précédente sous le nom « <classe>_backup » afin de la restituer à la
; désinstallation. Quand une extension change de classe d’une version à l’autre,
; cette sauvegarde désigne l’ancienne classe de Noto au lieu de l’application
; d’origine de la personne : la désinstallation rendrait alors une association
; sans application. Les macros ci-dessous remontent la chaîne d’un cran, pour
; chaque extension dont la classe a changé, puis retirent la classe devenue
; inutilisée — et uniquement si sa commande d’ouverture pointe bien vers cette
; installation de Noto.

!macro NOTO_FLATTEN_BACKUP EXT FILECLASS PREVIOUSCLASS
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" "${FILECLASS}_backup"
  ${If} $R0 == "${PREVIOUSCLASS}"
    ReadRegStr $R1 SHCTX "Software\Classes\.${EXT}" "${PREVIOUSCLASS}_backup"
    WriteRegStr SHCTX "Software\Classes\.${EXT}" "${FILECLASS}_backup" "$R1"
    DeleteRegValue SHCTX "Software\Classes\.${EXT}" "${PREVIOUSCLASS}_backup"
  ${EndIf}
!macroend

!macro NOTO_MIGRATE_FILE_TYPE_ICONS
  !insertmacro NOTO_FLATTEN_BACKUP "astro" "Document web" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "bash" "Script en ligne de commande" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "bat" "Script en ligne de commande" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "cmd" "Script en ligne de commande" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "conf" "Fichier de configuration" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "diff" "Fichier de comparaison" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "editorconfig" "Fichier de configuration" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "env" "Fichier de configuration" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "gitattributes" "Fichier de configuration" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "gitignore" "Fichier de configuration" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "hcl" "Fichier de configuration" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "htm" "Document web" "Document HTML"
  !insertmacro NOTO_FLATTEN_BACKUP "html" "Document web" "Document HTML"
  !insertmacro NOTO_FLATTEN_BACKUP "ini" "Fichier de configuration" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "json" "Fichier JSON" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "json5" "Fichier JSON" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "jsonc" "Fichier JSON" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "lock" "Fichier de configuration" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "patch" "Fichier de comparaison" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "properties" "Fichier de configuration" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "ps1" "Script en ligne de commande" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "psd1" "Script en ligne de commande" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "psm1" "Script en ligne de commande" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "sh" "Script en ligne de commande" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "svelte" "Document web" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "tex" "Document LaTeX" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "tf" "Fichier de configuration" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "toml" "Fichier de configuration" "Fichier texte"
  !insertmacro NOTO_FLATTEN_BACKUP "vue" "Document web" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "xml" "Fichier XML" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "yaml" "Fichier YAML" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "yml" "Fichier YAML" "Fichier de code"
  !insertmacro NOTO_FLATTEN_BACKUP "zsh" "Script en ligne de commande" "Fichier de code"

  ; « Document HTML » est remplacée par « Document web » : la classe n’est plus
  ; référencée par aucune extension, elle est donc retirée du registre — mais
  ; seulement si elle a bien été créée par Noto, jamais au détriment d’un autre
  ; programme qui porterait le même nom.
  ReadRegStr $R0 SHCTX "Software\Classes\Document HTML\shell\open\command" ""
  ${If} $R0 == '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
    DeleteRegKey SHCTX "Software\Classes\Document HTML"
  ${EndIf}
!macroend

; --- Avant la désinstallation ------------------------------------------------

!macro NSIS_HOOK_PREUNINSTALL
  IfSilent noto_uninstall_confirmed
    MessageBox MB_OKCANCEL|MB_ICONQUESTION|MB_TOPMOST "Désinstaller Noto de cet appareil ?$\r$\n$\r$\nVos documents, vos groupes, vos brouillons et vos préférences sont conservés : Noto ne supprime aucun fichier personnel.$\r$\n$\r$\nLa case « Supprimer les données de l’application » proposée juste ici permet de les effacer explicitement, si vous le souhaitez." IDOK noto_uninstall_confirmed
    Abort
  noto_uninstall_confirmed:
!macroend

; --- Après la désinstallation ------------------------------------------------

!macro NSIS_HOOK_POSTUNINSTALL
  IfSilent noto_postuninstall_done
  MessageBox MB_OK|MB_ICONINFORMATION|MB_TOPMOST "Noto a été retiré de cet appareil.$\r$\n$\r$\nVos documents et vos fichiers personnels n’ont pas été modifiés."
  noto_postuninstall_done:
!macroend
