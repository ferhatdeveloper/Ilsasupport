import { Home, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

interface ModernBreadcrumbProps {
  items: BreadcrumbItem[];
}

export function ModernBreadcrumb({ items }: ModernBreadcrumbProps) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <div className="rounded-lg shadow-lg overflow-hidden border border-red-500/40 bg-gradient-to-r from-red-600 to-[#ff006f]">
        <div className="px-4 py-2.5">
          <ol className="flex items-center space-x-2 text-white">
            {/* Home Icon */}
            <li>
              <button
                onClick={items[0]?.onClick}
                className="flex items-center hover:bg-white/20 rounded-md px-2 py-1 transition-all duration-200"
              >
                <Home className="w-4 h-4" />
              </button>
            </li>

            {/* Breadcrumb Items */}
            {items.map((item, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="flex items-center space-x-2"
              >
                <ChevronRight className="w-4 h-4 text-white/60" />
                
                {item.active ? (
                  <span className="px-3 py-1 bg-white/22 rounded-md font-medium text-sm max-w-[220px] truncate">
                    {item.label}
                  </span>
                ) : (
                  <button
                    onClick={item.onClick}
                    className="px-3 py-1 hover:bg-white/20 rounded-md transition-all duration-200 text-sm text-white/85 hover:text-white max-w-[220px] truncate"
                  >
                    {item.label}
                  </button>
                )}
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </motion.nav>
  );
}
