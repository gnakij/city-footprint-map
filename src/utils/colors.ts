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

/**
 * 地图"已点亮"城市/省份的标签文字色。2026-06-20 之前固定为 #8C2540
 * （深酒红），不跟随主题。用户要求"已点亮统一用品牌主色"，不新造颜色，
 * 直接复用 --color-primary。
 */
export function getLitLabelColor(): string {
  return cssVar('--color-primary', '#8C2540');
}

/**
 * 地图"未点亮"城市/省份的标签文字色。2026-06-20 之前固定为 #B7A2AA
 * （浅紫灰），不跟随主题。用户要求"未点亮用项目已有的灰色调"，直接复用
 * --color-on-surface-variant（三主题各自的次要文字色，已验证对各自地图
 * 背景对比度均≥4.5:1，达到WCAG AA正文标准）。
 */
export function getUnlitLabelColor(): string {
  return cssVar('--color-on-surface-variant', '#B7A2AA');
}

/**
 * 地图标签弹窗(tooltip)的边框色。ECharts 默认行为是取被点击数据项本身的
 * 填充色(tooltipDataParams.color)作为边框色，导致边框颜色随城市染色梯度
 * 变化（比如停留天数落在中间档时呈现蓝色），用户反馈"弹窗边框颜色很奇怪"。
 * 用户要求改为固定使用主题色，不再跟随数据变化——与 getLitLabelColor 数值
 * 相同(都是--color-primary)但语义场景不同，独立命名以保持代码可读性。
 */
export function getTooltipBorderColor(): string {
  return cssVar('--color-primary', '#8C2540');
}

/**
 * 省名标注文字的光晕(halo)颜色。2026-06-20 新增：之前省名文字固定用白色
 * textShadow 当作可读性保险（textShadowColor: rgba(255,255,255,.85)），
 * 在原Linear暗色主题下白色光晕糊在暗背景上效果很差，且不跟随主题切换。
 * 改为复用 --color-background（各主题各自的页面背景色），让光晕色本身跟
 * 主题协调；配合 getLitLabelColor() 作为文字色，两者对比度。
 * 2026-06-21更新：五主题全量重制（已删除Linear，全部改为浅色背景）后
 * 重新验证，五主题下对比度分别为 rose 4.79 / stripe 6.11 / amber 5.2 /
 * turquoise 4.53 / azure 4.96，均 >= 4.5（WCAG AA标准），不随省名标注
 * 下方实际色块深浅变化——halo 的对比度只取决于"文字色 vs halo色"这两个
 * 固定值的关系，不需要再去判断标注下方那一小块地图的真实底色。
 */
export function getHaloColor(): string {
  return cssVar('--color-background', '#FFFBFC');
}
