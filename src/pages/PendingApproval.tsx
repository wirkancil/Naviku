import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Shield, Users, Building, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const PendingApproval = () => {
  const { signOut } = useAuth();
  const { profile, loading } = useProfile();
  const navigate = useNavigate();

  // Jika profile sudah approved, keluar dari halaman pending secara otomatis
  useEffect(() => {
    if (loading) return;
    if (!profile) return;

    // Debug logging
    console.log('🔍 [PendingApproval] Profile check:', {
      role: profile.role,
      entity_id: profile.entity_id,
      division_id: profile.division_id,
      manager_id: (profile as any).manager_id,
      is_active: profile.is_active
    });

    const roleText = String(profile.role);
    
    // Manager memerlukan entity_id DAN division_id
    const managerNeedsApproval = profile.role === 'manager' && (!profile.entity_id || !profile.division_id);
    
    const needsApproval = (
      roleText === 'pending' ||
      managerNeedsApproval
    );

    if (managerNeedsApproval) {
      console.warn('⚠️ [PendingApproval] Manager needs approval:', {
        has_entity_id: !!profile.entity_id,
        has_division_id: !!profile.division_id,
        entity_id: profile.entity_id,
        division_id: profile.division_id
      });
    }

    if (!needsApproval) {
      console.log('✅ [PendingApproval] Profile approved, redirecting...');
      switch (profile.role) {
        case 'admin':
          navigate('/admin/dashboard', { replace: true });
          return;
        case 'account_manager':
          navigate('/sales-dashboard', { replace: true });
          return;
        case 'head':
          navigate('/executive-dashboard', { replace: true });
          return;
        case 'manager':
          navigate('/team-dashboard', { replace: true });
          return;
        default:
          break;
      }
    }
  }, [profile, loading, navigate]);

  const handleSignOut = async () => {
    try {
      await signOut();
      // Navigate within SPA to avoid full page reloads
      navigate('/auth', { replace: true });
    } catch (error) {
      console.error('Logout error:', error);
      // Navigate even if logout fails
      navigate('/auth', { replace: true });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-warning/10 rounded-full">
              <Clock className="h-8 w-8 text-warning" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Account Pending Approval</CardTitle>
          <CardDescription>
            Your account has been created successfully and is awaiting role assignment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <Badge variant="outline" className="mb-4">
              <Shield className="h-3 w-3 mr-1" />
              Current Status: Pending
            </Badge>
            <p className="text-sm text-muted-foreground mb-4">
              Welcome, {profile?.full_name || 'User'}!
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-sm">What happens next?</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span>A Strategic Leader will review your account</span>
              </div>
              <div className="flex items-start gap-2">
                <Building className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span>You'll be assigned to the appropriate role and department</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span>Once approved, you'll have access to your CRM dashboard</span>
              </div>
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            <p>This usually takes 1-2 business days.</p>
            <p className="mt-1">Please contact your administrator if you have any questions.</p>
          </div>

          <Button 
            variant="outline" 
            onClick={handleSignOut}
            className="w-full"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApproval;