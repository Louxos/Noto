# Vérifier une mise à jour

Cette branche ajoute dans **Paramètres → Général** une vérification manuelle des versions stables. Elle compare la version locale à la dernière publication publique du dépôt, puis propose d’ouvrir la page officielle des téléchargements dans le navigateur par défaut.

La vérification n’est lancée que lorsque l’utilisateur clique sur le bouton. Elle demande les métadonnées publiques de `https://api.github.com/repos/Louxos/Noto/releases/latest` ; elle ne transmet ni document, ni chemin, ni nom de fichier. L’application n’installe rien en arrière-plan et ne télécharge pas silencieusement un binaire. L’installeur et `SHA256SUMS.txt` se récupèrent depuis GitHub Releases ; l’empreinte doit être vérifiée avant d’exécuter l’installeur.

## Mise à jour automatique Tauri

Le téléchargement et l’installation automatiques par le plugin Tauri Updater ne sont **pas activés**. Ils nécessitent une clé de signature dédiée aux métadonnées et aux archives de mise à jour, distincte du certificat Authenticode de l’installeur. Activer un endpoint ou une clé publique sans détenir et protéger la clé privée correspondante rendrait le mécanisme inutilisable ou dangereux.

Pour une future activation, le mainteneur devra générer la clé localement avec la CLI Tauri, conserver la clé privée hors du dépôt, la configurer uniquement comme secret GitHub Actions, publier la clé publique dans la configuration Tauri, puis ajouter au workflow les archives, signatures et métadonnées `latest.json`. Une validation doit confirmer qu’une mise à jour est téléchargée, vérifiée, installée et relancée sur une machine Windows avant d’annoncer l’installation automatique.

La clé privée ne doit jamais être ajoutée au dépôt, à un ticket public ou à une conversation.
