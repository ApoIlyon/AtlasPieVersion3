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
  description?: string | null;
  shortcut?: string | null;
  action?: string | null;
}

// Интерфейс для CSS свойств с поддержкой пользовательских CSS-переменных
interface CSSPropertiesWithCustomVars extends React.CSSProperties {
  '--x'?: string;
  '--y'?: string;
  '--radial-item-size'?: string;
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
  animationsEnabled?: boolean;
  theme?: 'dark' | 'light' | 'auto';
  animationStyle?: 'slide' | 'fade' | 'scale' | 'none';
  onSliceDrop?: (sliceId: string, e: React.DragEvent) => void;
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
  animationsEnabled = true,
  theme = 'dark',
  animationStyle = 'slide',
  onSliceDrop,
}: PieMenuProps) {
  const sortedSlices = useMemo(
    () => [...slices].sort((a, b) => a.order - b.order),
    [slices],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const [dropTargetSliceId, setDropTargetSliceId] = useState<string | null>(null);

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
        animationsEnabled && 'animations-enabled',
        `theme-${theme}`
      )}
      style={{
        '--radial-item-size': `56px`,
      } as CSSPropertiesWithCustomVars}
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
          const background = slice.color ?? 'rgba(59, 130, 246, 0.35)';

          return (
            <button
              key={slice.id}
              type="button"
              className={clsx(
                'radial-menu__item absolute flex h-[var(--radial-item-size)] w-[var(--radial-item-size)] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-xs font-semibold uppercase tracking-[0.3em] text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                slice.disabled && 'cursor-not-allowed opacity-40 hover:scale-100',
                isActive && 'z-10 border-accent text-white shadow-glow',
                interactive && draggingIdRef.current === slice.id && 'scale-105',
                dropTargetSliceId === slice.id && 'border-accent/70 bg-accent/20'
              )}
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                width: '56px',
                height: '56px',
                background,
                borderColor: isActive ? 'var(--color-accent)' : dropTargetSliceId === slice.id ? 'rgba(59, 130, 246, 0.7)' : 'rgba(255, 255, 255, 0.15)',
                boxShadow: isActive 
                  ? 'var(--shadow-xl), var(--shadow-glow)' 
                  : dropTargetSliceId === slice.id 
                  ? 'var(--shadow-lg), 0 0 20px rgba(59, 130, 246, 0.3)'
                  : 'var(--shadow-lg)',
                transition: animationsEnabled 
                  ? 'all var(--duration-normal) var(--ease-in-out)' 
                  : 'none',
              } as CSSPropertiesWithCustomVars}
              aria-label={slice.label}
              onMouseEnter={() => onHover?.(slice.id, slice)}
              onFocus={() => onHover?.(slice.id, slice)}
              onClick={() => !slice.disabled && onSelect?.(slice.id, slice)}
              onPointerDown={() => {
                if (!interactive) return;
                draggingIdRef.current = slice.id;
                setDragTargetIndex(index);
              }}
              onDragOver={(e) => {
                if (onSliceDrop) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDropTargetSliceId(slice.id);
                }
              }}
              onDragLeave={(e) => {
                if (onSliceDrop) {
                  e.preventDefault();
                  if (dropTargetSliceId === slice.id) {
                    setDropTargetSliceId(null);
                  }
                }
              }}
              onDrop={(e) => {
                if (onSliceDrop) {
                  e.preventDefault();
                  setDropTargetSliceId(null);
                  onSliceDrop(slice.id, e);
                }
              }}
              disabled={slice.disabled}
            >
              <div className="flex flex-col items-center justify-center">
                {slice.icon && (
                  <div className="mb-1 text-lg">{slice.icon}</div>
                )}
                <span className="px-2 text-[0.65rem] uppercase tracking-[0.25em]" title={slice.description || slice.label}>
                  {slice.label}
                </span>
                {slice.shortcut && (
                  <span className="mt-1 text-[0.55rem] opacity-60 font-mono">
                    {slice.shortcut}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        <div
          className="radial-menu__center pointer-events-none absolute flex items-center justify-center rounded-full text-[0.65rem] uppercase tracking-[0.35em] text-white/70"
          style={{
            width: `${Math.max(48, 56 * 0.6)}px`,
            height: `${Math.max(48, 56 * 0.6)}px`,
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.1), var(--shadow-md)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          {centerContent || 'Menu'}
        </div>
      </div>
    </div>
  );
}
