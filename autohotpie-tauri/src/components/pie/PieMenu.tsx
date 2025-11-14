import { useMemo, useRef, useState, useCallback } from 'react';
import clsx from 'clsx';

export interface PieSliceDefinition {
  id: string;
  label: string;
  order: number;
  icon?: React.ReactNode;
  accentToken?: string;
  disabled?: boolean;
  color?: string | null;
}

export interface PieMenuProps {
  slices: PieSliceDefinition[];
  activeSliceId?: string | null;
  visible?: boolean;
  onSelect?: (sliceId: string, slice: PieSliceDefinition) => void;
  onHover?: (sliceId: string, slice: PieSliceDefinition) => void;
  radius?: number;
  gapDeg?: number;
  centerContent?: React.ReactNode;
  dataTestId?: string;
  interactive?: boolean;
  onReorder?: (sliceId: string, targetIndex: number) => void;
  onRadiusChange?: (nextRadius: number) => void;
}

const DEFAULT_RADIUS = 156;

export function PieMenu({
  slices,
  activeSliceId,
  visible = false,
  onSelect,
  onHover,
  radius = DEFAULT_RADIUS,
  gapDeg = 4,
  centerContent,
  dataTestId = 'pie-menu',
  interactive = false,
  onReorder,
  onRadiusChange,
}: PieMenuProps) {
  const sortedSlices = useMemo(
    () => [...slices].sort((a, b) => a.order - b.order),
    [slices],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);

  const finishDrag = useCallback(() => {
    const draggingId = draggingIdRef.current;
    const target = dragTargetIndex;
    draggingIdRef.current = null;
    setDragTargetIndex(null);
    if (interactive && draggingId && target != null && onReorder) {
      onReorder(draggingId, target);
    }
  }, [interactive, dragTargetIndex, onReorder]);

  if (sortedSlices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-overlay/70 p-12 text-center text-sm text-text-muted">
        No slices assigned yet.
      </div>
    );
  }

  return (
    <div
      data-testid={dataTestId}
      data-profiler-id="PieMenu"
      aria-hidden={!visible}
      className={clsx(
        'relative flex aspect-square w-full max-w-[460px] select-none items-center justify-center',
        visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{
        '--radial-item-size': `56px`,
      } as React.CSSProperties}
      ref={containerRef}
      onPointerMove={(e) => {
        if (!interactive) return;
        const draggingId = draggingIdRef.current;
        if (!draggingId) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const angle = Math.atan2(dy, dx);
        const count = sortedSlices.length;
        if (count === 0) return;
        const angleStep = (Math.PI * 2) / count;
        let idx = Math.round(((angle + Math.PI / 2) % (Math.PI * 2)) / angleStep);
        if (idx < 0) idx += count;
        setDragTargetIndex(idx % count);
      }}
      onPointerUp={() => {
        if (!interactive) return;
        finishDrag();
      }}
      onPointerLeave={() => {
        if (!interactive) return;
        finishDrag();
      }}
      onWheel={(e) => {
        if (!interactive || !onRadiusChange) return;
        const delta = Math.sign(e.deltaY);
        const next = Math.max(80, Math.min(360, radius - delta * 8));
        onRadiusChange(next);
      }}
    >
      <div
        className="radial-menu__core relative flex aspect-square w-full items-center justify-center"
        style={{
          maxWidth: `${radius * 2 + 56}px`,
          maxHeight: `${radius * 2 + 56}px`,
        }}
      >
        {sortedSlices.map((slice, index) => {
          const angleStep = sortedSlices.length ? (Math.PI * 2) / sortedSlices.length : 0;
          const baseRadius = radius + 4;
          const angle = -Math.PI / 2 + angleStep * index;
          const x = Math.cos(angle) * baseRadius;
          const y = Math.sin(angle) * baseRadius;
          const isActive = slice.id === activeSliceId;
          const background = slice.color ?? 'rgba(96,165,250,0.35)';

          return (
            <button
              key={slice.id}
              type="button"
              className={clsx(
                'radial-menu__item absolute flex h-[var(--radial-item-size)] w-[var(--radial-item-size)] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 shadow-[0_20px_45px_rgba(15,23,42,0.45)] transition-transform hover:scale-105 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                slice.disabled && 'cursor-not-allowed opacity-40 hover:scale-100',
                isActive && 'z-10 border-accent/60 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]',
                interactive && draggingIdRef.current === slice.id && 'scale-105',
              )}
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                width: '56px',
                height: '56px',
                background,
              }}
              aria-label={slice.label}
              onMouseEnter={() => onHover?.(slice.id, slice)}
              onFocus={() => onHover?.(slice.id, slice)}
              onClick={() => !slice.disabled && onSelect?.(slice.id, slice)}
              onPointerDown={() => {
                if (!interactive) return;
                draggingIdRef.current = slice.id;
                setDragTargetIndex(index);
              }}
              disabled={slice.disabled}
            >
              <span className="px-3 text-[0.7rem] uppercase tracking-[0.25em]" title={slice.label}>
                {slice.label}
              </span>
            </button>
          );
        })}

        <div
          className="radial-menu__center pointer-events-none absolute flex items-center justify-center rounded-full border border-white/10 bg-white/10 text-[0.65rem] uppercase tracking-[0.35em] text-white/70 shadow-inner"
          style={{
            width: `${Math.max(48, 56 * 0.6)}px`,
            height: `${Math.max(48, 56 * 0.6)}px`,
          }}
        >
          {centerContent || 'Menu'}
        </div>
      </div>
    </div>
  );
}
