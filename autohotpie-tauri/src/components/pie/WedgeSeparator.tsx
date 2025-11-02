import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { getSeparatorPath } from '../../utils/radial-math';

export interface WedgeSeparatorProps {
  centerX: number;
  centerY: number;
  innerRadius: number;
  outerRadius: number;
  angle: number;
  isAdjacent?: boolean;
}

export function WedgeSeparator({
  centerX,
  centerY,
  innerRadius,
  outerRadius,
  angle,
  isAdjacent = false,
}: WedgeSeparatorProps) {
  const path = useMemo(
    () => getSeparatorPath(centerX, centerY, innerRadius, outerRadius, angle),
    [centerX, centerY, innerRadius, outerRadius, angle]
  );

  return (
    <motion.path
      d={path}
      stroke="rgba(255, 255, 255, 0.2)"
      strokeWidth={2}
      strokeLinecap="round"
      style={{ pointerEvents: 'none' }}
      animate={{
        opacity: isAdjacent ? 0.3 : 0.0,
      }}
      transition={{
        duration: 0.15,
        ease: 'easeInOut',
      }}
    />
  );
}
