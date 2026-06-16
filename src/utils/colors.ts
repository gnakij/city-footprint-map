export function getDurationColor(days: number): string {
  if (days <= 0) return '#F0F0F0';
  if (days <= 3) return '#E3F2FD';
  if (days <= 10) return '#90CAF9';
  if (days <= 30) return '#42A5F5';
  if (days <= 90) return '#1E88E5';
  if (days <= 365) return '#1565C0';
  return '#0D47A1';
}

export function getDepartureColor(daysAgo: number): string {
  if (daysAgo <= 30) return '#FF7043';
  if (daysAgo <= 90) return '#FF8A65';
  if (daysAgo <= 180) return '#FFAB91';
  if (daysAgo <= 365) return '#FFCCBC';
  return '#FBE9E7';
}
