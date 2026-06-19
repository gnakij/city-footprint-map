import { useMemo, useState } from 'react';
import { ACHIEVEMENTS } from '../data/achievements';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import { visitDays, daysSinceDate } from '../utils/date';
import AchievementBadge from './AchievementBadge';

const RANK_PREVIEW_COUNT = 10;
const ACHIEVEMENT_PREVIEW_COUNT = 8;

export default function StatsPanel() {
  const getStats = useStore((state) => state.getStats);
  const visits = useStore((state) => state.visits);
  const achievements = useStore((state) => state.achievements);
  const setProfileOpen = useStore((state) => state.setProfileOpen);
  const statsCollapsed = useStore((state) => state.statsCollapsed);
  const toggleStatsCollapsed = useStore((state) => state.toggleStatsCollapsed);
  const colorMode = useStore((state) => state.colorMode);
  const [showAllRanking, setShowAllRanking] = useState(false);
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const stats = getStats();

  const openDetail = () => setProfileOpen(true, 'visits');

  // 排行：根据 colorMode 切换排序方式
  const ranking = useMemo(() => {
    // 先计算每个城市的总天数和最后离开时间
    const daysMap = new Map<string, number>();
    const lastDateMap = new Map<string, string>();
    
    for (const visit of visits) {
      daysMap.set(visit.city_id, (daysMap.get(visit.city_id) ?? 0) + visitDays(visit));
      const current = lastDateMap.get(visit.city_id);
      if (!current || visit.last_stay_date > current) {
        lastDateMap.set(visit.city_id, visit.last_stay_date);
      }
    }
    
    const items = Array.from(daysMap.keys()).map((cityId) => ({
      city: CITIES.find((c) => c.city_id === cityId),
      days: daysMap.get(cityId) ?? 0,
      lastDate: lastDateMap.get(cityId) ?? '',
      cityId,
    })).filter((row) => row.days > 0 || row.lastDate);
    
    if (colorMode === 'lastDeparture') {
      // 按最后离开时间排序
      return items.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    } else {
      // 按停留天数排序（默认）
      return items.sort((a, b) => b.days - a.days);
    }
  }, [visits, colorMode]);

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
        {(showAllAchievements ? ACHIEVEMENTS : ACHIEVEMENTS.slice(0, ACHIEVEMENT_PREVIEW_COUNT))
          .sort((a, b) => {
            const aUnlocked = achievements.includes(a.id);
            const bUnlocked = achievements.includes(b.id);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            return 0;
          })
          .map((achievement, index) => (
            <AchievementBadge key={achievement.id} achievement={achievement} unlocked={achievements.includes(achievement.id)} position={index % 4} />
          ))}
      </div>
      {ACHIEVEMENTS.length > ACHIEVEMENT_PREVIEW_COUNT && (
        <button className="btn-outline small ranking-toggle" onClick={() => setShowAllAchievements((prev) => !prev)}>
          {showAllAchievements ? '收起' : `展开全部 (${ACHIEVEMENTS.length})`}
        </button>
      )}

      {/* 排行 */}
      {ranking.length > 0 && (
        <div className="ranking-section">
          <div className="panel-title">
            <strong>{colorMode === 'lastDeparture' ? '最近离开排行' : '停留时长排行'}</strong>
          </div>
          <ol className="ranking-list">
            {visibleRanking.map((row, index) => (
              <li key={row.cityId} className="ranking-row">
                <span className="ranking-index">{index + 1}</span>
                <span className="ranking-name">{row.city?.city_name ?? row.cityId}</span>
                <span className="ranking-days">
                  {colorMode === 'lastDeparture' ? `${daysSinceDate(row.lastDate)} 天前` : `${row.days} 天`}
                </span>
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
