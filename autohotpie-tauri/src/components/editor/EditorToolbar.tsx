import { motion } from 'framer-motion';
import clsx from 'clsx';

export interface EditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave?: () => void;
  onCancel?: () => void;
}

export function EditorToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onCancel,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-3">
      {/* Left Side - History */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={clsx(
            'rounded-lg border p-2 transition-colors',
            canUndo
              ? 'border-white/10 bg-white/5 text-white hover:bg-white/10'
              : 'cursor-not-allowed border-white/5 bg-white/5 text-white/30'
          )}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
        </button>

        <button
          type="button"
          className={clsx(
            'rounded-lg border p-2 transition-colors',
            canRedo
              ? 'border-white/10 bg-white/5 text-white hover:bg-white/10'
              : 'cursor-not-allowed border-white/5 bg-white/5 text-white/30'
          )}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
            />
          </svg>
        </button>
      </div>

      {/* Center - Title */}
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        <span className="text-sm font-semibold text-white">Visual Menu Editor</span>
      </div>

      {/* Right Side - Actions */}
      <div className="flex items-center gap-2">
        {onCancel && (
          <motion.button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
            onClick={onCancel}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Cancel
          </motion.button>
        )}

        {onSave && (
          <motion.button
            type="button"
            className="rounded-lg border border-accent/60 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            onClick={onSave}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Save Changes
          </motion.button>
        )}
      </div>
    </div>
  );
}
