import Modal from './Modal';

export type ChangelogEntry = { date: string; items: string[] };

export default function ChangelogModal({
  changelog,
  onClose,
}: {
  changelog: ChangelogEntry[];
  onClose: () => void;
}) {
  return (
    <Modal title="系统升级记录" className="modal-wide changelog-modal" onClose={onClose}>
      <div className="changelog-list changelog-modal-body">
        {changelog.length === 0 && <p className="muted">升级记录加载中…</p>}
        {changelog.map((entry, index) => (
          <div key={index} className="changelog-entry">
            <div className="changelog-date">{entry.date}</div>
            <ul className="changelog-items">
              {entry.items.map((item, itemIndex) => (
                <li key={itemIndex}>{itemIndex + 1}. {item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
