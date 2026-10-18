# Langues de l’interface

Noto propose une première base d’internationalisation `fr` / `en`, avec catalogues JSON centralisés dans `src/i18n/`, préférence persistante et choix manuel **Paramètres → Apparence → Langue**. Le français reste la langue par défaut.

Les principaux écrans de navigation et d’accueil, la liste des fichiers récents et le panneau Paramètres disposent d’une traduction anglaise initiale. Les menus contextuels, commandes, lecteurs et l’atelier restent encore majoritairement en français ; la traduction est donc **partielle**, et non une couverture anglaise complète. Les documents ouverts ne sont jamais traduits ni modifiés par ce réglage.

Pour ajouter une chaîne :

1. ajouter la même clé imbriquée dans `src/i18n/fr.json` et `src/i18n/en.json` ;
2. l’utiliser avec `tLang(language, 'section.key')` ;
3. couvrir les deux langues dans les tests ;
4. vérifier les textes courts, les libellés accessibles et la mise en page sur petit écran.

Les catalogues sont chargés localement ; aucune requête de traduction n’est faite.
