import { useEffect, useMemo, useRef } from 'react';
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
}

const TAU = Math.PI * 2;
const DEFAULT_RADIUS = 156;

function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

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
}: PieMenuProps) {
  const sortedSlices = useMemo(
    () => [...slices].sort((a, b) => a.order - b.order),
    [slices],
  );

  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Use layout effect for synchronous DOM updates - instant appearance
    // Directly manipulate DOM to prevent any animation delays or flickering
    if (!rootRef.current) return;
    
    const el = rootRef.current;
    // CRITICAL: Disable all transitions first
    el.style.transition = 'none';
    // CRITICAL: Keep element in DOM always - don't remove it
    // This prevents re-creation which causes flickering
    
    if (visible) {
      // Instantly show - synchronous DOM update before paint
      // Remove hidden attribute first
      el.removeAttribute('hidden');
      el.removeAttribute('aria-hidden');
      // Then set styles
      el.style.opacity = '1';
      el.style.transform = 'scale(1) translateZ(0)';
      el.style.pointerEvents = 'auto';
      el.style.visibility = 'visible';
      el.style.display = 'block';
      // Force reflow to ensure styles are applied immediately
      void el.offsetHeight;
    } else {
      // Instantly hide - but keep in DOM
      el.style.opacity = '0';
      el.style.transform = 'scale(1) translateZ(0)';
      el.style.pointerEvents = 'none';
      el.style.visibility = 'hidden';
      // Keep display: block to prevent reflow
      el.style.display = 'block';
      el.setAttribute('hidden', '');
      el.setAttribute('aria-hidden', 'true');
    }
  }, [visible]);

  useEffect(() => {
    // CRITICAL: Don't blur on hide - it can cause focus issues
    // Only blur when menu is actually hidden and user interacted with it
    // Removing this to prevent any focus-related menu closing
    // if (!visible && rootRef.current) {
    //   const activeElement = document.activeElement;
    //   if (activeElement instanceof HTMLElement && rootRef.current.contains(activeElement)) {
    //     activeElement.blur();
    //   }
    // }
  }, [visible]);

  if (sortedSlices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-overlay/70 p-12 text-center text-sm text-text-muted">
        No slices assigned yet.
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-testid={dataTestId}
      data-profiler-id="PieMenu"
      hidden={!visible}
      aria-hidden={!visible}
      className={clsx(
        'relative flex aspect-square w-full max-w-[460px] select-none items-center justify-center',
        visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{
        '--radial-item-size': `56px`,
      } as React.CSSProperties}
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
