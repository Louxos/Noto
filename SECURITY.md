# Politique de sécurité

## Versions prises en charge

| Version | Corrigée |
| --- | --- |
| 1.0.x | ✅ |
| 0.2.x | ⛔ (mise à jour recommandée ; les fichiers restent publiés tels quels) |
| 0.1.x | ⛔ (mise à jour recommandée ; les fichiers restent publiés tels quels) |

Seule la dernière version stable reçoit des correctifs de sécurité.

## Signaler une vulnérabilité

**N’ouvrez pas d’issue publique** contenant un détail exploitable. Utilisez le signalement privé de sécurité du dépôt GitHub (onglet *Security* → *Report a vulnerability*) ; à défaut, contactez le mainteneur via les coordonnées de son profil.

Merci d’indiquer la version concernée, la configuration, les étapes de reproduction et l’impact estimé. Un accusé de réception suit en général sous quelques jours ; aucune récompense financière n’est proposée, le projet étant bénévole.

## Ce qui est dans le périmètre

- Lecture et écriture de fichiers locaux (formats pris en charge, opérations de l’atelier).
- Traitement des entrées non fiables : archives ZIP (extraction), DOCX/ODT/RTF/PPTX/ODP/EPUB, PDF, images.
- Sandbox d’affichage HTML, isolation Markdown, commandes Tauri exposées au front-end.
- Chaîne de publication : installeur NSIS, sommes SHA-256, workflows d’intégration continue.

## Modèle de sécurité, en résumé

Noto n’ouvre que les fichiers choisis par l’utilisateur. Il n’existe **ni compte, ni téléversement, ni service réseau applicatif, ni télémétrie**. Les archives sont traitées en mémoire, sans exécuter de macros ni de scripts ; l’HTML est rendu dans une iframe sandboxée avec une CSP restrictive ; les noms d’entrée d’archive sont refusés s’ils contiennent des chemins dangereux ou des caractères de contrôle ; les bornes de taille, de nombre d’entrées et de profondeur sont documentées dans [`docs/security.md`](docs/security.md).

La seule connexion réseau que l’application peut initier concerne l’OCR, et uniquement après un accord explicite : le script et le cœur du moteur ainsi que les modèles de langue sont téléchargés depuis les adresses affichées dans le panneau **Modèles OCR**. Aucun document, extrait de texte ou nom de fichier n’est transmis.

## Points connus et honnêtes

- L’installeur **n’est pas signé** tant que les secrets de certificat des mainteneurs ne sont pas configurés sur le dépôt. Windows peut alors afficher un avertissement SmartScreen. Aucune signature n’est revendiquée à tort, et les sommes SHA-256 publiées permettent de vérifier les fichiers téléchargés.
- Le caviardage de PDF est destructif et vérifié après écriture ; il ne remplace pas un outil d’anonymisation certifié.
- Le plein écran et les opérations dépendantes du moteur graphique du système se vérifient sur Windows, pas dans tous les environnements de développement.

## Bonnes pratiques pour les utilisateurs

Téléchargez Noto uniquement depuis la page [Releases](https://github.com/Louxos/Noto/releases) du dépôt officiel, comparez l’empreinte SHA-256 avec `SHA256SUMS.txt`, et n’exécutez pas un installeur provenant d’un autre site.
