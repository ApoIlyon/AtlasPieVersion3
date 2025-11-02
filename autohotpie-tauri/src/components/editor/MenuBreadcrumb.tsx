import { motion } from 'framer-motion';

export interface MenuBreadcrumbProps {
  menuTitle: string;
  path?: string[];
  onNavigate?: (index: number) => void;
}

export function MenuBreadcrumb({ menuTitle, path = [], onNavigate }: MenuBreadcrumbProps) {
  const items = ['Root', menuTitle, ...path];

  return (
    <nav className="flex items-center gap-2 text-sm">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {index > 0 && (
            <svg
              className="h-4 w-4 text-white/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
          <motion.button
            type="button"
            className={`rounded px-2 py-1 transition-colors ${
              index === items.length - 1
                ? 'font-semibold text-white'
                : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
            onClick={() => onNavigate?.(index)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {item}
          </motion.button>
        </div>
      ))}
    </nav>
  );
}
