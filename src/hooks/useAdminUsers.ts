import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useAdminUsers(query: string, roleFilter: string) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const p_query = query?.trim() ? query.trim() : null;

      // Map UI filter values -> DB roles (updated for new role structure)
      const roleMap: Record<string, string | null> = {
        all: null,
        admin: 'admin',
        head: 'head',
        manager: 'manager',
        account_manager: 'account_manager',
        staff: 'staff',
        pending: 'pending'
      };
      const p_role = roleMap[roleFilter] ?? null;

      const { data, error } = await supabase.rpc('get_users_with_profiles', {
        p_query,
        p_role,
      });

      if (!alive) return;
      if (error) {
        console.error('get_users_with_profiles error', error);
        setUsers([]);
      } else {
        // Map the data to include backward compatibility and handle null values
        const mappedUsers = (data ?? []).map((user: any) => ({
          ...user,
          // Handle role as text (pending users) or enum
          role: user.role ?? 'pending'
        }));
        setUsers(mappedUsers);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [query, roleFilter, tick]);

  const refetch = () => setTick(x => x + 1);

  const updateUserProfile = async (
    userId: string,
    role: string,
    entityId?: string | null,
    teamId?: string | null,
    managerId?: string | null
  ) => {
    
    try {
      console.log('🔄 Starting updateUserProfile:', {
        userId,
        role,
        entityId,
        teamId,
        managerId
      });

      // Use RPC function to update user profile (bypasses RLS recursion issues)
      // This function uses SECURITY DEFINER and checks admin status internally
      const { data: rpcResult, error: rpcError } = await supabase.rpc('admin_update_user_profile', {
        p_profile_id: userId,
        p_role: role,
        p_entity_id: entityId ?? null,
        p_division_id: teamId ?? null,
        p_manager_id: managerId ?? null
      });

      if (rpcError) {
        console.error('❌ RPC Update Error:', rpcError);
        console.error('❌ Error details:', {
          code: rpcError.code,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint
        });
        
        let errorMessage = rpcError.message;
        if (rpcError.message?.includes('must have')) {
          errorMessage = `Validation failed: ${rpcError.message}. Please ensure all required fields are set for this role.`;
        } else if (rpcError.message?.includes('Only admin')) {
          errorMessage = 'You must be an admin to update user profiles.';
        }
        
        return { success: false, error: errorMessage };
      }

      // Check if update was successful
      if (rpcResult === false || rpcResult === null) {
        console.error('❌ RPC returned false - profile may not exist');
        return { 
          success: false, 
          error: 'Update failed: User profile not found or update failed.' 
        };
      }

      // Fetch updated data to verify
      const { data: updateData, error: fetchError } = await supabase
        .from('user_profiles')
        .select('id, role, entity_id, division_id, manager_id')
        .eq('id', userId)
        .single();

      if (fetchError) {
        console.error('❌ Error fetching updated data:', fetchError);
        // Still return success if RPC succeeded
        return { success: true };
      }

      console.log('✅ Updated data:', updateData);
      
      // Check if values actually changed
      if (updateData) {
        const valuesMatch = 
          updateData.role === role &&
          updateData.entity_id === entityId &&
          updateData.division_id === teamId &&
          updateData.manager_id === managerId;
        
        if (!valuesMatch) {
          console.warn('⚠️ Values do not match after update:', {
            expected: { role, entityId, teamId, managerId },
            actual: updateData
          });
        } else {
          console.log('✅ All values match after update');
        }

        // Update local state immediately with updated data
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === userId 
              ? { 
                  ...user, 
                  role: updateData.role as any,
                  entity_id: updateData.entity_id,
                  division_id: updateData.division_id,
                  manager_id: updateData.manager_id
                }
              : user
          )
        );
      }

      // Refetch to get latest data from database (with delay to ensure DB is updated)
      console.log('🔄 Refetching user list...');
      setTimeout(() => {
        refetch();
      }, 500);
      
      return { success: true, data: updateData };
    } catch (error: any) {
      console.error('💥 Unexpected error in updateUserProfile:', error);
      return { success: false, error: error.message };
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('admin_delete_user', { p_id: userId });
      
      if (error) {
        console.error('RPC error:', error);
        return { success: false, error: error.message };
      }

      // RPC returns jsonb with {success, error?, message?}
      if (data?.success === false) {
        console.error('Delete failed:', data.error);
        return { success: false, error: data.error };
      }

      // Success - refetch user list
      refetch();
      return { success: true, message: data?.message };
    } catch (err: any) {
      console.error('Unexpected error:', err);
      return { success: false, error: err.message };
    }
  };

  return { users, loading, refetch, updateUserProfile, deleteUser };
}