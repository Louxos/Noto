# Sécurité

## Signaler une vulnérabilité

Ne publiez pas de détail exploitable dans une issue publique. Utilisez la fonction de signalement privé de sécurité de GitHub sur le dépôt, ou contactez les mainteneurs via les coordonnées du profil du projet.

## Modèle de sécurité

Noto ouvre des fichiers locaux choisis explicitement par l’utilisateur. Les documents HTML sont présentés dans un iframe sandboxé, avec une politique de sécurité qui bloque les scripts, les connexions réseau, les formulaires, les plugins et les URL de base. Le Markdown n’autorise pas le HTML brut.

Le shell Tauri demande uniquement les permissions nécessaires aux dialogues de fichiers et à la lecture/écriture des fichiers explicitement ouverts. Quand un fichier est ouvert depuis Windows, déposé ou sélectionné dans l’historique, le shell ajoute au scope FS uniquement le chemin de ce fichier. Toute modification d’ACL ou ajout d’un accès réseau doit être justifié et revu.
