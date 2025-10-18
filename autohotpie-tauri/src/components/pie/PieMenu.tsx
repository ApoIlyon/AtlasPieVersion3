import { useEffect, useMemo } from 'react';
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
  onSelect?: (sliceId: string) => void;
  onHover?: (sliceId: string) => void;
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
  const sliceArc = useMemo(() => {
    if (!sortedSlices.length) {
      return 0;
    }
    return (TAU / sortedSlices.length) - toRadians(gapDeg);
  }, [sortedSlices.length, gapDeg]);

  const controls = useAnimationControls();

  useEffect(() => {
    void controls.start({
      opacity: visible ? 1 : 0,
      scale: visible ? 1 : 0.92,
      transition: { type: 'spring', stiffness: 260, damping: 22 },
    });
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
      className={clsx(
        'relative h-[320px] w-[320px] rounded-full border border-border/60 bg-surface/80 shadow-glow-lg backdrop-blur-xl transition',
        visible ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      animate={controls}
      initial={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div className="absolute inset-6 rounded-full border border-border/40 bg-overlay/60 shadow-inner" />
      {centerContent && (
        <div className="absolute inset-14 flex items-center justify-center text-center text-xs uppercase tracking-[0.35em] text-text-secondary">
          {centerContent}
        </div>
      )}
      {sortedSlices.map((slice, index) => {
        const startAngle = index * ((TAU) / sortedSlices.length) - Math.PI / 2;
        const arc = sliceArc;
        const midAngle = startAngle + arc / 2;
        const isActive = slice.id === activeSliceId;
        const x = Math.cos(midAngle) * (radius - 48);
        const y = Math.sin(midAngle) * (radius - 48);

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
            onMouseEnter={() => onHover?.(slice.id)}
            onFocus={() => onHover?.(slice.id)}
            onClick={() => !slice.disabled && onSelect?.(slice.id)}
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
