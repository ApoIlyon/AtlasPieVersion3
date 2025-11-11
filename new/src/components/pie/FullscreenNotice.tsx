import { AnimatePresence, motion } from 'framer-motion';

interface FullscreenNoticeProps {
  visible: boolean;
  reason: string;
}

export function FullscreenNotice({ visible, reason }: FullscreenNoticeProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="fullscreen-notice"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        >
          <div className="max-w-lg rounded-3xl border border-white/10 bg-white/10 p-10 text-center text-white shadow-[0_0_40px_rgba(15,23,42,0.6)]">
            <p className="text-xs uppercase tracking-[0.45em] text-white/50">Safe Mode</p>
            <h2 className="mt-3 text-3xl font-semibold">Pie menu temporarily disabled</h2>
            <p className="mt-4 text-sm leading-6 text-white/70">
              {reason}
            </p>
            <p className="mt-6 text-xs text-white/50">
              Exit fullscreen or restore write access to resume normal operation.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
