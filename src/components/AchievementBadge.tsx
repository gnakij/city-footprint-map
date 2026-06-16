import type { Achievement } from '../types';

export default function AchievementBadge({ achievement, unlocked }: { achievement: Achievement; unlocked: boolean }) {
  return (
    <div className={`achievement-badge ${unlocked ? '' : 'locked'}`} title={achievement.description}>
      <div className="achievement-icon">{achievement.icon}</div>
      <div className="label-sm">{achievement.name}</div>
    </div>
  );
}
