import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserCheck, Users, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile, UserProfile } from '@/hooks/useProfile';
import { toast } from 'sonner';
import { useDivisions } from '@/hooks/useDivisions';
import { useEntities } from '@/hooks/useEntities';
import { useAdminUsers } from '@/hooks/useAdminUsers';

interface PendingUser {
  id: string;
  full_name: string | null;
  role: 'admin' | 'head' | 'manager' | 'account_manager' | 'staff';
  created_at: string;
  entity_id?: string | null;
  division_id?: string | null;  // Now means "team_id"
  manager_id?: string | null;
}

export const RoleAssignmentPanel = () => {
  const { canManageRoles } = useProfile();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const { divisions: teams, loading: loadingTeams } = useDivisions();
  const { entities, loading: loadingEntities } = useEntities();
  const { updateUserProfile } = useAdminUsers('', 'all');

  const [roleDraft, setRoleDraft] = useState<Record<string, UserProfile['role']>>({});
  const [assignments, setAssignments] = useState<Record<string, { entityId: string | null; teamId: string | null; managerId: string | null }>>({});

  const fetchPendingUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, role, created_at, entity_id, division_id, manager_id')
        .in('role', ['account_manager', 'head', 'manager', 'staff'] as string[])
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rawUsers = (data ?? []) as any[];
      const allUsers: PendingUser[] = rawUsers.map((u) => ({
        id: u.id,
        full_name: u.full_name ?? null,
        role: (u.role ?? 'account_manager') as PendingUser['role'],
        created_at: u.created_at,
        entity_id: u.entity_id ?? null,
        division_id: u.division_id ?? null,
        manager_id: u.manager_id ?? null,
      }));
      
      // Filter to only show truly pending users based on NEW role requirements
      const pendingUsers = allUsers.filter(user => {
        // Head role requires entity_id only
        if (user.role === 'head' && !user.entity_id) return true;
        // Manager role requires entity_id + division_id (team)
        if (user.role === 'manager' && (!user.entity_id || !user.division_id)) return true;
        // Account manager/staff roles require entity_id + division_id + manager_id
        if ((user.role === 'account_manager' || user.role === 'staff') && (!user.entity_id || !user.division_id || !user.manager_id)) return true;
        // If all requirements are met, user is not pending
        return false;
      });
      
      setPendingUsers(pendingUsers);

      // Prefill drafts from existing assignments
      const nextAssignments: Record<string, { entityId: string | null; teamId: string | null; managerId: string | null }> = {};
      const nextRoles: Record<string, UserProfile['role']> = {};
      for (const u of pendingUsers) {
        nextAssignments[u.id] = {
          entityId: u.entity_id ?? null,
          teamId: u.division_id ?? null,
          managerId: u.manager_id ?? null,
        };
        nextRoles[u.id] = u.role as UserProfile['role'];
      }
      setAssignments(nextAssignments);
      setRoleDraft(nextRoles);
    } catch (error: any) {
      console.error('Error fetching pending users:', error);
      toast.error('Failed to load pending users');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (user: PendingUser) => {
    console.log('🔄 Starting handleSave for user:', user);
    
    const targetRole = roleDraft[user.id] || user.role;
    const selectedEntity = assignments[user.id]?.entityId ?? null;
    const selectedTeam = assignments[user.id]?.teamId ?? null;
    const selectedManager = assignments[user.id]?.managerId ?? null;

    console.log('📋 Role approval data:', {
      userId: user.id,
      targetRole,
      selectedEntity,
      selectedTeam,
      selectedManager,
      currentUserRole: user.role,
      currentEntityId: user.entity_id,
      currentTeamId: user.division_id,
      currentManagerId: user.manager_id
    });

    if (!targetRole) {
      console.error('❌ No target role selected');
      toast.error('Please select a role first');
      return;
    }

    // Validate NEW role requirements
    if (targetRole === 'head' && !selectedEntity) {
      console.error('❌ Head role requires entity');
      toast.error('Head role requires an entity selection');
      return;
    }

    if (targetRole === 'manager' && (!selectedEntity || !selectedTeam)) {
      console.error('❌ Manager role requires entity + team');
      toast.error('Manager role requires entity and team selection');
      return;
    }

    if (targetRole === 'account_manager' && (!selectedEntity || !selectedTeam || !selectedManager)) {
      console.error('❌ Account Manager role requires entity + team + manager');
      toast.error('Account Manager role requires entity, team, and manager selection');
      return;
    }
    
    // Legacy support: staff role (no longer used in UI but may exist in data)
    if (targetRole === 'staff' && (!selectedEntity || !selectedTeam || !selectedManager)) {
      console.error('❌ Staff role requires entity + team + manager');
      toast.error('Staff role requires entity, team, and manager selection');
      return;
    }

    setUpdating(user.id);
    console.log('🔄 Set updating status for user:', user.id);

    try {
      console.log('🚀 Updating user profile via Supabase...');
      
      // Update using Supabase directly with new structure
      const { error } = await supabase
        .from('user_profiles')
        .update({
          role: targetRole,
          entity_id: selectedEntity,
          division_id: selectedTeam,  // division_id = team_id
          manager_id: selectedManager,
        })
        .eq('id', user.id);
      
      if (error) throw error;

      console.log('✅ Profile update successful');
      toast.success(`User role updated to ${targetRole} successfully`);

      console.log('⏳ Waiting 500ms before refreshing data...');
      setTimeout(() => {
        console.log('🔄 Calling fetchPendingUsers to refresh data');
        fetchPendingUsers();
      }, 500);
    } catch (error: any) {
      console.error('💥 Error in handleSave:', error);
      toast.error(error.message || 'Failed to update user role');
    } finally {
      console.log('🏁 Clearing updating status for user:', user.id);
      setUpdating(null);
    }
  };

  useEffect(() => {
    if (canManageRoles()) {
      fetchPendingUsers();
    }
  }, [canManageRoles]);

  if (!canManageRoles()) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Manage Roles & Assignments
            </CardTitle>
            <CardDescription>
              Assign roles and set entity/team/manager for pending users
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchPendingUsers}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        ) : pendingUsers.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Pending Users</h3>
            <p className="text-muted-foreground">
              All users have been assigned roles. New registrations will appear here.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingUsers.map((user) => {
                const draftRole = roleDraft[user.id] || user.role;
                const assignment = assignments[user.id] || { entityId: null, teamId: null, managerId: null };
                
                // Filter teams by selected entity
                const availableTeams = assignment.entityId
                  ? teams.filter((t) => t.entity_id === assignment.entityId)
                  : teams;
                
                // Filter managers by selected team (managers in same team)
                const availableManagers = assignment.teamId
                  ? pendingUsers.filter((u) => u.role === 'manager' && u.division_id === assignment.teamId && u.id !== user.id)
                  : [];

                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name || 'No name provided'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        <AlertCircle className="h-3 w-3" />
                        Pending
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={draftRole}
                        disabled={updating === user.id}
                        onValueChange={(value) => setRoleDraft((prev) => ({ ...prev, [user.id]: value as UserProfile['role'] }))}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder="Assign role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="head">Head</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="account_manager">Account Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={assignment.entityId || undefined}
                        disabled={updating === user.id || loadingEntities}
                        onValueChange={(value) => setAssignments((prev) => ({
                          ...prev,
                          [user.id]: { ...prev[user.id], entityId: value, teamId: null, managerId: null }
                        }))}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue placeholder={loadingEntities ? 'Loading...' : 'Select entity'} />
                        </SelectTrigger>
                        <SelectContent>
                          {entities.length === 0 ? (
                            <SelectItem value="" disabled>
                              {loadingEntities ? 'Loading...' : 'No entities'}
                            </SelectItem>
                          ) : (
                            entities.map((entity) => (
                              <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={assignment.teamId || undefined}
                        disabled={updating === user.id || loadingTeams || (draftRole === 'head') || !assignment.entityId}
                        onValueChange={(value) => setAssignments((prev) => ({
                          ...prev,
                          [user.id]: { ...prev[user.id], teamId: value, managerId: null }
                        }))}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue placeholder={loadingTeams ? 'Loading...' : (draftRole === 'head' ? 'N/A' : 'Select team')} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTeams.length === 0 ? (
                            <SelectItem value="" disabled>
                              {loadingTeams ? 'Loading...' : 'No teams'}
                            </SelectItem>
                          ) : (
                            availableTeams.map((team) => (
                              <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={assignment.managerId || undefined}
                        disabled={updating === user.id || (draftRole !== 'account_manager' && draftRole !== 'staff') || !assignment.teamId}
                        onValueChange={(value) => setAssignments((prev) => ({
                          ...prev,
                          [user.id]: { ...prev[user.id], managerId: value }
                        }))}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue placeholder={(draftRole !== 'account_manager' && draftRole !== 'staff') ? 'N/A' : 'Select manager'} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableManagers.length === 0 ? (
                            <SelectItem value="" disabled>
                              No managers in team
                            </SelectItem>
                          ) : (
                            availableManagers.map((mgr) => (
                              <SelectItem key={mgr.id} value={mgr.id}>{mgr.full_name || 'Unnamed'}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleSave(user)}
                          disabled={updating === user.id}
                        >
                          Save
                        </Button>
                        {updating === user.id && (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};