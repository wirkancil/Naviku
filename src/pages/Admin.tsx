import React, { useState } from 'react';
import { Settings2, Search, Filter, Save, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RoleBadge } from '@/components/RoleBadge';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { useProfile, UserProfile } from '@/hooks/useProfile';
import { TitleManagement } from '@/components/TitleManagement';
import { RegionManagement } from '@/components/RegionManagement';
import { OrganizationalHierarchy } from '@/components/OrganizationalHierarchy';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useTitles } from '@/hooks/useTitles';
import { useEntities } from '@/hooks/useEntities';
import { EntityManagement } from '@/components/EntityManagement';
import { GlobalSettings } from '@/components/GlobalSettings';
import { FxRateManagement } from '@/components/FxRateManagement';
import { AuditLogViewer } from '@/components/AuditLogViewer';
import { EntityScopedDashboard } from '@/components/EntityScopedDashboard';
import { supabase } from '@/integrations/supabase/client';
import { useDivisions } from '@/hooks/useDivisions';
import { DivisionDepartmentManagement } from '@/components/DivisionDepartmentManagement';
import { toast } from 'sonner';

type RoleFilter = 'all' | 'account_manager' | 'staff' | 'head' | 'manager' | 'admin' | 'pending';

interface UserUpdate {
  userId: string;
  role?: UserProfile['role'];
  title_id?: string;
  entity_id?: string | null;
  division_id?: string | null;  // Now means "team_id"
  manager_id?: string | null;
  isDirty: boolean;
}

