import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Achievement } from '../types';

interface Props {
  achievement: Achievement;
  unlocked: boolean;
  position?: number;
}

export default function AchievementBadge({ achievement, unlocked, position = 1 }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
  });
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showTooltip && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      const tooltipWidth = 200;
      
      let left = rect.left + rect.width / 2;
      let transform = 'translateX(-50%)';
      
      if (left - tooltipWidth / 2 < 8) {
        left = rect.left;
        transform = 'translateX(0)';
      } else if (left + tooltipWidth / 2 > window.innerWidth - 8) {
        left = rect.right;
        transform = 'translateX(-100%)';
      }
      
      setTooltipStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        left,
        transform,
      });
    }
  }, [showTooltip, position]);

  return (
    <div
      ref={badgeRef}
      className={`achievement-badge ${unlocked ? '' : 'locked'}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onTouchStart={() => setShowTooltip(true)}
      onTouchEnd={() => setTimeout(() => setShowTooltip(false), 2000)}
    >
      <div className="achievement-icon">{achievement.icon}</div>
      <div className="label-sm">{achievement.name}</div>
      {showTooltip && createPortal(
        <div className="achievement-tooltip" style={tooltipStyle}>
          {achievement.description}
        </div>,
        document.body
      )}
    </div>
  );
}
