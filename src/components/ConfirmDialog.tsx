import type { ReactNode } from 'react';
import Modal from './Modal';

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
    <Modal title={title} className="modal-sm" onClose={onCancel}>
      {children ?? (message ? <p className="mb-16">{message}</p> : null)}
      <div className="flex-end gap-8">
        <button className="btn-outline" onClick={onCancel}>{cancelLabel}</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
