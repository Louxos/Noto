# Recherche indexée locale

La recherche indexée est préparée dans cette branche comme une option **à la demande**, depuis **Paramètres → Recherche indexée**. Elle ne remplace pas la recherche de dossier existante et ne parcourt jamais le disque automatiquement.

## Créer et utiliser un index

1. Dans l’application de bureau, choisissez un dossier.
2. Cliquez sur **Construire l’index**. L’application parcourt les fichiers texte, Markdown, code, HTML et CSV ; elle affiche sa progression et les éléments qu’elle ne peut pas lire.
3. Saisissez un mot ou un début de mot pour chercher dans l’index. Ouvrez un résultat pour afficher le fichier dans Noto.
4. Cliquez sur **Actualiser l’index** après l’ajout ou la modification de fichiers, ou sur **Effacer** pour supprimer les données indexées.

Bornes appliquées pendant le parcours : profondeur maximale de 10 dossiers, 1 000 dossiers, 50 000 entrées, 5 000 fichiers, 64 Mo lus au total et 1 Mo par fichier. Les répertoires générés et de dépendances sont ignorés. Pour contenir la taille de l’index, Noto ne recherche que dans les **16 000 premiers caractères de chaque fichier**.

## Données et confidentialité

L’index est conservé dans le stockage IndexedDB de l’application, sur le même appareil. Il contient les chemins, noms, types et termes indexés nécessaires à la recherche ; il ne conserve pas le corps intégral des documents et ne transmet rien en ligne. Une recherche de contenu peut toutefois révéler certains termes dans l’index local. Utilisez **Effacer** pour le supprimer. Si le stockage local n’est pas disponible, l’interface avertit que l’index ne durera que pendant la session.

La recherche indexée est distincte de la recherche actuelle **dans un dossier**, qui lit les fichiers choisis à chaque recherche et ne conserve pas d’index durable.
