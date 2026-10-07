# Sécurité

## Signaler une vulnérabilité

Ne publiez pas de détail exploitable dans une issue publique. Utilisez le signalement privé de sécurité GitHub du dépôt ou contactez ses mainteneurs via les coordonnées du profil du projet.

## Modèle de sécurité

Noto ouvre uniquement des fichiers choisis par l’utilisateur. Il n’y a ni téléversement de documents, ni compte, ni service réseau applicatif. Les documents HTML sont affichés dans un iframe sandboxé avec une CSP qui bloque scripts, formulaires, connexions réseau, plugins et URL de base. Le Markdown n’autorise pas le HTML brut.

Le shell Tauri étend le scope FS au fichier explicitement choisi. Pour un déplacement, seul le dossier de destination choisi par l’utilisateur est ajouté au scope, sans autoriser récursivement son contenu. Les commandes de renommage/déplacement vérifient que la source existe et refusent d’écraser une destination existante.

Les archives Office/EPUB restent en mémoire. Le lecteur n’exécute ni macros, ni scripts, ni objets incorporés et limite la taille d’entrée, des XML et des images. Les images raster intégrées sont converties en data URLs ; le SVG n’est pas extrait des archives Office.

Les fichiers récents, groupes et préférences sont locaux. La restauration de session desktop, désactivée par défaut, conserve uniquement les chemins choisis ; désactiver l’option les efface. Le contenu des brouillons texte est également stocké localement, mais seulement si la récupération est activée explicitement ; leur durée de conservation est réglable et la désactivation les efface après confirmation. Aucun brouillon ni document n’est envoyé à un service distant.
