function cssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

export function getDurationColor(days: number): string {
  if (days <= 0)  return cssVar('--color-dur-l0', '#F0F0F0');
  if (days <= 3)  return cssVar('--color-dur-l1', '#E3F2FD');
  if (days <= 10) return cssVar('--color-dur-l2', '#90CAF9');
  if (days <= 30) return cssVar('--color-dur-l3', '#42A5F5');
  if (days <= 90) return cssVar('--color-dur-l4', '#1E88E5');
  if (days <= 365) return cssVar('--color-dur-l5', '#1565C0');
  return cssVar('--color-dur-l6', '#0D47A1');
}

export function getLastDepartureColor(daysAgo: number): string {
  if (daysAgo < 30) return cssVar('--color-dep-l4', '#A82848');
  if (daysAgo < 365) return cssVar('--color-dep-l3', '#F95D84');
  if (daysAgo < 3650) return cssVar('--color-dep-l2', '#FFC0CD');
  return cssVar('--color-dep-l1', '#FDE0E6');
}

/**
 * 地图悬停/预览高亮色。2026-06-20 之前硬编码为固定的 #FFD166（黄色），
 * 不跟随主题切换；复用 --color-warning 这个语义接近、此前未被任何组件
 * 使用的变量，三个主题各自定义了专属值（见 index.css），不再是单一固定色。
 */
export function getPreviewColor(): string {
  return cssVar('--color-warning', '#FFD166');
}
