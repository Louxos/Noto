# Mises à jour de Noto

## Application de bureau Windows

À partir de **Noto 1.2.0**, l’application vérifie au démarrage s’il existe une version stable plus récente. Cette vérification est silencieuse en cas de coupure réseau et n’interrompt pas l’ouverture de Noto. Si aucune mise à jour n’est disponible, une confirmation discrète apparaît ; si une release stable existe, Noto présente sa version et ses notes avant toute action.

Le bouton **Télécharger et installer** est explicite : rien n’est téléchargé avant votre accord. Le téléchargement passe par le plugin officiel Tauri Updater, depuis les releases GitHub de `Louxos/Noto`. Les événements de téléchargement sont les octets reçus par l’application ; si le serveur ne fournit pas la taille totale, Noto affiche les octets réels et ne fabrique pas de pourcentage. Avant de lancer l’installeur, Tauri vérifie la signature cryptographique de l’artefact avec la clé publique intégrée à Noto. Sous Windows, l’installeur NSIS affiche sa propre progression réelle et redémarre l’application à la fin.

La vérification ne transmet que la demande de métadonnées de version à GitHub. Aucun document, nom de fichier, chemin ni identifiant d’usage n’est envoyé. Le client Windows utilise le magasin de certificats et le proxy système de Windows pour établir la connexion TLS ; cela ne remplace ni n’assouplit la vérification de signature Tauri de l’installateur. En mode hors ligne, les fichiers et fonctions locales restent disponibles ; seule la recherche de mise à jour échoue silencieusement. Une signature absente ou invalide bloque l’installation : Noto ne remplace pas ce contrôle par l’ouverture d’une page de téléchargement. En cas d’échec lors d’une recherche manuelle, Noto affiche aussi le détail technique utile, en retirant les paramètres temporaires des URL.

La version stable **1.1.0** publiée avant l’activation de l’updater ne peut pas acquérir ce mécanisme rétroactivement. Il faut installer manuellement la première version qui l’intègre (**1.2.0**) depuis les releases officielles ; les versions suivantes pourront ensuite être proposées dans Noto.

## Version navigateur

La version navigateur ne peut pas installer ou relancer l’application Windows. Depuis **Paramètres → Général**, elle peut vérifier manuellement les métadonnées publiques de la dernière release et ouvrir la page officielle des téléchargements. Cette action reste un accès à la page GitHub, pas une installation intégrée.

## Publication signée

Les artefacts de mise à jour sont produits uniquement pour un tag de release. Le workflow vérifie que les versions npm, frontend, Cargo et Tauri correspondent au tag, construit les artefacts Tauri signés, re-signe l’installeur final après une éventuelle signature Authenticode, puis publie `latest.json`, la signature et `SHA256SUMS.txt`. Les builds de branche ne reçoivent pas la clé privée et ne produisent pas de métadonnées de release.

La clé privée de mise à jour et sa phrase secrète restent des secrets GitHub Actions (`TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) et ne doivent jamais être ajoutées au dépôt, à un ticket ou à une conversation. Elles sont distinctes du certificat Authenticode Windows, facultatif.
