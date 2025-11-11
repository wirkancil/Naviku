import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Activity, 
  FileText, 
  Calendar, 
  TrendingUp, 
  Users, 
  Settings,
  LogOut,
  User
} from "lucide-react";
import { ENABLE_ANALYTICS } from "@/config/features";

interface NavItem {
  name: string;
  path?: string;
  scrollTo?: string;
  icon: React.ElementType;
  type: 'navigate' | 'scroll';
}

const navItems: NavItem[] = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard, type: 'navigate' },
  { name: "Activities", scrollTo: "activities", icon: Activity, type: 'scroll' },
  { name: "Calendar", scrollTo: "calendar", icon: Calendar, type: 'scroll' },
  { name: "Reports", path: "/reports", icon: FileText, type: 'navigate' },
  ...(ENABLE_ANALYTICS ? [{ name: "Analytics", path: "/analytics", icon: TrendingUp, type: 'navigate' as const }] : []),
  { name: "Contacts", path: "/contacts", icon: Users, type: 'navigate' },
  { name: "Settings", path: "/settings", icon: Settings, type: 'navigate' },
];

export default function Sidebar() {
  const location = useLocation();

  const isActive = (item: NavItem) => {
    if (item.type === 'navigate' && item.path) {
      if (item.path === "/") {
        return location.pathname === "/";
      }
      return location.pathname.startsWith(item.path);
    }
    // For scroll items, they're active when on dashboard
    if (item.type === 'scroll') {
      return location.pathname === "/";
    }
    return false;
  };

  const handleClick = (item: NavItem) => {
    if (item.type === 'scroll' && item.scrollTo) {
      // Only scroll if we're on the dashboard page
      if (location.pathname === "/") {
        const element = document.getElementById(item.scrollTo);
        if (element) {
          element.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
          });
        }
      } else {
        // Navigate to dashboard first, then scroll
        window.location.href = `/#${item.scrollTo}`;
      }
    }
  };

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col shadow-lg z-10">
      {/* Logo/Brand */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Naviku
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          CRM Dashboard
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          
          if (item.type === 'navigate' && item.path) {
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`
                  flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200
                  ${active 
                    ? 'bg-primary text-primary-foreground shadow-md' 
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                  }
                `}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-primary-foreground' : ''}`} />
                {item.name}
              </Link>
            );
          } else {
            return (
              <button
                key={item.name}
                onClick={() => handleClick(item)}
                className={`
                  flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 w-full text-left
                  ${active 
                    ? 'bg-primary text-primary-foreground shadow-md' 
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                  }
                `}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-primary-foreground' : ''}`} />
                {item.name}
              </button>
            );
          }
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 mb-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              John Doe
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              john@naviku.com
            </p>
          </div>
        </div>
        
        <button className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200">
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );
}