import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useEditorStore } from '../../state/editorStore';
import type { PieSlice } from '../../state/editorStore';

interface SegmentItemProps {
  slice: PieSlice;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SegmentItem({ slice, isSelected, onSelect }: SegmentItemProps) {
  const { deleteSlice, duplicateSlice } = useEditorStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slice.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={clsx(
        'group relative mt-2 rounded-lg border p-3 transition-colors',
        isSelected
          ? 'border-accent/60 bg-accent/10'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',
        isDragging && 'opacity-50'
      )}
      onClick={() => onSelect(slice.id)}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab p-1 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-white/40"
        >
          <circle cx="5" cy="4" r="1" fill="currentColor" />
          <circle cx="11" cy="4" r="1" fill="currentColor" />
          <circle cx="5" cy="8" r="1" fill="currentColor" />
          <circle cx="11" cy="8" r="1" fill="currentColor" />
          <circle cx="5" cy="12" r="1" fill="currentColor" />
          <circle cx="11" cy="12" r="1" fill="currentColor" />
        </svg>
      </div>

      {/* Content */}
      <div className="ml-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {slice.accentColor && (
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: slice.accentColor }}
                />
              )}
              <span className="text-sm font-medium text-white">{slice.label}</span>
              {slice.disabled && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                  Disabled
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-white/60">Order: {slice.order}</div>
          </div>

          {/* Actions */}
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                duplicateSlice(slice.id);
              }}
              title="Duplicate"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect
                  x="5"
                  y="5"
                  width="8"
                  height="8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M3 3H9V11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="rounded p-1 text-rose-400/60 hover:bg-rose-500/10 hover:text-rose-400"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete "${slice.label}"?`)) {
                  deleteSlice(slice.id);
                }
              }}
              title="Delete"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 5L5 13H11L12 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 5H13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M6 5V3H10V5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export interface SegmentListProps {
  slices: PieSlice[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function SegmentList({ slices, selectedId, onSelect }: SegmentListProps) {
  const { addSlice } = useEditorStore();

  return (
    <div className="mt-4">
      {/* Add Button */}
      <button
        type="button"
        className="w-full rounded-lg border border-dashed border-white/20 bg-white/5 p-3 text-sm text-white/60 transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-accent"
        onClick={() => {
          addSlice({
            label: `Slice ${slices.length + 1}`,
            order: slices.length,
          });
        }}
      >
        + Add Segment
      </button>

      {/* Segment List */}
      {slices.map((slice) => (
        <SegmentItem
          key={slice.id}
          slice={slice}
          isSelected={slice.id === selectedId}
          onSelect={onSelect}
        />
      ))}

      {slices.length === 0 && (
        <div className="mt-4 text-center text-xs text-white/40">
          No segments yet. Click "Add Segment" to start.
        </div>
      )}
    </div>
  );
}
