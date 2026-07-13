import { CSSProperties, KeyboardEvent, ReactNode, useEffect, useId, useRef } from 'react';
import Icon from './Icon';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
  closeLabel?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Modal({ title, children, onClose, className, style, closeLabel = '关闭' }: ModalProps) {
  const modalRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>('[autofocus]')
      ?? modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
      .filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={modalRef}
        className={className ? `modal ${className}` : 'modal'}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={closeLabel}><Icon name="close" /></button>
        </div>
        {children}
      </section>
    </div>
  );
}
