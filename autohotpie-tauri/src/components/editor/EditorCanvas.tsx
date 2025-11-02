import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { RadialPieMenu } from '../pie/RadialPieMenu';
import type { PieMenu } from '../../state/editorStore';

export interface EditorCanvasProps {
  menu: PieMenu;
  selectedSliceId: string | null;
  onSliceClick?: (sliceId: string) => void;
}

export function EditorCanvas({ menu, selectedSliceId, onSliceClick }: EditorCanvasProps) {
  // Convert editor menu to RadialPieMenu format
  const radialSlices = useMemo(
    () =>
      menu.slices.map((slice) => ({
        id: slice.id,
        label: slice.label,
        order: slice.order,
        disabled: slice.disabled,
        accentToken: slice.accentColor,
      })),
    [menu.slices]
  );

  return (
    <div className="relative">
      {/* Canvas Background */}
      <div className="absolute inset-0 bg-gradient-radial from-white/5 to-transparent opacity-50" />

      {/* Grid Pattern */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      />

      {/* Center Point Indicator */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/50"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Radial Menu Preview */}
      <div className="relative flex items-center justify-center">
        <RadialPieMenu
          slices={radialSlices}
          visible={radialSlices.length > 0}
          activeSliceId={selectedSliceId}
          radius={200}
          gapDeg={8}
          onHover={(sliceId) => {
            // Optional: highlight on hover
          }}
          onSelect={(sliceId) => {
            onSliceClick?.(sliceId);
          }}
          dataTestId="editor-preview"
        />
      </div>

      {/* Helper Text */}
      {radialSlices.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white/40">
            <p className="text-sm">Add segments to see preview</p>
            <p className="mt-2 text-xs">Drag segments from the list to reorder</p>
          </div>
        </div>
      )}

      {/* Stats Overlay */}
      <div className="absolute bottom-4 right-4 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white/60 backdrop-blur-sm">
        <div className="space-y-1">
          <div>Segments: {radialSlices.length}/12</div>
          <div>Selected: {selectedSliceId ? '1' : 'None'}</div>
          <div className="text-[10px] text-white/40">Click to select</div>
        </div>
      </div>
    </div>
  );
}
