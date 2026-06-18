import { useMemo, useState } from 'react';
import { ACHIEVEMENTS } from '../data/achievements';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import { visitDays } from '../utils/date';
import AchievementBadge from './AchievementBadge';

const RANK_PREVIEW_COUNT = 10;

export default function StatsPanel() {
  const getStats = useStore((state) => state.getStats);
  const visits = useStore((state) => state.visits);
  const achievements = useStore((state) => state.achievements);
  const setProfileOpen = useStore((state) => state.setProfileOpen);
  const statsCollapsed = useStore((state) => state.statsCollapsed);
  const toggleStatsCollapsed = useStore((state) => state.toggleStatsCollapsed);
  const [showAllRanking, setShowAllRanking] = useState(false);
  const stats = getStats();

  const openDetail = () => setProfileOpen(true, 'visits');

  // 停留时长排行：按城市汇总总天数，倒序排列
  const ranking = useMemo(() => {
    const map = new Map<string, number>();
    for (const visit of visits) {
      map.set(visit.city_id, (map.get(visit.city_id) ?? 0) + visitDays(visit));
    }
    return Array.from(map.entries())
      .map(([cityId, days]) => ({ city: CITIES.find((c) => c.city_id === cityId), days, cityId }))
      .filter((row) => row.days > 0)
      .sort((a, b) => b.days - a.days);
  }, [visits]);

  const visibleRanking = showAllRanking ? ranking : ranking.slice(0, RANK_PREVIEW_COUNT);

  // Collapsed: visible floating affordance near the map controls
  if (statsCollapsed) {
    return (
      <button
        className="stats-collapsed-pill card"
        onClick={toggleStatsCollapsed}
        aria-label="展开足迹统计"
      >
        <span className="stats-pill-icon">🏙️</span>
        <span className="stats-pill-text">
          点亮城市 <strong>{stats.litCount}/{stats.totalCities}</strong>
        </span>
        <span className="stats-pill-arrow">▲</span>
      </button>
    );
  }

  // Expanded: compact panel
  return (
    <aside className="stats-panel card" role="region" aria-label="足迹统计">
      <div className="panel-title">
        <strong>足迹统计</strong>
        <button className="stats-minimize" onClick={toggleStatsCollapsed} aria-label="收起统计">▼</button>
      </div>
      <div className="stats-grid">
        <button className="stat stat-button" onClick={openDetail}>
          <span className="label-sm">点亮城市</span>
          <strong>{stats.litCount}/{stats.totalCities}</strong>
        </button>
        <button className="stat stat-button" onClick={openDetail}>
          <span className="label-sm">访问次数</span>
          <strong>{stats.visitCount}</strong>
        </button>
        <button className="stat stat-button" onClick={openDetail}>
          <span className="label-sm">覆盖省份</span>
          <strong>{stats.provinceCount}</strong>
        </button>
        <button className="stat stat-button" onClick={openDetail}>
          <span className="label-sm">累计天数</span>
          <strong>{stats.totalDays}</strong>
        </button>
      </div>
      <div className="progress" aria-label="城市覆盖率">
        <span style={{ width: `${Math.min(100, stats.coverage)}%` }} />
      </div>

      <hr className="stats-divider" />

      <div className="achievement-grid">
        {ACHIEVEMENTS.map((achievement) => (
          <AchievementBadge key={achievement.id} achievement={achievement} unlocked={achievements.includes(achievement.id)} />
        ))}
      </div>

      {/* 停留时长排行 */}
      {ranking.length > 0 && (
        <div className="ranking-section">
          <div className="panel-title">
            <strong>停留时长排行</strong>
          </div>
          <ol className="ranking-list">
            {visibleRanking.map((row, index) => (
              <li key={row.cityId} className="ranking-row">
                <span className="ranking-index">{index + 1}</span>
                <span className="ranking-name">{row.city?.city_name ?? row.cityId}</span>
                <span className="ranking-days">{row.days} 天</span>
              </li>
            ))}
          </ol>
          {ranking.length > RANK_PREVIEW_COUNT && (
            <button className="btn-outline small ranking-toggle" onClick={() => setShowAllRanking((prev) => !prev)}>
              {showAllRanking ? '收起' : `查看全部 (${ranking.length})`}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
