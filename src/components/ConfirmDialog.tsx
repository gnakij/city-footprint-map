import type { ReactNode } from 'react';
import Icon from './Icon';

interface ConfirmDialogProps {
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  children,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal modal-sm">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="关闭"><Icon name="close" /></button>
        </div>
        {children ?? (message ? <p className="mb-16">{message}</p> : null)}
        <div className="flex-end gap-8">
          <button className="btn-outline" onClick={onCancel}>{cancelLabel}</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
