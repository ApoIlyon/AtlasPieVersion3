import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import clsx from 'clsx';
import { PieSegment } from './PieSegment';
import { CenterCore } from './CenterCore';
import { WedgeSeparator } from './WedgeSeparator';
import { calculateSegmentAngles, getResponsiveRadius } from '../../utils/radial-math';

export interface RadialPieSlice {
  id: string;
  label: string;
  order: number;
  icon?: React.ReactNode;
  accentToken?: string;
  disabled?: boolean;
}

export interface RadialPieMenuProps {
  slices: RadialPieSlice[];
  activeSliceId?: string | null;
  visible?: boolean;
  onSelect?: (sliceId: string, slice: RadialPieSlice) => void;
  onHover?: (sliceId: string, slice: RadialPieSlice) => void;
  onCenterClick?: () => void;
  radius?: number;
  gapDeg?: number;
  dataTestId?: string;
}

const DEFAULT_RADIUS = 156;
const DEFAULT_GAP = 4;

export function RadialPieMenu({
  slices,
  activeSliceId,
  visible = false,
  onSelect,
  onHover,
  onCenterClick,
  radius = DEFAULT_RADIUS,
  gapDeg = DEFAULT_GAP,
  dataTestId = 'radial-pie-menu',
}: RadialPieMenuProps) {
  const [hoveredSliceId, setHoveredSliceId] = useState<string | null>(null);
  const [windowSize, setWindowSize] = useState({ width: 800, height: 600 });
  const controls = useAnimationControls();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Sort slices by order
  const sortedSlices = useMemo(
    () => [...slices].sort((a, b) => a.order - b.order),
    [slices]
  );

  // Calculate responsive radius
  const responsiveRadius = useMemo(() => {
    if (typeof window !== 'undefined') {
      return getResponsiveRadius(windowSize.width, windowSize.height, 100, radius);
    }
    return radius;
  }, [windowSize, radius]);

  // Calculate dimensions
  const containerSize = useMemo(() => responsiveRadius * 2 + 40, [responsiveRadius]);
  const centerX = containerSize / 2;
  const centerY = containerSize / 2;
  const innerRadius = Math.max(Math.round(responsiveRadius * 0.18), 18);
  const segmentInnerRadius = innerRadius + 8;
  const segmentOuterRadius = responsiveRadius - 8;

  // Calculate segment angles
  const segmentAngles = useMemo(
    () => calculateSegmentAngles(sortedSlices.length, gapDeg),
    [sortedSlices.length, gapDeg]
  );

  // Get hovered slice data
  const hoveredSlice = useMemo(
    () => sortedSlices.find((s) => s.id === hoveredSliceId),
    [sortedSlices, hoveredSliceId]
  );

  // Window resize handler
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Animation on visibility change
  useEffect(() => {
    let cancelled = false;
    const runAnimation = async () => {
      if (typeof performance !== 'undefined') {
        performance.mark('RadialPieMenu:animation-start');
      }
      await controls.start({
        opacity: visible ? 1 : 0,
        scale: visible ? 1 : 0.92,
        transition: { type: 'spring', stiffness: 260, damping: 22 },
      });
      if (cancelled) return;
      if (typeof performance !== 'undefined') {
        performance.mark('RadialPieMenu:animation-end');
        const hasStart =
          performance.getEntriesByName('RadialPieMenu:animation-start').length > 0;
        if (hasStart) {
          performance.measure(
            'RadialPieMenu:animation',
            'RadialPieMenu:animation-start',
            'RadialPieMenu:animation-end'
          );
        }
      }
    };

    runAnimation();

    return () => {
      cancelled = true;
    };
  }, [controls, visible]);

  // Blur active element when menu closes
  useEffect(() => {
    if (!visible && rootRef.current) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && rootRef.current.contains(activeElement)) {
        activeElement.blur();
      }
    }
  }, [visible]);

  // Empty state
  if (sortedSlices.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-3xl border border-border bg-overlay/70 p-12 text-center text-sm text-text-muted"
        data-testid={dataTestId}
      >
        No slices assigned yet.
      </div>
    );
  }

  // Handlers
  const handleSegmentClick = (slice: RadialPieSlice) => {
    if (!slice.disabled) {
      onSelect?.(slice.id, slice);
    }
  };

  const handleSegmentHover = (slice: RadialPieSlice) => {
    setHoveredSliceId(slice.id);
    onHover?.(slice.id, slice);
  };

  const handleSegmentLeave = () => {
    setHoveredSliceId(null);
  };

  return (
    <motion.div
      ref={rootRef}
      data-testid={dataTestId}
      data-profiler-id="RadialPieMenu"
      hidden={!visible}
      aria-hidden={!visible}
      className={clsx(
        'relative',
        visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      )}
      animate={controls}
      initial={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      style={{ width: containerSize, height: containerSize }}
    >
      {/* SVG Container */}
      <svg
        width={containerSize}
        height={containerSize}
        className="absolute inset-0"
        style={{ filter: 'drop-shadow(0 0 40px rgba(53, 177, 255, 0.5))' }}
      >
        {/* Outer ring for visual effect */}
        <circle
          cx={centerX}
          cy={centerY}
          r={responsiveRadius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={1}
        />

        {/* Background blur effect */}
        <defs>
          <filter id="blur">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          </filter>
        </defs>

        {/* Segments */}
        {sortedSlices.map((slice, index) => {
          const angles = segmentAngles[index];
          if (!angles) return null;

          return (
            <PieSegment
              key={slice.id}
              centerX={centerX}
              centerY={centerY}
              innerRadius={segmentInnerRadius}
              outerRadius={segmentOuterRadius}
              startAngle={angles.start}
              endAngle={angles.end}
              label={slice.label}
              icon={slice.icon}
              isActive={slice.id === activeSliceId}
              isHovered={slice.id === hoveredSliceId}
              isDisabled={slice.disabled}
              onClick={() => handleSegmentClick(slice)}
              onMouseEnter={() => handleSegmentHover(slice)}
              onMouseLeave={handleSegmentLeave}
              accentColor={slice.accentToken || '#35B1FF'}
            />
          );
        })}

        {/* Wedge Separators */}
        {segmentAngles.map((angles, index) => {
          const isAdjacentToHovered =
            hoveredSliceId &&
            (sortedSlices[index]?.id === hoveredSliceId ||
              sortedSlices[index - 1]?.id === hoveredSliceId ||
              sortedSlices[(index + 1) % sortedSlices.length]?.id === hoveredSliceId);

          return (
            <WedgeSeparator
              key={`separator-${index}`}
              centerX={centerX}
              centerY={centerY}
              innerRadius={segmentInnerRadius}
              outerRadius={segmentOuterRadius}
              angle={angles.end}
              isAdjacent={!!isAdjacentToHovered}
            />
          );
        })}

        {/* Center Core */}
        <CenterCore
          centerX={centerX}
          centerY={centerY}
          radius={innerRadius}
          text={hoveredSlice?.label}
          onClick={onCenterClick}
        />
      </svg>
    </motion.div>
  );
}
