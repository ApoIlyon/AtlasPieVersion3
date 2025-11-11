import React, { useMemo } from 'react';
import type { MenuItem, RadialConfig } from './types';

export interface RadialMenuProps {
  config: RadialConfig;
  className?: string;
  onItemClick?: (item: MenuItem) => void;
}

export function RadialMenu({ config, className, onItemClick }: RadialMenuProps) {
  const { items, radius, itemSize, spacing } = config;

  const angleStep = useMemo(() => (items.length ? (Math.PI * 2) / items.length : 0), [items.length]);
  const baseRadius = useMemo(() => radius + spacing, [radius, spacing]);

  if (!items.length) {
    return (
      <div
        className={
          className ??
          'flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-sm text-white/70'
        }
      >
        <strong className="text-white">No items configured</strong>
        <span className="mt-2 text-xs uppercase tracking-[0.3em] text-white/40">Add entries to display the radial menu.</span>
      </div>
    );
  }

  return (
    <div
      className={
        className ??
        'relative flex aspect-square w-full max-w-[460px] select-none items-center justify-center'
      }
      style={{
        '--radial-item-size': `${itemSize}px`,
      } as React.CSSProperties}
    >
      <div
        className="radial-menu__core relative flex aspect-square w-full items-center justify-center"
        style={{
          maxWidth: `${radius * 2 + itemSize}px`,
          maxHeight: `${radius * 2 + itemSize}px`,
        }}
      >
        {items.map((item, index) => {
          const angle = -Math.PI / 2 + angleStep * index;
          const x = Math.cos(angle) * baseRadius;
          const y = Math.sin(angle) * baseRadius;
          const background = item.color ?? 'rgba(96,165,250,0.35)';

          return (
            <button
              key={item.id}
              type="button"
              className="radial-menu__item absolute flex h-[var(--radial-item-size)] w-[var(--radial-item-size)] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center border border-white/15 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 shadow-[0_20px_45px_rgba(15,23,42,0.45)] transition-transform hover:scale-105 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                background,
                width: `${itemSize}px`,
                height: `${itemSize}px`,
                borderRadius: '50%',
              }}
              title={item.command ?? ''}
              onClick={() => onItemClick?.(item)}
            >
              <span className="px-3 text-[0.7rem] uppercase tracking-[0.25em]" title={item.label}>
                {item.label}
              </span>
            </button>
          );
        })}

        <div
          className="radial-menu__center pointer-events-none absolute flex items-center justify-center rounded-full border border-white/10 bg-white/10 text-[0.65rem] uppercase tracking-[0.35em] text-white/70 shadow-inner"
          style={{
            width: `${Math.max(48, itemSize * 0.6)}px`,
            height: `${Math.max(48, itemSize * 0.6)}px`,
          }}
        >
          Menu
        </div>
      </div>
    </div>
  );
}
