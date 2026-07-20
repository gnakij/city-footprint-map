import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import Icon from './Icon';

export default function Toast() {
  const toast = useStore((state) => state.toast);
  const hideToast = useStore((state) => state.hideToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(hideToast, 3000);
    return () => window.clearTimeout(timer);
  }, [hideToast, toast]);

  if (!toast) return null;

  const iconName = toast.icon === '!' ? 'info' : 'check';

  return (
    <div className="toast glass" role="status" aria-live="polite">
      <strong><Icon name={iconName} /></strong>
      <span>{toast.message}</span>
    </div>
  );
}
