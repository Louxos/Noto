import { Clock3, FileType2, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import type { RecentFile } from '../lib/preferences';
import { getFormatLabel } from '../lib/fileTypes';

function iconForKind(kind: 'pdf' | 'image') {
  const Icon = kind === 'pdf' ? FileType2 : ImageIcon;
  return <Icon size={17} />;
}

export function SmartGroupScreen({ title, kind, files, onRecent, hidePaths = false }: {
  title: string;
  kind: 'pdf' | 'image';
  files: RecentFile[];
  onRecent: (recent: RecentFile) => void;
  hidePaths?: boolean;
}) {
  return <div className="recent-screen smart-group-screen">
    <div className="recent-screen-heading"><div><div className="eyebrow">COLLECTION INTELLIGENTE LOCALE</div><h2>{title}</h2><p>Collection calculée depuis les fichiers récents, sans déplacer ni copier les originaux.</p></div><span className={`smart-group-badge smart-${kind}`}>{iconForKind(kind)}</span></div>
    {files.length ? <div className="home-recent-grid">{files.map((recent) => <button className="home-recent-card" type="button" data-context-file-id={recent.id} key={recent.id} onClick={() => onRecent(recent)} title={hidePaths ? recent.name : recent.path}>
      <span className={`home-file-icon type-${recent.kind}`}>{iconForKind(kind)}</span>
      <span className="home-card-copy"><strong>{recent.name}</strong><small>{getFormatLabel(recent.kind as 'pdf' | 'image')} <i /> {hidePaths ? 'Chemin masqué' : recent.path}</small></span>
      <span className="card-arrow">↗</span>
    </button>)}</div> : <div className="recent-empty-large"><span><Clock3 size={24} /></span><h3>Aucun fichier dans cette collection</h3><p>Ouvrez un {kind === 'pdf' ? 'PDF' : 'fichier image'} pour le retrouver ici.</p></div>}
    <div className="recent-privacy"><ShieldCheck size={15} />Cette collection est calculée localement à partir de votre historique.</div>
  </div>;
}
