import { BookOpenText, FileUp, FolderPlus, Keyboard, ShieldCheck, X } from 'lucide-react';

export function WelcomeDialog({ onOpenFile, onPinFolder, onIntegrations, onClose }: { onOpenFile: () => void; onPinFolder: () => void; onIntegrations: () => void; onClose: () => void }) {
  return <div className="modal-backdrop welcome-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <header className="welcome-dialog-header"><div className="welcome-dialog-mark">N</div><button className="icon-action" type="button" aria-label="Fermer l’accueil" onClick={onClose}><X size={17} /></button></header>
      <div className="welcome-dialog-copy"><span className="eyebrow"><span className="eyebrow-dot" />VOTRE ESPACE DE FICHIERS LOCAL</span><h2 id="welcome-title">Bienvenue dans <em>Noto.</em></h2><p>Ouvrez, lisez et modifiez vos fichiers dans un espace clair — sans compte, synchronisation ni télémétrie.</p></div>
      <div className="welcome-dialog-cards">
        <div><span><FileUp size={17} /></span><strong>Ouvrir</strong><small>Choisissez un ou plusieurs fichiers, ou glissez-les dans la fenêtre.</small></div>
        <div><span><BookOpenText size={17} /></span><strong>Explorer</strong><small>Markdown, code, PDF, CSV, images et documents courants.</small></div>
        <div><span><Keyboard size={17} /></span><strong>Gagner du temps</strong><small>Ctrl+O pour ouvrir · Ctrl+F pour chercher · Ctrl+P pour les onglets, récents et commandes.</small></div>
      </div>
      <div className="welcome-dialog-privacy"><ShieldCheck size={15} /><span>Les fichiers restent sur votre appareil. La recherche locale ne démarre que lorsque vous la lancez.</span></div>
      <footer className="welcome-dialog-footer"><div className="welcome-dialog-links"><button className="text-link" type="button" onClick={onPinFolder}><FolderPlus size={14} />Épingler un dossier local</button><button className="text-link" type="button" onClick={onIntegrations}>Associations Windows <span>→</span></button></div><div><button className="secondary-button" type="button" onClick={onClose}>Continuer</button><button className="primary-button" type="button" onClick={onOpenFile}><FileUp size={15} />Ouvrir un fichier</button></div></footer>
    </section>
  </div>;
}