export default function Admin() {
  const { profile } = useProfile();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const { users, loading: usersLoading, refetch, updateUserProfile, deleteUser } = useAdminUsers(searchQuery, roleFilter);
  const { titles } = useTitles();
  const { entities, refetch: refetchEntities } = useEntities();
  const { divisions: teams, refetch: refetchTeams } = useDivisions();

  // Department logic removed - using entity-team structure now

  React.useEffect(() => {
    const handler = () => {
      refetchTeams();
      refetchEntities(); // Also refresh entities when org units change
    };
    window.addEventListener('org-units-changed', handler);
    return () => window.removeEventListener('org-units-changed', handler);
  }, [refetchTeams, refetchEntities]);

  const [userUpdates, setUserUpdates] = useState<Record<string, UserUpdate>>({});
  const [savingUsers, setSavingUsers] = useState<Set<string>>(new Set());

  // No need for client-side filtering anymore since we use server-side filtering
  const filteredUsers = users || [];

  const handleRoleChange = (userId: string, newRole: UserProfile['role']) => {
    // Find the user to get their current role
    const user = users?.find(u => u.id === userId);
    const currentRole = user?.role;
    
    // Only mark as dirty if the role actually changed
    if (currentRole !== newRole) {
      setUserUpdates(prev => ({
        ...prev,
        [userId]: {
          userId,
          role: newRole,
          isDirty: true
        }
      }));
    } else {
      // If role is the same as original, remove from updates
      setUserUpdates(prev => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
    }
  };

  const handleTitleChange = (userId: string, newTitleId: string) => {
    // Find the user to get their current title
    const user = users?.find(u => u.id === userId);
    const currentTitleId = user?.title_id;
    
    // Only mark as dirty if the title actually changed
    if (currentTitleId !== newTitleId) {
      setUserUpdates(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          userId,
          title_id: newTitleId,
          isDirty: true
        }
      }));
    } else {
      // If title is the same as original, remove title from updates
      setUserUpdates(prev => {
        const updated = { ...prev };
        if (updated[userId]) {
          delete updated[userId].title_id;
          // If no other changes, remove the entire entry
          if (!updated[userId].role && !updated[userId].region_id && !updated[userId].division_id && !updated[userId].department_id) {
            delete updated[userId];
          }
        }
        return updated;
      });
    }
  };

  const handleEntityChange = (userId: string, newEntityId: string) => {
    // Find the user to get their current entity
    const user = users?.find(u => u.id === userId);
    const currentEntityId = user?.entity_id;
    
    // Handle "none" or empty value as NULL
    const nextEntityId = (newEntityId === 'none' || newEntityId === '') ? null : newEntityId;
    
    // Debug logging
    console.log('🔍 Entity Change Debug:', {
      userId,
      newEntityId,
      nextEntityId,
      availableEntities: entities.map(e => ({ id: e.id, name: e.name })),
      entityExists: nextEntityId ? !!entities.find(e => e.id === nextEntityId) : 'N/A'
    });
    
    // Validate entity exists if not null
    if (nextEntityId && !entities.find(e => e.id === nextEntityId)) {
      console.error('❌ Entity validation failed - entity not found in list');
      toast.error('Invalid entity selected. Please refresh the page.');
      return;
    }
    
    // Only mark as dirty if the entity actually changed
    if (currentEntityId !== nextEntityId) {
      setUserUpdates(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          userId,
          entity_id: nextEntityId,
          isDirty: true
        }
      }));
    } else {
      // If entity is the same as original, remove entity from updates
      setUserUpdates(prev => {
        const updated = { ...prev };
        if (updated[userId]) {
          delete updated[userId].entity_id;
          // If no other changes, remove the entire entry
          if (!updated[userId].role && !updated[userId].title_id && !updated[userId].division_id) {
            delete updated[userId];
          }
        }
        return updated;
      });
    }
  };

  const handleDivisionChange = (userId: string, newDivisionId: string) => {
    const user = users?.find(u => u.id === userId);
    const currentDivisionId = user?.division_id || null;
    const nextDivisionId = newDivisionId === 'none' ? null : (newDivisionId || null);
    if (currentDivisionId !== nextDivisionId) {
      setUserUpdates(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          userId,
          division_id: nextDivisionId,
          isDirty: true,
        }
      }));
    } else {
      setUserUpdates(prev => {
        const updated = { ...prev };
        if (updated[userId]) {
          delete updated[userId].division_id;
          if (!updated[userId].role && !updated[userId].title_id && !updated[userId].region_id && !updated[userId].department_id) {
            delete updated[userId];
          }
        }
        return updated;
      });
    }
  };

  // handleDepartmentChange removed - departments no longer exist

  const handleTeamChange = (userId: string, teamId: string) => {
    setUserUpdates(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        userId,
        teamId,
        isDirty: true
      }
    }));
  };

  const saveUserRole = async (userId: string) => {
    const update = userUpdates[userId];
    if (!update || !update.isDirty) return;

    setSavingUsers(prev => new Set(prev).add(userId));

    try {
      const current = users?.find(u => u.id === userId);
      const newRole = update.role ?? current?.role ?? 'account_manager';
      
      // Get entity_id from update or current (handle "none" -> null)
      let newEntityId = update.entity_id !== undefined 
        ? (update.entity_id === 'none' || update.entity_id === '' ? null : update.entity_id)
        : (current?.entity_id ?? null);
      
      // Get division_id (team_id) from update or current (handle "none" -> null)
      const newDivisionId = update.division_id !== undefined 
        ? (update.division_id === 'none' || update.division_id === '' ? null : update.division_id)
        : (current?.division_id ?? null);
      
      // Get manager_id from update or current (handle "none" -> null)
      const newManagerId = update.manager_id !== undefined
        ? (update.manager_id === 'none' || update.manager_id === '' ? null : update.manager_id)
        : (current?.manager_id ?? null);

      // Validate entity_id exists if not null
      if (newEntityId && !entities.find(e => e.id === newEntityId)) {
        toast.error('Invalid entity selected. Please refresh the page.');
        setSavingUsers(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        return;
      }

      console.log('🔍 Saving user:', {
        userId,
        role: newRole,
        entity_id: newEntityId,
        division_id: newDivisionId,
        manager_id: newManagerId
      });

      const result = await updateUserProfile(
        userId,
        newRole,
        newEntityId,  // ← FIXED: Now sending entity_id
        newDivisionId,
        newManagerId  // ← FIXED: Now sending manager_id
      );

      if (result.success) {
        toast.success('User profile updated successfully');
        // Remove from updates after successful save
        setUserUpdates(prev => {
          const newUpdates = { ...prev };
          delete newUpdates[userId];
          return newUpdates;
        });
        // Refetch to get latest data (with small delay to ensure state is updated)
        setTimeout(() => {
          refetch();
        }, 300);
      } else {
        toast.error(result.error || 'Failed to update user profile');
      }
    } catch (error: any) {
      console.error('Error saving user:', error);
      toast.error(error.message || 'Failed to update user profile');
    } finally {
      setSavingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const discardChanges = (userId: string) => {
    setUserUpdates(prev => {
      const newUpdates = { ...prev };
      delete newUpdates[userId];
      return newUpdates;
    });
  };

  const handleDeleteUser = async (userId: string) => {
    const user = users?.find(u => u.id === userId);
    const isAdminTarget = user?.role === 'admin';
    const isSelf = userId === profile?.id;
    
    if (isAdminTarget) {
      alert('Cannot delete admin users');
      return;
    }
    
    if (isSelf) {
      alert('Cannot delete your own account');
      return;
    }
    
    const userName = user?.full_name || user?.email || 'this user';
    const confirmed = window.confirm(
      `Are you sure you want to delete ${userName}?\n\n` +
      'This will:\n' +
      '• Remove user profile\n' +
      '• Delete all assigned targets\n' +
      '• Remove team member mappings\n' +
      '• Delete all activities\n\n' +
      'This action cannot be undone.'
    );
    
    if (!confirmed) return;
    
    setSavingUsers(prev => new Set([...prev, userId]));
    const result = await deleteUser(userId);
    setSavingUsers(prev => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    
    if (!result.success) {
      console.error('Failed to delete user:', result.error);
      alert('Failed to delete user: ' + (result.error || 'Unknown error'));
    } else {
      setUserUpdates(prev => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
      alert('User deleted successfully!\n\n' + (result.message || ''));
      refetch();
    }
  };

  const getCurrentRole = (user: any) => {
    return userUpdates[user.id]?.role || user.role;
  };

  const getCurrentTitle = (user: any) => {
    return userUpdates[user.id]?.title_id !== undefined ? userUpdates[user.id]?.title_id : user.title_id;
  };

  const getCurrentEntity = (user: any) => {
    return userUpdates[user.id]?.entity_id !== undefined ? userUpdates[user.id]?.entity_id : user.entity_id;
  };

  const isDirty = (userId: string) => {
    const updates = userUpdates[userId];
    return updates?.isDirty || false;
  };

  const canManageUser = (userRole: UserProfile['role'], userId: string) => {
    // Admin can manage all users except themselves
    if (profile?.role === 'admin') {
      return userId !== profile?.id;
    }
    // Manager can manage non-admin and non-manager users
    if (profile?.role === 'manager') {
      return userRole !== 'admin' && userRole !== 'manager';
    }
    return false;
  };

  if (usersLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings2 className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
      </div>

      {/* Organizational Hierarchy - visible to all roles */}
      <OrganizationalHierarchy />

      <PermissionGuard permission="canAccessUserManagement">
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <TitleManagement />
            <RegionManagement />
            <DivisionDepartmentManagement />
          </div>
          
          <EntityManagement />
          
          <GlobalSettings />
          
          <FxRateManagement />
          
          <AuditLogViewer />
          
          <EntityScopedDashboard />
        </div>
      </PermissionGuard>

      <PermissionGuard permission="canAccessUserManagement">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <CardTitle className="text-xl">Manage User Roles</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
              <Select value={roleFilter} onValueChange={(value: RoleFilter) => setRoleFilter(value)}>
                <SelectTrigger className="w-full sm:w-40">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
          <SelectItem value="all">All Roles</SelectItem>
          <SelectItem value="pending">Pending Assignment</SelectItem>
          <SelectItem value="account_manager">Field Sales Staff</SelectItem>
          <SelectItem value="head">Level Head</SelectItem>
          <SelectItem value="manager">Level Manager</SelectItem>
          <SelectItem value="admin">System Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Name</TableHead>
                    <TableHead className="min-w-[180px] hidden sm:table-cell">Email</TableHead>
                    <TableHead className="min-w-[140px]">Current Role</TableHead>
                    <TableHead className="min-w-[100px]">Title</TableHead>
                    <TableHead className="min-w-[80px]">Entity</TableHead>
                    <TableHead className="min-w-[120px]">Team</TableHead>
                    <TableHead className="text-right min-w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                 {filteredUsers.map((user) => {
                   const currentRole = getCurrentRole(user);
                   const isUserDirty = isDirty(user.id);
                   const isSaving = savingUsers.has(user.id);
                   const canManage = canManageUser(user.role, user.id);
                   const currentDivisionId = (userUpdates[user.id]?.division_id !== undefined) ? (userUpdates[user.id]?.division_id ?? '') : (user.division_id ?? '');
                   // currentDepartmentId removed - departments no longer exist

                    return (
                     <TableRow key={user.id} className={isUserDirty ? "bg-muted/30" : ""}>
                       <TableCell className="font-medium">
                         <div className="truncate max-w-[120px]" title={user.full_name || 'No name'}>
                           {user.full_name || 'No name'}
                         </div>
                       </TableCell>
                        <TableCell className="text-muted-foreground hidden sm:table-cell">
                          <div className="truncate max-w-[180px]" title={user.email || 'No email'}>
                            {user.email || 'No email'}
                          </div>
                        </TableCell>
                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select
                            value={getCurrentTitle(user) || undefined}
                            onValueChange={(value) => handleTitleChange(user.id, value)}
                            disabled={isSaving}
                          >
                            <SelectTrigger className="w-full max-w-[100px]">
                              <SelectValue placeholder="Optional" />
                            </SelectTrigger>
                            <SelectContent className="max-w-[150px]">
                              {titles
                                .filter(title => title.is_active && title.id && title.id.trim() !== '')
                                .map((title) => (
                                  <SelectItem key={title.id} value={title.id}>
                                    <span className="truncate">{title.name}</span>
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm text-muted-foreground truncate block max-w-[100px]">
                            {titles.find(t => t.id === user.title_id)?.name || '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select
                            value={getCurrentEntity(user) || undefined}
                            onValueChange={(value) => handleEntityChange(user.id, value)}
                            disabled={isSaving}
                          >
                            <SelectTrigger className="w-full max-w-[100px]">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent className="max-w-[150px]">
                              <SelectItem value="none">
                                <span className="text-muted-foreground">No Entity</span>
                              </SelectItem>
                              {entities
                                .filter(entity => entity.is_active && entity.id && entity.id.trim() !== '')
                                .map((entity) => (
                                  <SelectItem key={entity.id} value={entity.id}>
                                    <span className="truncate">{entity.name}</span>
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm text-muted-foreground truncate block max-w-[100px]">
                            {entities.find(e => e.id === user.entity_id)?.name || '-'}
                          </span>
                        )}
                       </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select
                            value={currentDivisionId || ''}
                            onValueChange={(value) => handleDivisionChange(user.id, value)}
                            disabled={isSaving}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue placeholder="Team" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {teams.map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                         <div className="flex items-center gap-2 justify-end">
                          {canManage ? (
                            <>
                              <Select
                                value={currentRole}
                                onValueChange={(value: UserProfile['role']) => handleRoleChange(user.id, value)}
                                disabled={isSaving || (profile?.role !== 'admin' && (user.role === 'admin' || user.id === profile?.id))}
                              >
                                <SelectTrigger className="w-full max-w-[140px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-w-[200px]">
          <SelectItem value="account_manager">Field Sales Staff</SelectItem>
          <SelectItem value="head">Level Head</SelectItem>
          <SelectItem value="manager">Level Manager</SelectItem>
          <SelectItem value="admin">System Administrator</SelectItem>
                                </SelectContent>
                              </Select>
                              {isUserDirty && (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => saveUserRole(user.id)}
                                    disabled={isSaving}
                                    className="h-8 w-8 p-0"
                                  >
                                    {isSaving ? (
                                      <div className="h-3 w-3 animate-spin border border-current border-t-transparent rounded-full" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => discardChanges(user.id)}
                                    disabled={isSaving}
                                    className="h-8 w-8 p-0"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteUser(user.id)}
                                disabled={isSaving || (profile?.role !== 'admin' && (user.role === 'admin' || user.id === profile?.id))}
                                className="h-8"
                              >
                                Delete
                              </Button>
                            </>
                          ) : (
                            <RoleBadge role={user.role} />
                          )}
                         </div>
                      </TableCell>
                     </TableRow>
                  );
                })}
              </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
      </PermissionGuard>
    </div>
  );
}