import { useEffect, useRef, useState } from 'react';
import { initialTopbarFit, nextTopbarFit, type TopbarFitStage, type TopbarMeasurement } from '../lib/topbarLayout';

/**
 * Mesure réelle du besoin de la barre supérieure.
 *
 * Principe : les menus et les actions gardent leur largeur naturelle, et la
 * zone des menus s’étire pour occuper la place libre. Le bord droit de la
 * dernière zone coïncide donc **exactement** avec le bord droit du contenu
 * tant que tout tient ; s’il dépasse, c’est qu’une zone ne rentre plus et que
 * la mise en page est en train de se chevaucher. On compare ces deux bords,
 * mesurés sur la géométrie réelle, sans dépendre des styles calculés ni d’une
 * largeur de fenêtre supposée.
 *
 * Le dépassement est aussi détecté par `scrollWidth`, ce qui couvre les
 * moteurs dont la mesure de débordement diffère.
 */
export function measureTopbar(element: HTMLElement): TopbarMeasurement {
  const availableWidth = element.clientWidth;
  const byOverflow = element.scrollWidth > availableWidth + 1;

  const topbarRect = element.getBoundingClientRect();
  const boxes = (Array.from(element.children) as HTMLElement[])
    .map((child) => child.getBoundingClientRect())
    .filter((box) => box.width > 0);
  if (boxes.length === 0 || topbarRect.width <= 0) return { availableWidth, overflowing: byOverflow };

  const contentLeft = boxes[0].left;
  const occupied = boxes[boxes.length - 1].right - contentLeft;
  // Les marges internes gauche et droite sont identiques dans la barre : la
  // place disponible se déduit symétriquement.
  const capacity = topbarRect.width - 2 * (contentLeft - topbarRect.left);

  return { availableWidth, overflowing: occupied > capacity + 1 || byOverflow };
}

/**
 * Renvoie l’étape d’affichage à appliquer à la barre supérieure.
 *
 * La mesure est relancée au redimensionnement de la fenêtre (`ResizeObserver`
 * sur la barre et ses zones fixes) et à chaque changement de `signature`, qui
 * résume ce qui peut modifier le contenu de la barre : fichier affiché, mode
 * d’édition, actions de barre d’outils, préférences, étape courante.
 *
 * Dans un environnement sans mise en page (test, fenêtre masquée), la mesure
 * n’a pas de sens : l’étape reste alors inchangée.
 */
export function useTopbarFit(topbarRef: React.RefObject<HTMLElement | null>, signature: string): TopbarFitStage {
  const [stage, setStage] = useState<TopbarFitStage>(() => initialTopbarFit().stage);
  const stateRef = useRef(initialTopbarFit());

  useEffect(() => {
    const measure = () => {
      const element = topbarRef.current;
      if (!element || element.clientWidth === 0) return;
      const next = nextTopbarFit(stateRef.current, measureTopbar(element));
      if (next === stateRef.current) return;
      stateRef.current = next;
      setStage((current) => (current === next.stage ? current : next.stage));
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    const element = topbarRef.current;
    if (!element) return;
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [signature, topbarRef]);

  return stage;
}
