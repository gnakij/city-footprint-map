import adminDocs from '../data/adminDocs.json';

type DocItem = {
  category: string;
  title: string;
  url?: string;
  action?: string;
  last_updated: string;
  description: string;
};

const DOC_LIST = adminDocs as DocItem[];

export default function AdminDocsPanel({ onOpenChangelog }: { onOpenChangelog: () => void }) {
  return (
    <div className="changelog-list">
      {DOC_LIST.map((doc, index) => {
        const handleEntryClick = () => {
          if (doc.action === 'changelog') {
            onOpenChangelog();
          } else {
            window.open(doc.url, '_blank', 'noopener,noreferrer');
          }
        };
        return (
          <div
            key={index}
            className="changelog-entry"
            role="button"
            tabIndex={0}
            onClick={handleEntryClick}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleEntryClick();
              }
            }}
          >
            <div className="changelog-date">{doc.category} · 最后更新 {doc.last_updated}</div>
            <div className="changelog-body">
              {doc.action === 'changelog' ? (
                <a href="#" className="changelog-link" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenChangelog(); }}>{doc.title}</a>
              ) : (
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="changelog-link" onClick={(event) => event.stopPropagation()}>{doc.title}</a>
              )}
              <span className="changelog-desc">{' — '}{doc.description}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
