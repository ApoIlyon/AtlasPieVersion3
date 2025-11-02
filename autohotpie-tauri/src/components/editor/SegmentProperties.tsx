import { useState } from 'react';
import { motion } from 'framer-motion';
import { useEditorStore } from '../../state/editorStore';
import type { PieSlice } from '../../state/editorStore';

export interface SegmentPropertiesProps {
  slice: PieSlice | null;
}

export function SegmentProperties({ slice }: SegmentPropertiesProps) {
  const { updateSlice } = useEditorStore();
  const [label, setLabel] = useState(slice?.label ?? '');
  const [accentColor, setAccentColor] = useState(slice?.accentColor ?? '#35B1FF');

  if (!slice) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-white/40">
        <div>
          <svg
            className="mx-auto mb-3 h-12 w-12 text-white/20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm">Select a segment to edit properties</p>
        </div>
      </div>
    );
  }

  const handleLabelBlur = () => {
    if (label !== slice.label) {
      updateSlice(slice.id, { label });
    }
  };

  const handleColorChange = (color: string) => {
    setAccentColor(color);
    updateSlice(slice.id, { accentColor: color });
  };

  const handleDisableToggle = () => {
    updateSlice(slice.id, { disabled: !slice.disabled });
  };

  return (
    <motion.div
      key={slice.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-6"
    >
      <h3 className="text-sm font-semibold uppercase tracking-wider text-white/60">
        Segment Properties
      </h3>

      <div className="mt-6 space-y-6">
        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-white/60">Label</label>
          <input
            type="text"
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleLabelBlur}
            placeholder="Enter label..."
          />
        </div>

        {/* Accent Color */}
        <div>
          <label className="block text-xs font-medium text-white/60">Accent Color</label>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="color"
              className="h-10 w-10 cursor-pointer rounded-lg border border-white/10"
              value={accentColor}
              onChange={(e) => handleColorChange(e.target.value)}
            />
            <input
              type="text"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
              value={accentColor}
              onChange={(e) => handleColorChange(e.target.value)}
            />
          </div>
          <div className="mt-2 flex gap-2">
            {['#35B1FF', '#FF6B6B', '#4ECB71', '#FFD93D', '#B794F6', '#FF8A5B'].map(
              (color) => (
                <button
                  key={color}
                  type="button"
                  className="h-6 w-6 rounded border-2 border-transparent transition-all hover:scale-110 focus:border-white/40"
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorChange(color)}
                />
              )
            )}
          </div>
        </div>

        {/* Order */}
        <div>
          <label className="block text-xs font-medium text-white/60">Order</label>
          <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
            {slice.order}
          </div>
          <p className="mt-1 text-xs text-white/40">
            Drag segments in the list to reorder
          </p>
        </div>

        {/* Disabled Toggle */}
        <div>
          <label className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/60">Disabled</span>
            <button
              type="button"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                slice.disabled ? 'bg-accent' : 'bg-white/20'
              }`}
              onClick={handleDisableToggle}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  slice.disabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
          <p className="mt-1 text-xs text-white/40">
            Disabled segments are not selectable
          </p>
        </div>

        {/* Action */}
        <div>
          <label className="block text-xs font-medium text-white/60">Action</label>
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-2 text-sm text-white/60 transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-accent"
          >
            {slice.actionId ? 'Change Action' : '+ Assign Action'}
          </button>
          {slice.actionId && (
            <p className="mt-1 text-xs text-white/60">Action ID: {slice.actionId}</p>
          )}
        </div>

        {/* Child Menu */}
        <div>
          <label className="block text-xs font-medium text-white/60">Child Menu</label>
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-2 text-sm text-white/60 transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-accent"
          >
            {slice.childMenuId ? 'Change Child Menu' : '+ Add Submenu'}
          </button>
          {slice.childMenuId && (
            <p className="mt-1 text-xs text-white/60">Menu ID: {slice.childMenuId}</p>
          )}
        </div>

        {/* Icon */}
        <div>
          <label className="block text-xs font-medium text-white/60">Icon</label>
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-2 text-sm text-white/60 transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-accent"
          >
            {slice.icon ? 'Change Icon' : '+ Select Icon'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
