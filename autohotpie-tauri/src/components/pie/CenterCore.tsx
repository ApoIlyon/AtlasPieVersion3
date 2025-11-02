import { motion, AnimatePresence } from 'framer-motion';

export interface CenterCoreProps {
  centerX: number;
  centerY: number;
  radius: number;
  text?: string;
  onClick?: () => void;
}

export function CenterCore({ centerX, centerY, radius, text, onClick }: CenterCoreProps) {
  return (
    <g>
      {/* Background circle */}
      <motion.circle
        cx={centerX}
        cy={centerY}
        r={radius}
        fill="rgba(42, 42, 42, 0.6)"
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth={2}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
        whileHover={onClick ? { scale: 1.05 } : undefined}
        transition={{ duration: 0.2 }}
        onClick={onClick}
      />

      {/* Inner shadow effect */}
      <circle
        cx={centerX}
        cy={centerY}
        r={radius - 2}
        fill="none"
        stroke="rgba(0, 0, 0, 0.3)"
        strokeWidth={1}
        style={{ pointerEvents: 'none' }}
      />

      {/* Text with fade animation */}
      <AnimatePresence mode="wait">
        {text && (
          <motion.text
            key={text}
            x={centerX}
            y={centerY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="select-none"
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.35em',
              fill: '#a0a0a0',
              pointerEvents: 'none',
            }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2, delay: 0.05 }}
          >
            {text}
          </motion.text>
        )}
      </AnimatePresence>

      {/* Default icon when no text */}
      {!text && (
        <motion.g
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 0.7 }}
          transition={{ duration: 0.3 }}
        >
          <circle
            cx={centerX}
            cy={centerY}
            r={8}
            fill="none"
            stroke="#a0a0a0"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
          <circle
            cx={centerX}
            cy={centerY}
            r={3}
            fill="#a0a0a0"
            style={{ pointerEvents: 'none' }}
          />
        </motion.g>
      )}
    </g>
  );
}
