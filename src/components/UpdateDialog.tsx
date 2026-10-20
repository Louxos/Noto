import { ArrowDownToLine, BadgeCheck, CircleAlert, LoaderCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';

export type UpdatePhase = 'available' | 'downloading' | 'installing' | 'error';

export function formatUpdateBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1_024) return `${Math.floor(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1_024;
  let unit = units[0];
  for (let index = 1; value >= 1_024 && index < units.length; index += 1) {
    value /= 1_024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

export function UpdateDialog({
  update,
  language,
  phase,
  downloadedBytes,
  contentLength,
  error,
  onInstall,
  onDismiss,
}: {
  update: Update;
  language: 'fr' | 'en';
  phase: UpdatePhase;
  downloadedBytes: number;
  contentLength: number | null;
  error: string;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const french = language === 'fr';
  const busy = phase === 'downloading' || phase === 'installing';
  const progress = contentLength && contentLength > 0
    ? Math.min(100, Math.floor((downloadedBytes / contentLength) * 100))
    : null;
  const titles: Record<UpdatePhase, string> = {
    available: french ? 'Une version plus récente est prête' : 'A newer version is ready',
    downloading: french ? 'Téléchargement en cours' : 'Downloading the update',
    installing: french ? 'Vérification et installation' : 'Verifying and installing',
    error: french ? 'La mise à jour a échoué' : 'The update could not be installed',
  };
  const notes = update.body?.trim();

  return (
    <div
      className="modal-backdrop update-backdrop"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onDismiss();
      }}
    >
      <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title" aria-describedby="update-dialog-description">
        <header className="update-dialog-header">
          <span className="update-dialog-mark" aria-hidden="true"><Sparkles size={19} /></span>
          <div className="update-dialog-heading">
            <span className="update-dialog-eyebrow">{french ? 'MISE À JOUR STABLE' : 'STABLE UPDATE'}</span>
            <h2 id="update-dialog-title">{titles[phase]}</h2>
          </div>
          <button
            className="icon-action update-dialog-close"
            type="button"
            aria-label={french ? 'Fermer' : 'Close'}
            title={french ? 'Fermer' : 'Close'}
            disabled={busy}
            onClick={onDismiss}
          >
            <X size={17} />
          </button>
        </header>

        <div className="update-dialog-body">
          <div className="update-version-card">
            <div>
              <span>{french ? 'VERSION INSTALLÉE' : 'INSTALLED VERSION'}</span>
              <strong>v{update.currentVersion}</strong>
            </div>
            <span className="update-version-arrow" aria-hidden="true">→</span>
            <div className="update-version-new">
              <span>{french ? 'NOUVELLE VERSION' : 'NEW VERSION'}</span>
              <strong>v{update.version}</strong>
            </div>
            <span className="update-version-badge"><BadgeCheck size={13} />{french ? 'Stable' : 'Stable'}</span>
          </div>

          <p className="update-dialog-description" id="update-dialog-description">
            {phase === 'available' && (french
              ? 'Noto a trouvé une version officielle. Lancez l’installation quand vous êtes prêt ; elle ne démarre pas sans votre accord.'
              : 'Noto found an official release. Start the installation when you are ready; it will not begin without your approval.')}
            {phase === 'downloading' && (french
              ? 'Téléchargement de l’installateur officiel. Vous pouvez suivre les données réellement reçues ci-dessous.'
              : 'Downloading the official installer. The bytes actually received are shown below.')}
            {phase === 'installing' && (french
              ? 'Le téléchargement est terminé. Noto vérifie sa signature avant de lancer l’installation.'
              : 'The download is complete. Noto is verifying its signature before starting the installer.')}
            {phase === 'error' && (french
              ? 'Noto n’a pas installé cette version. Votre installation actuelle reste en place.'
              : 'Noto did not install this version. Your current installation remains in place.')}
          </p>

          {phase === 'available' && <div className="update-release-notes" aria-label={french ? 'Notes de version' : 'Release notes'}>
            <div className="update-release-notes-title">{french ? 'À découvrir dans cette version' : 'What’s new'}</div>
            <div className="update-release-notes-content">
              {notes || (french ? 'Une nouvelle version stable de Noto est disponible.' : 'A new stable version of Noto is available.')}
            </div>
          </div>}

          {phase === 'downloading' && <div className="update-operation" role="status" aria-live="polite">
            <div className="update-progress-heading">
              <span>{french ? 'Téléchargement' : 'Download'}</span>
              <strong>{progress === null ? formatUpdateBytes(downloadedBytes) : `${progress}%`}</strong>
            </div>
            {progress !== null && <div
              className="update-progress-track"
              role="progressbar"
              aria-label={french ? 'Progression réelle du téléchargement' : 'Actual download progress'}
              aria-valuemin={0}
              aria-valuemax={contentLength!}
              aria-valuenow={Math.min(downloadedBytes, contentLength!)}
              aria-valuetext={`${formatUpdateBytes(downloadedBytes)} / ${formatUpdateBytes(contentLength!)}`}
            >
              <span style={{ width: `${progress}%` }} />
            </div>}
            <small>{progress !== null
              ? `${formatUpdateBytes(downloadedBytes)} ${french ? 'sur' : 'of'} ${formatUpdateBytes(contentLength!)}`
              : `${formatUpdateBytes(downloadedBytes)} ${french ? 'reçus · taille totale inconnue' : 'received · total size unknown'}`}</small>
          </div>}

          {phase === 'installing' && <div className="update-install-state" role="status" aria-live="polite">
            <LoaderCircle size={18} className="spin" />
            <div>
              <strong>{french ? 'Vérification cryptographique en cours' : 'Cryptographic verification in progress'}</strong>
              <small>{french
                ? 'Après vérification, l’installeur NSIS officiel affiche sa progression réelle. Noto redémarrera lorsque l’installation sera terminée.'
                : 'After verification, the official NSIS installer displays its real progress. Noto will restart when installation is complete.'}</small>
            </div>
          </div>}

          {phase === 'error' && <div className="update-error-state" role="alert">
            <CircleAlert size={17} />
            <div>
              <strong>{french ? 'Aucune modification n’a été appliquée' : 'No changes were made'}</strong>
              {error && <small>{error}</small>}
            </div>
          </div>}

          <div className="update-trust-note">
            <ShieldCheck size={16} />
            <span>{french
              ? 'Le paquet est téléchargé depuis les releases officielles de Noto et sa signature cryptographique est vérifiée avant l’installation. Aucun document ni chemin n’est transmis.'
              : 'The package is downloaded from Noto’s official releases and its cryptographic signature is checked before installation. No document or file path is sent.'}</span>
          </div>
        </div>

        <footer className="update-dialog-footer">
          {phase === 'available' && <>
            <button className="secondary-button" type="button" onClick={onDismiss}>{french ? 'Plus tard' : 'Later'}</button>
            <button className="primary-button update-install-button" type="button" onClick={onInstall}>
              <ArrowDownToLine size={15} />{french ? 'Télécharger et installer' : 'Download and install'}
            </button>
          </>}
          {phase === 'downloading' && <div className="update-busy-caption"><LoaderCircle size={14} className="spin" />{french ? 'Téléchargement vérifié en cours…' : 'Secure download in progress…'}</div>}
          {phase === 'installing' && <div className="update-busy-caption"><LoaderCircle size={14} className="spin" />{french ? 'Ne fermez pas la fenêtre de l’installeur.' : 'Keep the installer window open.'}</div>}
          {phase === 'error' && <>
            <button className="secondary-button" type="button" onClick={onDismiss}>{french ? 'Fermer' : 'Close'}</button>
            <button className="primary-button update-install-button" type="button" onClick={onInstall}>
              <ArrowDownToLine size={15} />{french ? 'Réessayer' : 'Try again'}
            </button>
          </>}
        </footer>
      </section>
    </div>
  );
}
