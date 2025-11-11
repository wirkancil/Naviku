import {
  BarChart3,
  Calendar,
  Home,
  PieChart,
  Users,
  Settings,
  Phone,
  Target,
  Building2,
  Shield,
  X,
  TrendingUp,
  Briefcase,
  Building as BuildingIcon,
  ChevronDown,
  ChevronRight,
  UserCircle,
  LogOut,
  FileText,
  Package
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ENABLE_ADVANCED_PIPELINE, ENABLE_FORECASTING, ENABLE_ADVANCED_REPORTS, ENABLE_ANALYTICS } from "@/config/features";

interface NavigationItem {
  title: string;
  url: string;
  icon: any;
  roles?: string[];
  section?: string;
  children?: NavigationItem[];
}

const getNavigationItems = (role: string): NavigationItem[] => {
  // Account Manager navigation
  if (role === 'account_manager') {
    return [
      { title: "Dashboard", url: "/am/dashboard", icon: Home },
      { title: "Contacts", url: "/contacts", icon: UserCircle },
      { title: "Customers", url: "/customers", icon: Building2 },
      { title: "End Users", url: "/end-users", icon: Users },
      { title: "Pipeline", url: "/pipeline", icon: Target },
      ...(ENABLE_ANALYTICS ? [{ title: "Analytics", url: "/analytics", icon: PieChart }] : []),
      { 
        title: "Insights", 
        url: "",
        icon: BarChart3,
        children: [
          { title: "Sales Summary", url: "/am/sales-summary", icon: TrendingUp },
          ...(ENABLE_ADVANCED_REPORTS ? [{ title: "Reports Builder", url: "/reports", icon: FileText }] : []),
        ]
      },
      { title: "Calendar", url: "/calendar", icon: Calendar },
      { title: "Settings", url: "/settings", icon: Settings },
    ];
  }

  // Manager navigation
  if (role === 'manager') {
    return [
      { title: "Team Dashboard", url: "/manager/team-dashboard", icon: Home },
      { title: "Contact", url: "/contacts", icon: UserCircle },
      { title: "Customer", url: "/customers", icon: Building2 },
      { title: "End User", url: "/end-users", icon: Users },
      { title: "Sales Target", url: "/manager/sales-target", icon: Target },
      { 
        title: "Pipeline", 
        url: "",
        icon: Briefcase,
        children: [
          { title: "Overview", url: "/pipeline/overview", icon: PieChart },
          ...(ENABLE_FORECASTING ? [{ title: "Forecasting", url: "/pipeline/forecasting", icon: TrendingUp }] : []),
        ]
      },
      ...(ENABLE_ADVANCED_PIPELINE ? [{ title: "Advanced Pipeline", url: "/advanced-pipeline", icon: TrendingUp }] : []),
      { title: "Activities", url: "/activities", icon: Phone },
      { title: "Sales Summary", url: "/manager/sales-summary", icon: BarChart3 },
      { title: "Calendar", url: "/calendar", icon: Calendar },
      { title: "Settings", url: "/settings", icon: Settings },
    ];
  }

  // Head navigation
  if (role === 'head') {
    return [
      { title: "Executive Dashboard", url: "/head/executive-dashboard", icon: Home },
      { title: "Contact", url: "/contacts", icon: UserCircle },
      { title: "Customer", url: "/customers", icon: Building2 },
      { title: "End User", url: "/end-users", icon: Users },
      { title: "Manager Target", url: "/head/manager-target", icon: Target },
      ...(ENABLE_ADVANCED_PIPELINE ? [{ title: "Advanced Pipeline", url: "/advanced-pipeline", icon: TrendingUp }] : []),
      ...(ENABLE_ADVANCED_REPORTS ? [{ title: "Reports Builder", url: "/reports", icon: FileText }] : []),
      { title: "Activities", url: "/activities", icon: Phone },
      { title: "Sales Summary", url: "/head/sales-summary", icon: BarChart3 },
      { title: "Settings", url: "/settings", icon: Settings },
    ];
  }

  // Admin navigation
  if (role === 'admin') {
    return [
      { title: "Admin Dashboard", url: "/admin/dashboard", icon: Home },
      { title: "Contact", url: "/contacts", icon: UserCircle },
      { title: "Customer", url: "/customers", icon: Building2 },
      { title: "End User", url: "/end-users", icon: Users },
      ...(ENABLE_ADVANCED_REPORTS ? [{ title: "Reports", url: "/reports", icon: FileText }] : []),
      { title: "User & Roles", url: "/admin/users", icon: Shield },
      { title: "System Logs", url: "/admin/logs", icon: FileText },
      { title: "System Settings", url: "/admin/settings", icon: Settings },
    ];
  }

  // Default fallback
  return [
    { title: "Dashboard", url: "/", icon: Home },
  ];
};

