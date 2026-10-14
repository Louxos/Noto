import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldCheck, X } from 'lucide-react';
import { OPERATION_CATEGORIES } from '../lib/operations';
import type { Operation, ParamDefinition } from '../lib/operations/types';
import type { StudioFile } from './useStudio';
import { formatSize } from '../lib/jobs/output';

/** Nature réelle du travail : jamais présentée comme autre chose. */
export const NATURE_LABELS: Record<NonNullable<Operation['nature']>, string> = {
  native: 'Modification native du document',
  overlay: 'Calque ajouté par-dessus le document',
  rebuild: 'Reconstruction du document',
  measure: 'Analyse seule : le fichier d’origine n’est pas modifié',
};

export function NoticeStack({ notices, onDismiss }: { notices: { kind: 'info' | 'success' | 'warning' | 'error'; message: string }[]; onDismiss: (index: number) => void }) {
  if (!notices.length) return null;
  return (
    <div className="studio-notices" role="status" aria-live="polite">
      {notices.map((notice, index) => {
        const Icon = notice.kind === 'success' ? CheckCircle2 : notice.kind === 'error' || notice.kind === 'warning' ? AlertTriangle : Info;
        return (
          <div className={`studio-notice is-${notice.kind}`} key={`${index}-${notice.message.slice(0, 24)}`}>
            <Icon size={14} aria-hidden="true" />
            <span>{notice.message}</span>
            <button type="button" aria-label="Masquer ce message" onClick={() => onDismiss(index)}><X size={13} /></button>
          </div>
        );
      })}
    </div>
  );
}

export function OperationPicker({
  operations,
  selected,
  onSelect,
  allowedIds,
}: {
  operations: Operation[];
  selected: Operation | null;
  onSelect: (id: string) => void;
  allowedIds?: Set<string>;
}) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const filtered = operations.filter((operation) => {
      if (allowedIds && !allowedIds.has(operation.id)) return false;
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return operation.label.toLowerCase().includes(needle) || operation.description.toLowerCase().includes(needle);
    });
    return OPERATION_CATEGORIES
      .map((category) => ({ category, items: filtered.filter((operation) => operation.category === category.id) }))
      .filter((group) => group.items.length > 0);
  }, [allowedIds, operations, query]);

  return (
    <div className="studio-tools">
      <label className="studio-search">
        <span className="visually-hidden">Filtrer les outils</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrer les outils…" />
      </label>
      <div className="studio-tool-groups">
        {groups.map((group) => (
          <section key={group.category.id} aria-label={group.category.label}>
            <h3 title={group.category.description}>{group.category.label}</h3>
            <div className="studio-tool-list">
              {group.items.map((operation) => (
                <button
                  key={operation.id}
                  type="button"
                  className={`studio-tool ${selected?.id === operation.id ? 'selected' : ''}`}
                  onClick={() => onSelect(operation.id)}
                  title={operation.description}
                >
                  <strong>{operation.label}</strong>
                  <small>{operation.output.label}</small>
                </button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="studio-empty">Aucun outil ne correspond à « {query} ».</p>}
      </div>
    </div>
  );
}

export function ParameterForm({
  operation,
  values,
  onChange,
}: {
  operation: Operation;
  values: Record<string, string | number | boolean>;
  onChange: (id: string, value: string | number | boolean) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  if (!operation.params.length) {
    return <p className="studio-empty">Cet outil n’a aucun réglage : il s’applique directement.</p>;
  }
  const visible = operation.params.filter((param) => showAdvanced || !param.advanced);
  const advancedCount = operation.params.length - operation.params.filter((param) => !param.advanced).length;
  return (
    <div className="studio-params">
      {visible.map((param) => (
        <ParameterField key={param.id} param={param} value={values[param.id] ?? param.default} onChange={(value) => onChange(param.id, value)} />
      ))}
      {advancedCount > 0 && (
        <button type="button" className="studio-advanced-toggle" onClick={() => setShowAdvanced((current) => !current)}>
          {showAdvanced ? 'Masquer les réglages avancés' : `Afficher les réglages avancés (${advancedCount})`}
        </button>
      )}
    </div>
  );
}

function ParameterField({ param, value, onChange }: { param: ParamDefinition; value: string | number | boolean; onChange: (value: string | number | boolean) => void }) {
  const id = `studio-param-${param.id}`;
  if (param.kind === 'boolean') {
    return (
      <label className="studio-param is-toggle" htmlFor={id}>
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        <span>{param.label}{param.help && <small>{param.help}</small>}</span>
      </label>
    );
  }
  if (param.kind === 'select') {
    return (
      <label className="studio-param" htmlFor={id}>
        <span>{param.label}</span>
        <select id={id} value={String(value)} onChange={(event) => onChange(event.target.value)}>
          {param.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {param.help && <small>{param.help}</small>}
      </label>
    );
  }
  if (param.kind === 'number') {
    return (
      <label className="studio-param" htmlFor={id}>
        <span>{param.label}{param.unit ? ` (${param.unit})` : ''}</span>
        <input
          id={id}
          type="number"
          value={Number(value)}
          min={param.min}
          max={param.max}
          step={param.step ?? 1}
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value);
            onChange(Number.isFinite(parsed) ? Math.min(param.max, Math.max(param.min, parsed)) : param.default);
          }}
        />
        {param.help && <small>{param.help}</small>}
      </label>
    );
  }
  if (param.kind === 'color') {
    return (
      <label className="studio-param" htmlFor={id}>
        <span>{param.label}</span>
        <input id={id} type="color" value={String(value)} onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  }
  return (
    <label className="studio-param" htmlFor={id}>
      <span>{param.label}</span>
      <input id={id} type="text" value={String(value)} placeholder={param.placeholder} maxLength={param.maxLength ?? 200} onChange={(event) => onChange(event.target.value)} />
      {param.help && <small>{param.help}</small>}
    </label>
  );
}

export function OperationDetails({ operation }: { operation: Operation }) {
  const nature = operation.nature ?? 'native';
  return (
    <div className="studio-details">
      <p className="studio-details-description">{operation.description}</p>
      <dl className="studio-details-grid">
        <div><dt>Nature du travail</dt><dd><ShieldCheck size={13} aria-hidden="true" /> {NATURE_LABELS[nature]}</dd></div>
        <div><dt>Entrées attendues</dt><dd>{operation.inputs.label}</dd></div>
        <div><dt>Résultat</dt><dd>{operation.output.label}</dd></div>
      </dl>
      <div className="studio-limits">
        <strong>Limites connues</strong>
        <ul>{operation.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
      </div>
    </div>
  );
}

export function FileSummary({ files }: { files: StudioFile[] }) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  return <span>{files.length} fichier{files.length === 1 ? '' : 's'} · {formatSize(total)}</span>;
}
