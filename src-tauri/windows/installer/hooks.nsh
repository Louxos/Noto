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
