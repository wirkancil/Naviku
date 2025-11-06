import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';

interface AccountManager {
  id: string;
  full_name: string;
  role: string;
  division_id?: string;
  entity_id?: string;
  manager_id?: string;
}

interface SalesTarget {
  id: string;
  assigned_to: string;
  amount: number;
  measure: 'revenue' | 'margin';
  period_start: string;
  period_end: string;
}

export function useSalesTargets() {
  const { profile } = useProfile();
  const [accountManagers, setAccountManagers] = useState<AccountManager[]>([]);
  const [targets, setTargets] = useState<SalesTarget[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch account managers based on role
  const fetchAccountManagers = useCallback(async () => {
    if (!profile) return;

    try {
      setLoading(true);
      let query = supabase
        .from('user_profiles')
        .select('id, full_name, role, division_id, entity_id, manager_id')
        .eq('is_active', true);

      if (profile.role === 'manager') {
        // Manager sees their team members (Account Managers)
        // Option 1: Via manager_team_members table
        const { data: teamMap } = await supabase
          .from('manager_team_members')
          .select('account_manager_id')
          .eq('manager_id', profile.id);

        if (teamMap && teamMap.length > 0) {
          const amIds = teamMap.map(t => t.account_manager_id);
          query = query.in('id', amIds).in('role', ['account_manager', 'staff', 'sales']);
        } else {
          // Fallback: via manager_id or entity+division match
          query = query
            .or(`manager_id.eq.${profile.id},and(entity_id.eq.${profile.entity_id},division_id.eq.${profile.division_id})`)
            .in('role', ['account_manager', 'staff', 'sales']);
        }
      } else if (profile.role === 'head') {
        // Head sees all managers and account managers in their division/entity
        console.log('🔍 [useSalesTargets] Head profile:', {
          id: profile.id,
          entity_id: profile.entity_id,
          division_id: profile.division_id
        });
        
        if (profile.division_id) {
          query = query.eq('division_id', profile.division_id);
          console.log('   Filtering by division_id:', profile.division_id);
        } else if (profile.entity_id) {
          query = query.eq('entity_id', profile.entity_id);
          console.log('   Filtering by entity_id:', profile.entity_id);
        } else {
          console.warn('⚠️ [useSalesTargets] Head has no entity_id or division_id!');
        }
        query = query.in('role', ['manager', 'account_manager', 'staff', 'sales']);
      } else if (profile.role === 'admin') {
        // Admin sees all
        query = query.in('role', ['manager', 'account_manager', 'staff', 'sales']);
      } else {
        // Account Manager: only see themselves
        query = query.eq('id', profile.id);
      }

      const { data, error } = await query.order('full_name');

      if (error) {
        console.error('❌ [useSalesTargets] Error fetching account managers:', error);
        throw error;
      }
      
      console.log('✅ [useSalesTargets] Fetched account managers:', data?.length || 0, 'for role:', profile.role);
      if (data && data.length > 0) {
        console.log('   Account managers:', data.map((am: any) => ({ 
          id: am.id, 
          name: am.full_name, 
          role: am.role,
          entity_id: am.entity_id,
          division_id: am.division_id 
        })));
      }
      setAccountManagers((data || []) as AccountManager[]);
    } catch (error) {
      console.error('❌ [useSalesTargets] Error fetching account managers:', error);
      setAccountManagers([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  // Fetch targets for selected period
  const fetchTargets = useCallback(async (period?: string) => {
    if (!profile) return;

    try {
      setLoading(true);
      
      // Get quarter date range from period string (e.g., "Q1 2026")
      let startDate: string | null = null;
      let endDate: string | null = null;

      if (period) {
        const m = period.match(/Q([1-4])\s+(\d{4})/);
        if (m) {
          const q = parseInt(m[1], 10);
          const year = parseInt(m[2], 10);
          const startMonthIdx = (q - 1) * 3;
          const start = new Date(year, startMonthIdx, 1);
          const end = new Date(year, startMonthIdx + 3, 0);
          startDate = start.toISOString().split('T')[0];
          endDate = end.toISOString().split('T')[0];
        }
      }

      // Determine which profile IDs to fetch targets for
      let targetProfileIds: string[] = [];

      if (profile.role === 'manager') {
        // Manager: fetch targets for their account managers AND themselves
        if (accountManagers.length > 0) {
          targetProfileIds = accountManagers.map(am => am.id);
        }
        // Also include manager's own targets
        targetProfileIds.push(profile.id);
      } else if (profile.role === 'head') {
        // Head: fetch targets for all managers AND account managers in their division/entity
        console.log('🔍 [useSalesTargets] Fetching targets for Head:', {
          entity_id: profile.entity_id,
          division_id: profile.division_id
        });
        
        let managerQuery = supabase
          .from('user_profiles')
          .select('id, full_name, role')
          .eq('is_active', true);
        
        if (profile.division_id) {
          managerQuery = managerQuery.eq('division_id', profile.division_id);
          console.log('   Filtering targets by division_id:', profile.division_id);
        } else if (profile.entity_id) {
          managerQuery = managerQuery.eq('entity_id', profile.entity_id);
          console.log('   Filtering targets by entity_id:', profile.entity_id);
        } else {
          console.warn('⚠️ [useSalesTargets] Head has no entity_id or division_id for targets!');
        }
        
        // Get both managers and account managers
        managerQuery = managerQuery.in('role', ['manager', 'account_manager', 'staff', 'sales']);
        
        const { data: allTeamMembers, error: teamError } = await managerQuery;
        
        if (teamError) {
          console.error('❌ [useSalesTargets] Error fetching team members:', teamError);
        } else {
          console.log('✅ [useSalesTargets] Found team members:', allTeamMembers?.length || 0);
          if (allTeamMembers && allTeamMembers.length > 0) {
            console.log('   Team members:', allTeamMembers.map((m: any) => ({ 
              id: m.id, 
              name: m.full_name, 
              role: m.role 
            })));
            targetProfileIds = allTeamMembers.map(m => m.id);
          }
        }
      } else if (profile.role === 'admin') {
        // Admin: can see all targets (no filter)
        targetProfileIds = [];
      } else {
        // Account Manager: only their own targets
        targetProfileIds = [profile.id];
      }

      console.log('🔍 [useSalesTargets] Fetching targets for profile IDs:', targetProfileIds);
      console.log('🔍 [useSalesTargets] Period filter:', { period, startDate, endDate });

      // Fetch targets
      let query = supabase
        .from('sales_targets')
        .select('*');

      if (targetProfileIds.length > 0) {
        query = query.in('assigned_to', targetProfileIds);
      }

      // Only apply period filter if period is provided
      // If no period, fetch all targets to populate availablePeriods
      if (period && startDate && endDate) {
        // Targets that overlap with the period
        query = query
          .lte('period_start', endDate)
          .gte('period_end', startDate);
      }

      const { data, error } = await query.order('period_start', { ascending: false });

      if (error) {
        console.error('❌ [useSalesTargets] Error fetching targets:', error);
        throw error;
      }
      
      console.log('✅ [useSalesTargets] Fetched targets:', data?.length || 0, 'targets');
      setTargets((data || []) as SalesTarget[]);
    } catch (error) {
      console.error('Error fetching targets:', error);
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, [profile, accountManagers]);

  // Create new target
  const createTarget = useCallback(async (
    assignedTo: string,
    amount: number,
    measure: 'revenue' | 'margin',
    periodStart: Date,
    periodEnd: Date
  ) => {
    if (!profile) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('sales_targets')
      .insert({
        assigned_to: assignedTo,
        amount,
        measure,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }, [profile]);

  // Auto-fetch account managers on mount
  useEffect(() => {
    fetchAccountManagers();
  }, [fetchAccountManagers]);

  return {
    accountManagers,
    targets,
    loading,
    fetchAccountManagers,
    fetchTargets,
    createTarget,
  };
}
