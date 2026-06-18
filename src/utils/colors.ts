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

export function getDepartureColor(daysAgo: number): string {
  if (daysAgo <= 30)  return cssVar('--color-dep-l1', '#FF7043');
  if (daysAgo <= 90)  return cssVar('--color-dep-l2', '#FF8A65');
  if (daysAgo <= 180) return cssVar('--color-dep-l3', '#FFAB91');
  if (daysAgo <= 365) return cssVar('--color-dep-l4', '#FFCCBC');
  return cssVar('--color-dep-l5', '#FBE9E7');
}
