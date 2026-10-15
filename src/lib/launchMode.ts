/**
 * Gestes d’ouverture d’un fichier.
 *
 * Noto n’ouvre pas ses fichiers de la même façon selon l’origine du geste :
 *  - `launch`  : lancement de Noto par Windows, un fichier en argument ;
 *  - `handoff` : Noto est déjà ouvert, Windows lui transmet un fichier ;
 *  - `dialog`  : la personne a choisi le fichier dans Noto ;
 *  - `drop`    : la personne a déposé le fichier sur la fenêtre.
 */
export type OpenGesture = 'launch' | 'handoff' | 'dialog' | 'drop';

/**
 * Un fichier ouvert depuis l’Explorateur Windows (double-clic sur un type
 * associé à Noto, ou « Ouvrir avec ») s’affiche en mode immersion : le document
 * seul, sans barre latérale, menus ni onglets. Les fichiers choisis depuis
 * l’interface de Noto ne changent rien à l’affichage souhaité : la personne a
 * déjà le contexte sous les yeux.
 *
 * Le réglage « Ouvrir en mode immersion depuis Windows » permet de revenir au
 * comportement classique ; désactivé, cette fonction ne déclenche jamais rien.
 */
export function opensInImmersive(gesture: OpenGesture, immersiveOnFileOpen: boolean): boolean {
  if (!immersiveOnFileOpen) return false;
  return gesture === 'launch' || gesture === 'handoff';
}

/** Message de confirmation affiché quand le mode immersion s’active tout seul. */
export function immersiveOpenNotice(fileCount: number): string {
  return fileCount > 1
    ? `${fileCount} fichiers ouverts depuis Windows : mode immersion activé (Échap pour revenir à l’interface).`
    : 'Fichier ouvert depuis Windows : mode immersion activé (Échap pour revenir à l’interface).';
}
