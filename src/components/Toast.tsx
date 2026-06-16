import { useEffect } from 'react';
import { useStore } from '../store/useStore';

export default function Toast() {
  const toast = useStore((state) => state.toast);
  const hideToast = useStore((state) => state.hideToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(hideToast, 3000);
    return () => window.clearTimeout(timer);
  }, [hideToast, toast]);

  if (!toast) return null;

  return (
    <div className="toast glass">
      <strong>{toast.icon ?? '✓'}</strong>
      <span>{toast.message}</span>
    </div>
  );
}
