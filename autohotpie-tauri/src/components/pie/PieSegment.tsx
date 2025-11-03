import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { getWedgePath } from '../../utils/radial-math';

export interface PieSegmentProps {
  centerX: number;
  centerY: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  label: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  isHovered?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  accentColor?: string;
}

export function PieSegment({
  centerX,
  centerY,
  innerRadius,
  outerRadius,
  startAngle,
  endAngle,
  label,
  icon,
  isActive = false,
  isHovered = false,
  isDisabled = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  accentColor = '#35B1FF',
}: PieSegmentProps) {
  const path = useMemo(
    () => getWedgePath(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle),
    [centerX, centerY, innerRadius, outerRadius, startAngle, endAngle]
  );

  // Calculate label position (middle of segment)
  const labelAngle = (startAngle + endAngle) / 2;
  const labelRadius = (innerRadius + outerRadius) / 2;
  const labelAngleRad = ((labelAngle - 90) * Math.PI) / 180;
  const labelX = centerX + labelRadius * Math.cos(labelAngleRad);
  const labelY = centerY + labelRadius * Math.sin(labelAngleRad);

  // Visual states
  const getSegmentState = () => {
    if (isDisabled) {
      return {
        fill: 'rgba(42, 42, 42, 0.3)',
        stroke: 'transparent',
        scale: 1,
        opacity: 0.3,
        filter: 'none',
      };
    }
    if (isActive) {
      return {
        fill: `${accentColor}1A`, // 10% opacity
        stroke: `${accentColor}99`, // 60% opacity
        scale: 1.0,
        opacity: 1.0,
        filter: `drop-shadow(0 0 20px ${accentColor}80)`,
      };
    }
    if (isHovered) {
      return {
        fill: 'rgba(42, 42, 42, 0.9)',
        stroke: `${accentColor}4D`, // 30% opacity
        scale: 1.15,
        opacity: 1.0,
        filter: `drop-shadow(0 0 10px ${accentColor}33)`,
      };
    }
    return {
      fill: 'rgba(42, 42, 42, 0.7)',
      stroke: 'transparent',
      scale: 1.0,
      opacity: 0.7,
      filter: 'none',
    };
  };

  const state = getSegmentState();

  return (
    <g
      role="button"
      aria-label={label}
      aria-disabled={isDisabled}
      tabIndex={isDisabled ? -1 : 0}
    >
      <motion.path
        d={path}
        fill={state.fill}
        stroke={state.stroke}
        strokeWidth={2}
        initial={{ scale: 1.0, opacity: 0.7 }}
        animate={{
          scale: state.scale,
          opacity: state.opacity,
        }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 22,
        }}
        style={{
          filter: state.filter,
          transformOrigin: `${centerX}px ${centerY}px`,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
        }}
        onClick={!isDisabled ? onClick : undefined}
        onMouseEnter={!isDisabled ? onMouseEnter : undefined}
        onMouseLeave={!isDisabled ? onMouseLeave : undefined}
      />

      {/* Label */}
      <motion.text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="middle"
        className="select-none"
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          fill: isDisabled ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.9)',
          pointerEvents: 'none',
        }}
        initial={{ scale: 1.0, opacity: 1.0 }}
        animate={{
          scale: isHovered ? 1.1 : 1.0,
          opacity: isDisabled ? 0.3 : 1.0,
        }}
        transition={{
          duration: 0.2,
          ease: 'easeInOut',
        }}
      >
        {label}
      </motion.text>

      {/* Icon (if provided) */}
      {icon && (
        <foreignObject
          x={labelX - 12}
          y={labelY - 32}
          width={24}
          height={24}
          style={{ pointerEvents: 'none' }}
        >
          <div className="flex items-center justify-center">{icon}</div>
        </foreignObject>
      )}
    </g>
  );
}
