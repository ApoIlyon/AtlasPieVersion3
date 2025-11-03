import React from 'react';
import { motion } from 'framer-motion';
import { RadialPieMenu } from '../pie/RadialPieMenu';
import type { PieMenu } from '../../state/editorStore';
import './MenuPreview.css';

interface MenuPreviewProps {
  menu: PieMenu;
}

/**
 * MenuPreview - Center canvas showing radial menu preview (Kando style)
 */
export function MenuPreview({ menu }: MenuPreviewProps) {
  // Convert editor menu to RadialPieMenu format
  const radialSlices = menu.slices.map((slice) => ({
    id: slice.id,
    label: slice.label,
    order: slice.order,
    disabled: slice.disabled,
    accentToken: slice.accentColor,
  }));

  return (
    <div className="menu-preview">
      {/* Center Point Indicator */}
      <motion.div
        className="center-indicator"
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

      {/* Radial Menu */}
      {radialSlices.length > 0 ? (
        <div className="preview-menu-container">
          <RadialPieMenu
            slices={radialSlices}
            isOpen={true}
            onSliceClick={(sliceId) => {
              console.log('Preview clicked:', sliceId);
            }}
            onClose={() => {}}
            centerX={400}
            centerY={400}
          />
        </div>
      ) : (
        <div className="empty-preview">
          <div className="empty-preview-icon">🎯</div>
          <p className="empty-preview-text">No slices yet</p>
          <p className="empty-preview-hint">
            Add items using the + button in properties
          </p>
        </div>
      )}

      {/* Info Overlay */}
      <div className="preview-info">
        <div className="info-badge">
          {menu.slices.length} / 12 slices
        </div>
      </div>
    </div>
  );
}