interface CRMSidebarProps {
  onClose?: () => void;
}

export function CRMSidebar({ onClose }: CRMSidebarProps = {}) {
  const { profile } = useProfile();
  const { signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationItems = getNavigationItems(profile?.role || 'account_manager');
  
  // State for collapsible items
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('naviku_mgr_sidebar_state');
    return saved ? JSON.parse(saved) : {};
  });

  // Auto-expand Pipeline when any child route is active
  useEffect(() => {
    if (profile?.role === 'manager') {
      const isPipelineRouteActive = location.pathname.startsWith('/pipeline');
      if (isPipelineRouteActive && !expandedItems['Pipeline']) {
        setExpandedItems(prev => {
          const newState = { ...prev, Pipeline: true };
          localStorage.setItem('naviku_mgr_sidebar_state', JSON.stringify(newState));
          return newState;
        });
      }
    }
  }, [location.pathname, profile?.role, expandedItems]);

  const toggleExpanded = (itemTitle: string) => {
    setExpandedItems(prev => {
      const newState = { ...prev, [itemTitle]: !prev[itemTitle] };
      localStorage.setItem('naviku_mgr_sidebar_state', JSON.stringify(newState));
      return newState;
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile close button */}
      {onClose && (
        <div className="flex justify-end p-4 lg:hidden">
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Logo section */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <img 
            src="/lovable-uploads/5dc53a1f-9dd0-4780-84e9-823a8105b510.png" 
            alt="Naviku Logo" 
            className="h-8 w-8"
          />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Naviku CRM</h2>
            <p className="text-xs text-muted-foreground">Smart sales management</p>
          </div>
        </div>
      </div>

      {/* Role indicator */}
      {profile && (
        <div className="px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-muted-foreground">
              {profile.role === 'account_manager' ? 'Field Sales Staff' :
               profile.role === 'manager' ? 'Level Manager' :
               profile.role === 'head' ? 'Level Head' :
               profile.role === 'admin' ? 'System Administrator' : 'User'}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {navigationItems.map((item) => (
            <li key={item.title}>
              {item.children ? (
                // Collapsible parent item
                <div>
                  <button
                    onClick={() => toggleExpanded(item.title)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors w-full text-left text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm font-medium flex-1">{item.title}</span>
                    {expandedItems[item.title] ? 
                      <ChevronDown className="h-4 w-4" /> : 
                      <ChevronRight className="h-4 w-4" />
                    }
                  </button>
                  {expandedItems[item.title] && (
                    <ul className="ml-6 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <li key={child.title}>
                          <NavLink
                            to={child.url}
                            className={({ isActive }) =>
                              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                isActive
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              }`
                            }
                            end
                            onClick={onClose}
                          >
                            <child.icon className="h-4 w-4 flex-shrink-0" />
                            <span className="text-sm font-medium">{child.title}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                // Regular navigation item
                <NavLink
                  to={item.url}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`
                  }
                  end
                  onClick={onClose}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.title}</span>
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Logout button */}
      <div className="p-4 border-t border-border">
        <button
          onClick={async () => {
            try {
              const { error } = await signOut();
              if (error) {
                console.log('Sign out error:', error);
              }
            } catch (error) {
              console.log('Logout completed (session may have been expired)');
            } finally {
              if (onClose) onClose();
              navigate('/auth', { replace: true });
            }
          }}
          className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors w-full text-left text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}