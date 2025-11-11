import { Badge } from "@/components/ui/badge";
import { Shield, Users, Building } from "lucide-react";

interface RoleBadgeProps {
  role: 'admin' | 'head' | 'manager' | 'account_manager' | 'pending' | 'staff';
  className?: string;
  showEnhanced?: boolean;
  title?: string;
  region?: string;
}

export const RoleBadge = ({ role, className = "", showEnhanced = false, title, region }: RoleBadgeProps) => {
  const getRoleConfig = (role: string) => {
    switch (role) {
      case 'staff':
      case 'account_manager':
        return {
          label: 'Field Sales Staff',
          icon: <Shield className="h-3 w-3" />,
          variant: 'default' as const,
          className: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
        };
      case 'head':
        return {
          label: 'Level Head',
          icon: <Users className="h-3 w-3" />,
          variant: 'secondary' as const,
          className: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800'
        };
      case 'manager':
        return {
          label: 'Level Manager',
          icon: <Building className="h-3 w-3" />,
          variant: 'outline' as const,
          className: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
        };
      case 'admin':
        return {
          label: 'System Administrator',
          icon: <Building className="h-3 w-3" />,
          variant: 'default' as const,
          className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
        };
      case 'pending':
        return {
          label: 'Pending',
          icon: <Shield className="h-3 w-3" />,
          variant: 'secondary' as const,
          className: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
        };
      default:
        return {
          label: 'Unknown',
          icon: <Shield className="h-3 w-3" />,
          variant: 'default' as const,
          className: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800'
        };
    }
  };

  const config = getRoleConfig(role);

  // Build enhanced display text
  const getDisplayText = () => {
    if (!showEnhanced) return config.label;
    
    const parts = [config.label];
    if (title) parts.push(title);
    if (region) parts.push(region);
    
    return parts.join(' – ');
  };

  return (
    <Badge 
      variant={config.variant} 
      className={`flex items-center gap-1 ${config.className} ${className}`}
    >
      {config.icon}
      {getDisplayText()}
    </Badge>
  );
};