import { ACHIEVEMENTS } from '../data/achievements';
import { useStore } from '../store/useStore';
import AchievementBadge from './AchievementBadge';

export default function StatsPanel() {
  const getStats = useStore((state) => state.getStats);
  const achievements = useStore((state) => state.achievements);
  const setStatsOpen = useStore((state) => state.setStatsOpen);
  const stats = getStats();

  return (
    <aside className="stats-panel card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong>足迹统计</strong>
        <span className="label-sm">{stats.coverage}%</span>
      </div>
      <div className="stats-grid">
        <div className="stat"><span className="label-sm">已点亮</span><strong>{stats.litCount}/{stats.totalCities}</strong></div>
        <div className="stat"><span className="label-sm">覆盖省份</span><strong>{stats.provinceCount}</strong></div>
        <button className="stat stat-button" onClick={() => setStatsOpen(true)}><span className="label-sm">累计天数</span><strong>{stats.totalDays}</strong></button>
        <div className="stat"><span className="label-sm">覆盖率</span><strong>{stats.coverage}%</strong></div>
      </div>
      <div className="progress" aria-label="城市覆盖率">
        <span style={{ width: `${Math.min(100, stats.coverage)}%` }} />
      </div>
      <div className="achievement-grid">
        {ACHIEVEMENTS.map((achievement) => (
          <AchievementBadge key={achievement.id} achievement={achievement} unlocked={achievements.includes(achievement.id)} />
        ))}
      </div>
    </aside>
  );
}
