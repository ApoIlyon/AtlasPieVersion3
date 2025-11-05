import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';

export interface PieSliceDefinition {
  id: string;
  label: string;
  order: number;
  icon?: React.ReactNode;
  accentToken?: string;
  disabled?: boolean;
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
  const containerSize = useMemo(() => Math.round(radius * 2 + 40), [radius]);
  const sliceAngle = useMemo(() => {
    if (!sortedSlices.length) {
      return 0;
    }
    return TAU / sortedSlices.length;
  }, [sortedSlices.length]);
  const gapRadians = useMemo(() => toRadians(gapDeg), [gapDeg]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const innerInset = useMemo(() => Math.max(Math.round(radius * 0.18), 18), [radius]);
  const buttonDistance = useMemo(() => {
    const base = radius - innerInset - 24;
    return Math.max(base, radius * 0.65);
  }, [radius, innerInset]);

  useLayoutEffect(() => {
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
        'relative rounded-full border border-border/60 bg-surface/80 shadow-glow-xl backdrop-blur-xl',
        visible ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      style={{ 
        width: containerSize, 
        height: containerSize,
        // No transitions to prevent flickering - CRITICAL
        transition: 'none !important',
        // Optimize rendering - tell browser to optimize for this element
        willChange: visible ? 'opacity, transform' : 'auto',
        // Contain layout and paint to prevent reflows
        contain: 'layout style paint',
        // Force GPU acceleration for instant rendering
        transform: 'scale(1) translateZ(0)',
        // Direct opacity control - no CSS transitions, set via useLayoutEffect
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        className="absolute rounded-full border border-border/40 bg-overlay/60 shadow-inner"
        style={{ inset: innerInset }}
      />
      {centerContent && (
        <div
          className="absolute flex items-center justify-center text-center text-xs uppercase tracking-[0.35em] text-text-secondary"
          style={{ inset: innerInset * 1.8 }}
        >
          {centerContent}
        </div>
      )}
      {sortedSlices.map((slice, index) => {
        const angleOffset = -Math.PI / 2;
        const gapOffset = sortedSlices.length > 1 ? gapRadians / 2 : 0;
        const effectiveAngle = angleOffset + index * sliceAngle;
        const isActive = slice.id === activeSliceId;
        const x = Math.cos(effectiveAngle) * buttonDistance;
        const y = Math.sin(effectiveAngle) * buttonDistance;

        return (
          <button
            key={slice.id}
            type="button"
            className={clsx(
              'group absolute flex h-14 w-14 items-center justify-center rounded-2xl border border-transparent bg-overlay/70 text-sm font-medium text-text-secondary transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/80',
              slice.disabled && 'cursor-not-allowed opacity-40',
              isActive && 'z-10 border-accent/60 bg-accent/10 text-text-primary shadow-glow-focus',
            )}
            style={{ 
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
            }}
            aria-label={slice.label}
            onMouseEnter={() => onHover?.(slice.id, slice)}
            onFocus={() => onHover?.(slice.id, slice)}
            onClick={() => !slice.disabled && onSelect?.(slice.id, slice)}
            disabled={slice.disabled}
          >
            <span className="truncate text-xs uppercase tracking-[0.25em] text-text-secondary group-hover:text-text-primary">
              {slice.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
