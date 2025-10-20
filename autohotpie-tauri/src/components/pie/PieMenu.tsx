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
}: PieMenuProps) {
  const sortedSlices = useMemo(
    () => [...slices].sort((a, b) => a.order - b.order),
    [slices],
  );
  const containerSize = useMemo(() => Math.round(radius * 2 + 40), [radius]);
  const sliceArc = useMemo(() => {
    if (!sortedSlices.length) {
      return 0;
    }
    return (TAU / sortedSlices.length) - toRadians(gapDeg);
  }, [sortedSlices.length, gapDeg]);

  const controls = useAnimationControls();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonDistance = useMemo(() => Math.max(radius - 56, radius * 0.6), [radius]);
  const innerInset = useMemo(() => Math.max(Math.round(radius * 0.18), 18), [radius]);

  useEffect(() => {
    void controls.start({
      opacity: visible ? 1 : 0,
      scale: visible ? 1 : 0.92,
      transition: { type: 'spring', stiffness: 260, damping: 22 },
    });
  }, [controls, visible]);

  useEffect(() => {
    if (!visible && rootRef.current) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && rootRef.current.contains(activeElement)) {
        activeElement.blur();
      }
    }
  }, [visible]);

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
      data-testid="pie-menu"
      hidden={!visible}
      aria-hidden={!visible}
      className={clsx(
        'relative rounded-full border border-border/60 bg-surface/80 shadow-glow-xl backdrop-blur-xl transition',
        visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
      )}
      animate={controls}
      initial={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      style={{ width: containerSize, height: containerSize }}
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
        const startAngle = index * ((TAU) / sortedSlices.length) - Math.PI / 2;
        const arc = sliceArc;
        const midAngle = startAngle + arc / 2;
        const isActive = slice.id === activeSliceId;
        const x = Math.cos(midAngle) * buttonDistance;
        const y = Math.sin(midAngle) * buttonDistance;

        return (
          <button
            key={slice.id}
            type="button"
            className={clsx(
              'group absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-transparent bg-overlay/70 text-sm font-medium text-text-secondary transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/80',
              slice.disabled && 'cursor-not-allowed opacity-40',
              isActive && 'z-10 border-accent/60 bg-accent/10 text-text-primary shadow-glow-focus',
            )}
            style={{ transform: `translate(${x}px, ${y}px)` }}
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
