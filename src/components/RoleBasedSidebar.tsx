import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Users, Calendar, FileText, Settings, PieChart, Building2, Shield, Activity, X, ContactRound, GitBranch, CheckSquare, LogOut, Plus, Bell, Database, UserPlus, Building, TrendingUp, Briefcase, Target, Home, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { RoleBadge } from './RoleBadge';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from '@/hooks/use-toast';
import AddCustomerModal from '@/components/modals/AddCustomerModal';
import AddEndUserModal from '@/components/modals/AddEndUserModal';
import { AddContactModal } from '@/components/modals/AddContactModal';
import { ENABLE_ADVANCED_PIPELINE, ENABLE_FORECASTING, ENABLE_ADVANCED_REPORTS, ENABLE_ANALYTICS } from '@/config/features';

interface NavigationItem {
  title: string;
  url: string;
  icon: any;
  children?: NavigationItem[];
}

interface RoleBasedSidebarProps {
  onClose?: () => void;
}
export const RoleBasedSidebar = ({
  onClose
}: RoleBasedSidebarProps) => {
  const {
    profile,
    loading
  } = useProfile();
  const {
    signOut
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerModalMode, setCustomerModalMode] = useState<'customer' | 'end-user'>('customer');
  const [showEndUserModal, setShowEndUserModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  // Auto-expand Insights menu when on a child route
  useEffect(() => {
    const insightsRoutes = ['/am/sales-summary', '/reports'];
    if (profile?.role === 'account_manager' && insightsRoutes.some(route => location.pathname.startsWith(route))) {
      setExpandedMenus(prev => ({ ...prev, 'Insights': true }));
    }
  }, [location.pathname, profile?.role]);

  if (loading || !profile) {
    return null;
  }
  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
    } finally {
      // Redirect without clearing arbitrary local storage
      if (onClose) onClose();
      navigate('/auth', { replace: true });
    }
  };
  const getNavigationItems = () => {
    switch (profile.role) {
      case 'admin':
        return [
          { title: 'Admin Dashboard', url: '/admin/dashboard', icon: BarChart3 },
          { title: 'Contact', url: '/contacts', icon: ContactRound },
          { title: 'Customer', url: '/customers', icon: Building },
          { title: 'End User', url: '/end-users', icon: UserPlus },
          ...(ENABLE_ADVANCED_REPORTS ? [{ title: 'Reports', url: '/reports', icon: FileText }] : []),
          { title: 'User & Roles', url: '/admin/users', icon: Shield },
          { title: 'System Logs', url: '/admin/logs', icon: Database },
          { title: 'System Settings', url: '/admin/settings', icon: Settings }
        ];
      case 'head':
        return [
          { title: 'Executive Dashboard', url: '/head/executive-dashboard', icon: Building2 },
          { title: 'Contact', url: '/contacts', icon: ContactRound },
          { title: 'Customer', url: '/customers', icon: Building },
          { title: 'End User', url: '/end-users', icon: UserPlus },
          { title: 'Manager Target', url: '/head/manager-target', icon: Target },
          { title: 'Advanced Pipeline', url: '/advanced-pipeline', icon: TrendingUp },
          ...(ENABLE_ADVANCED_REPORTS ? [{ title: 'Reports Builder', url: '/reports', icon: FileText }] : []),
          { title: 'Activities', url: '/activities', icon: Activity },
          { title: 'Sales Summary', url: '/head/sales-summary', icon: BarChart3 },
          { title: 'Settings', url: '/settings', icon: Settings }
        ];
      case 'manager':
        return [
          { title: 'Team Dashboard', url: '/manager/team-dashboard', icon: Home },
          { title: 'Contact', url: '/contacts', icon: ContactRound },
          { title: 'Customer', url: '/customers', icon: Building },
          { title: 'End User', url: '/end-users', icon: UserPlus },
          { title: 'Sales Target', url: '/manager/sales-target', icon: Target },
          { title: 'Overview', url: '/pipeline/overview', icon: Briefcase },
          { title: 'Forecasting', url: '/pipeline/forecasting', icon: TrendingUp },
          { title: 'Advanced Pipeline', url: '/advanced-pipeline', icon: GitBranch },
          { title: 'Activities', url: '/activities', icon: Activity },
          { title: 'Sales Summary', url: '/manager/sales-summary', icon: BarChart3 },
          { title: 'Calendar', url: '/calendar', icon: Calendar },
          { title: 'Settings', url: '/settings', icon: Settings }
        ];
      case 'account_manager':
        return [
          { title: 'Dashboard', url: '/am/dashboard', icon: Home },
          { title: 'Contacts', url: '/contacts', icon: ContactRound },
          { title: 'Customers', url: '/customers', icon: Building },
          { title: 'End Users', url: '/end-users', icon: UserPlus },
          { title: 'Pipeline', url: '/pipeline', icon: Target },
          ...(ENABLE_ANALYTICS ? [{ title: 'Analytics', url: '/analytics', icon: PieChart }] : []),
          { title: 'Activities', url: '/activities', icon: Activity },
          { 
            title: 'Insights', 
            url: '#',
            icon: BarChart3,
            children: [
              { title: 'Sales Summary', url: '/am/sales-summary', icon: TrendingUp },
              ...(ENABLE_ADVANCED_REPORTS ? [{ title: 'Reports Builder', url: '/reports', icon: FileText }] : [])
            ]
          },
          { title: 'Calendar', url: '/calendar', icon: Calendar },
          { title: 'Settings', url: '/settings', icon: Settings }
        ];
      default:
        return [{ title: 'Settings', url: '/settings', icon: Settings }];
    }
  };
  const getQuickActions = () => {
    switch (profile.role) {
      case 'account_manager':
        // Rollback: AM tidak membutuhkan Quick Actions
        return [];
      default:
        return [];
    }
  };
  const getMasterDataActions = () => {
    // Master Data section removed for all roles
    return [];
  };
  const navigationItems = getNavigationItems()
    .map(item => ({
      ...item,
      children: item.children?.filter(child => {
        if (!ENABLE_FORECASTING && child.title === 'Forecasting') return false;
        return true;
      })
    }))
    .filter(item => {
      if (!ENABLE_FORECASTING && item.title === 'Forecasting') return false;
      if (!ENABLE_ADVANCED_PIPELINE && item.title === 'Advanced Pipeline') return false;
      return true;
    });
  const quickActions = getQuickActions();
  const masterDataActions = getMasterDataActions();

  const toggleMenu = (title: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };
  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'add-deal':
        toast({
          title: "Add Deal",
          description: "Opening deal creation form..."
        });
        break;
      case 'add-contact':
        setShowContactModal(true);
        break;
      case 'add-activity':
        toast({
          title: "Add Activity",
          description: "Opening activity creation dialog..."
        });
        navigate('/activities?quick=add-activity');
        if (onClose) onClose();
        break;
      case 'add-customer':
        setCustomerModalMode('customer');
        setShowCustomerModal(true);
        break;
      case 'add-end-user':
        setCustomerModalMode('end-user');
        setShowCustomerModal(true);
        break;
    }
  };
  return <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Mobile close button */}
      {onClose && <div className="flex items-center justify-between p-4 lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/lovable-uploads/5dc53a1f-9dd0-4780-84e9-823a8105b510.png" alt="Naviku Logo" className="h-8 w-auto" />
            <span className="font-bold text-sidebar-foreground">Naviku CRM</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>}

      {/* Logo - Desktop */}
      <div className="hidden lg:flex items-center gap-2 p-6 border-b border-sidebar-border">
        <img src="/lovable-uploads/5dc53a1f-9dd0-4780-84e9-823a8105b510.png" alt="Naviku Logo" className="h-8 w-auto" />
        <div>
          <h2 className="font-bold text-sidebar-foreground">Naviku CRM</h2>
          <p className="text-xs text-sidebar-foreground/60">Smart sales management</p>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {profile.full_name}
            </p>
          </div>
        </div>
        <RoleBadge role={profile.role} className="mt-2" />
      </div>


      {/* Quick Actions */}
      {quickActions.length > 0 && <div className="p-4 border-b border-sidebar-border">
          <h3 className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider mb-2">
            Quick Actions
          </h3>
          <div className="space-y-1">
            {quickActions.map(action => <Button key={action.title} variant="default" size="sm" className="w-full justify-start gap-2 h-8" onClick={() => handleQuickAction(action.action)}>
                <action.icon className="h-3 w-3" />
                {action.title}
              </Button>)}
          </div>
        </div>}

      {/* Master Data Actions */}
      {masterDataActions.length > 0 && <div className="p-4 border-b border-sidebar-border">
          <h3 className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider mb-2">
            <Database className="h-3 w-3 inline mr-1" />
            Master Data
          </h3>
          <div className="space-y-1">
            {masterDataActions.map(action => <Button key={action.title} variant="outline" size="sm" className="w-full justify-start gap-2 h-8" onClick={() => handleQuickAction(action.action)}>
                <action.icon className="h-3 w-3" />
                {action.title}
              </Button>)}
          </div>
        </div>}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-2">
           {navigationItems.map(item => {
             const hasChildren = item.children && item.children.length > 0;
             const isExpanded = expandedMenus[item.title];

             return (
               <li key={item.title}>
                 {hasChildren ? (
                   <>
                     <button
                       onClick={() => toggleMenu(item.title)}
                       className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors w-full text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                     >
                       <item.icon className="h-4 w-4 flex-shrink-0" />
                       <span className="truncate flex-1 text-left">{item.title}</span>
                       {isExpanded ? (
                         <ChevronDown className="h-4 w-4 flex-shrink-0" />
                       ) : (
                         <ChevronRight className="h-4 w-4 flex-shrink-0" />
                       )}
                     </button>
                     {isExpanded && (
                       <ul className="ml-6 mt-1 space-y-1">
                         {item.children.map(child => (
                           <li key={child.title}>
                             <NavLink
                               to={child.url}
                               onClick={() => onClose?.()}
                               className={({ isActive }) =>
                                 `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                   isActive
                                     ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                                     : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                                 }`
                               }
                             >
                               <child.icon className="h-4 w-4 flex-shrink-0" />
                               <span className="truncate flex-1">{child.title}</span>
                             </NavLink>
                           </li>
                         ))}
                       </ul>
                     )}
                   </>
                 ) : (
                   <NavLink
                     to={item.url}
                     onClick={() => onClose?.()}
                     className={({ isActive }) =>
                       `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative ${
                         isActive
                           ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                           : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                       }`
                     }
                   >
                     <item.icon className="h-4 w-4 flex-shrink-0" />
                     <span className="truncate flex-1">{item.title}</span>
                   </NavLink>
                 )}
               </li>
             );
           })}
        </ul>
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-sidebar-border">
        <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/50" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>

      {/* Customer Modal */}
      <AddCustomerModal 
        isOpen={showCustomerModal} 
        onOpenChange={setShowCustomerModal} 
        mode={customerModalMode}
        onSuccess={() => {
          toast({
            title: "Success!",
            description: customerModalMode === 'end-user' ? "End user created successfully." : "Customer created successfully."
          });
        }} />

      {/* End User Modal */}
      <AddEndUserModal isOpen={showEndUserModal} onOpenChange={setShowEndUserModal} onSuccess={() => {
      toast({
        title: "Success!",
        description: "End user created successfully."
      });
    }} />

      {/* Contact Modal */}
      <AddContactModal isOpen={showContactModal} onClose={() => setShowContactModal(false)} onContactAdded={() => {
      toast({
        title: "Success!",
        description: "Contact created successfully."
      });
    }} />
    </div>;
};