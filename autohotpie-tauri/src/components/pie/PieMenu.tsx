import { useEffect, useMemo, useRef } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
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

  const controls = useAnimationControls();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hasAnimatedRef = useRef(false);
  const innerInset = useMemo(() => Math.max(Math.round(radius * 0.18), 18), [radius]);
  const buttonDistance = useMemo(() => {
    const base = radius - innerInset - 24;
    return Math.max(base, radius * 0.65);
  }, [radius, innerInset]);

  useEffect(() => {
    let cancelled = false;

    const runAnimation = async () => {
      const transition = { type: 'spring', stiffness: 260, damping: 22 } as const;
      const target = {
        opacity: visible ? 1 : 0,
        scale: visible ? 1 : 0.92,
      };

      if (!hasAnimatedRef.current) {
        controls.set(target);
        hasAnimatedRef.current = true;
        return;
      }

      if (typeof performance !== 'undefined') {
        performance.mark('PieMenu:animation-start');
      }

      await controls.start({ ...target, transition });

      if (cancelled) {
        return;
      }

      if (typeof performance !== 'undefined') {
        performance.mark('PieMenu:animation-end');
        const hasStart = performance.getEntriesByName('PieMenu:animation-start').length > 0;
        if (hasStart) {
          performance.measure('PieMenu:animation', 'PieMenu:animation-start', 'PieMenu:animation-end');
        }
      }
    };

    void runAnimation();

    return () => {
      cancelled = true;
    };
  }, [controls, visible]);

  if (sortedSlices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-overlay/70 p-12 text-center text-sm text-text-muted">
        No slices assigned yet.
      </div>
    );
  }

  return (
    <motion.div
      ref={rootRef}
      data-testid={dataTestId}
      data-profiler-id="PieMenu"
      aria-hidden={!visible}
      className={clsx(
        'relative rounded-full border border-border/60 bg-surface/80 shadow-glow-xl backdrop-blur-xl transition',
        visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
      )}
      animate={controls}
      initial={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      style={{
        width: containerSize,
        height: containerSize,
        contain: 'layout style paint',
        transform: 'translateZ(0)',
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
    </motion.div>
  );
}
