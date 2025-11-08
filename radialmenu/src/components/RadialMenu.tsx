import React from 'react';
import type { RadialConfig, MenuItem } from '../types';

interface RadialMenuProps {
  config: RadialConfig;
  onItemClick?: (item: MenuItem) => void;
}

const RadialMenu: React.FC<RadialMenuProps> = ({ config, onItemClick }) => {
  const { items, radius, itemSize, spacing } = config;

  if (!items.length) {
    return (
      <div className="empty-state">
        <strong>Пока нет пунктов</strong>
        <span>Добавьте новый элемент в панели настроек справа.</span>
      </div>
    );
  }

  const angleStep = (Math.PI * 2) / items.length;
  const baseRadius = radius + spacing;

  return (
    <div className="radial-core">
      {items.map((item, index) => {
        const angle = -Math.PI / 2 + angleStep * index;
        const x = Math.cos(angle) * baseRadius;
        const y = Math.sin(angle) * baseRadius;

        const style: React.CSSProperties = {
          width: itemSize,
          height: itemSize,
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          background: item.color ?? 'rgba(148, 163, 184, 0.45)',
          fontSize: Math.max(12, itemSize * 0.28),
        };

        return (
          <button
            key={item.id}
            type="button"
            className="radial-item"
            style={style}
            onClick={() => onItemClick?.(item)}
            title={item.command ?? ''}
          >
            <span>{item.label}</span>
          </button>
        );
      })}
      <div className="radial-item" style={{
        width: itemSize * 0.6,
        height: itemSize * 0.6,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(79, 70, 229, 0.35)',
        fontSize: Math.max(10, itemSize * 0.2),
        boxShadow: 'inset 0 0 15px rgba(79, 70, 229, 0.45)'
      }}>
        <span>Центр</span>
      </div>
    </div>
  );
};

export default RadialMenu;
