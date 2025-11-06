import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface UserProfile {
  id: string;
  full_name: string;
  role: 'account_manager' | 'head' | 'manager' | 'admin';
  entity_id?: string;
  division_id?: string;  // This is "team_id"
  manager_id?: string;
}

export interface Opportunity {
  id: string;
  name: string;
  description: string | null;
  amount: number | null;
  currency: string;
  probability: number;
  expected_close_date: string | null;
  status: 'open' | 'won' | 'lost' | 'cancelled';
  stage: string | null;
  forecast_category: string | null;
  next_step_title: string | null;
  next_step_due_date: string | null;
  is_closed: boolean;
  is_won: boolean;
  opp_stage: string | null;
  owner_id: string;
  customer_id: string;
  end_user_id: string | null;
  pipeline_id: string;
  stage_id: string;
  stage_name?: string;
  customer_name?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  created_from_activity_id?: string | null;
  last_activity_at?: string | null;
  // Backward compatibility with Deal interface
  company_name: string;
  contact_person: string | null;
  contact_email?: string | null;
  deal_value: number;
  notes?: string | null;
}

export interface SalesActivity {
  id: string;
  activity_time: string;
  activity_type: 'Call' | 'Email' | 'Meeting';
  customer_name: string;
  notes?: string;
  user_id: string;
  created_at: string;
}

export interface FilterOptions {
  selectedRep?: string;
  selectedManager?: string;
  dateRange?: string;
}

export const useRoleBasedData = () => {
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [activities, setActivities] = useState<SalesActivity[]>([]);
  const [availableReps, setAvailableReps] = useState<{ id: string; name: string }[]>([]);
  const [availableHeads, setAvailableHeads] = useState<{ id: string; name: string }[]>([]);
  const [availableManagers, setAvailableManagers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (data) {
          setUserProfile(data as UserProfile);
        } else {
          // Create default profile if doesn't exist
          const { data: newProfile, error: createError } = await supabase
            .from('user_profiles')

            .insert({
              user_id: user.id,
              email: user.email,
              full_name: user.email || 'Unknown User',
              role: 'account_manager'
            } as any)
            .select()
            .single();

          if (createError) throw createError;
          setUserProfile(newProfile as UserProfile);
        }
        } catch (err) {
          // Error handling would be displayed in UI
        setError('Failed to load user profile');
      }
    };

    fetchUserProfile();
  }, [user]);

  // Fetch opportunities based on user role
  const fetchOpportunities = async (filters?: FilterOptions) => {
    if (!user || !userProfile) return;

    try {
      // First get opportunity IDs that are already in pipeline_items
      const { data: pipelineItems } = await supabase
        .from('pipeline_items')
        .select('opportunity_id');
      
      const pipelineOpportunityIds = pipelineItems?.map(item => item.opportunity_id) || [];

      let query = supabase
        .from('opportunities')
        .select(`
          *,
          pipeline_stages!stage_id (
            name
          )
        `);

      // Exclude opportunities that are already in pipeline_items
      if (pipelineOpportunityIds.length > 0) {
        query = query.not('id', 'in', `(${pipelineOpportunityIds.join(',')})`);
      }

      // Apply role-based filtering with proper hierarchy (using existing DB fields for now)
      if (userProfile.role === 'account_manager') {
        query = query.eq('owner_id', user.id);
      } else if (userProfile.role === 'head' && userProfile.division_id && userProfile.entity_id) {
        // Head sees ONLY their TEAM (not entire entity!)
        const { data: teamUsers } = await (supabase as any)
          .from('user_profiles')
          .select('user_id')
          .eq('division_id', userProfile.division_id)
          .eq('entity_id', userProfile.entity_id);
        
        if (teamUsers && teamUsers.length > 0) {
          const userIds = teamUsers.map(u => u.user_id).filter(Boolean);
          if (userIds.length > 0) {
            query = query.in('owner_id', userIds);
          }
        }
      } else if (userProfile.role === 'manager') {
        // Managers see opportunities from users in their team
        // Strategy: Query users who have manager_id OR (entity_id + division_id match)
        console.log('🔍 [useRoleBasedData] Manager role detected:', {
          manager_id: userProfile.id,
          entity_id: userProfile.entity_id,
          division_id: userProfile.division_id
        });
        
        let teamUserIds: string[] = [];
        
        // PRIORITY 1: Query users with explicit manager_id assignment
        const { data: managerAssignedUsers, error: managerError } = await (supabase as any)
          .from('user_profiles')
          .select('id, full_name, user_id, role, manager_id')
          .in('role', ['account_manager', 'staff', 'sales'])
          .eq('is_active', true)
          .eq('manager_id', userProfile.id);
        
        console.log('🔍 [useRoleBasedData] Query via manager_id:', {
          error: managerError,
          count: managerAssignedUsers?.length || 0,
          users: managerAssignedUsers?.map((u: any) => ({
            id: u.id,
            name: u.full_name,
            user_id: u.user_id,
            role: u.role
          }))
        });
        
        if (!managerError && managerAssignedUsers) {
          const assignedIds = managerAssignedUsers.map((u: any) => u.user_id).filter(Boolean);
          teamUserIds = [...teamUserIds, ...assignedIds];
          console.log('✅ [useRoleBasedData] Found via manager_id:', assignedIds.length, 'users');
        }
        
        // PRIORITY 2: Query users in same entity + division (if manager has entity + division)
        if (userProfile.division_id && userProfile.entity_id) {
          const { data: teamUsers, error: teamError } = await (supabase as any)
            .from('user_profiles')
            .select('id, full_name, user_id, role, entity_id, division_id, manager_id')
            .in('role', ['account_manager', 'staff', 'sales'])
            .eq('is_active', true)
            .eq('division_id', userProfile.division_id)
            .eq('entity_id', userProfile.entity_id);
          
          console.log('🔍 [useRoleBasedData] Query via entity+division:', {
            error: teamError,
            count: teamUsers?.length || 0,
            users: teamUsers?.map((u: any) => ({
              id: u.id,
              name: u.full_name,
              user_id: u.user_id,
              role: u.role,
              manager_id: u.manager_id
            }))
          });
          
          if (!teamError && teamUsers) {
            const teamIds = teamUsers.map((u: any) => u.user_id).filter(Boolean);
            // Merge and deduplicate
            const existingIds = new Set(teamUserIds);
            const newIds = teamIds.filter((id: string) => !existingIds.has(id));
            teamUserIds = [...teamUserIds, ...newIds];
            console.log('✅ [useRoleBasedData] Found via entity+division:', newIds.length, 'additional users');
          }
        } else {
          console.warn('⚠️ [useRoleBasedData] Manager missing entity_id or division_id:', {
            entity_id: userProfile.entity_id,
            division_id: userProfile.division_id
          });
        }
        
        console.log('📊 [useRoleBasedData] Total team user IDs:', teamUserIds.length, teamUserIds);
        
        if (teamUserIds.length > 0) {
          query = query.in('owner_id', teamUserIds);
          console.log('✅ [useRoleBasedData] Applied filter for', teamUserIds.length, 'team members');
        } else {
          console.warn('⚠️ [useRoleBasedData] No team members found! Opportunities query will return empty.');
        }
      }
      // Admins see all opportunities (no filter applied)

      // Apply additional filters
      if (filters?.selectedRep && userProfile.role !== 'account_manager') {
        query = query.eq('owner_id', filters.selectedRep);
      }

      // Apply manager filter for managers (using existing DB fields - division_id represents manager level)
      if (filters?.selectedManager && filters.selectedManager !== 'all' && userProfile.role === 'manager') {
        const { data: managerUsers } = await (supabase as any)
          .from('user_profiles')
          .select('user_id')
          .eq('division_id', filters.selectedManager);
        
        if (managerUsers && managerUsers.length > 0) {
          const userIds = (managerUsers as any[]).map((u: any) => u.user_id).filter(Boolean);
          if (userIds.length > 0) {
            query = query.in('owner_id', userIds);
          }
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('❌ [useRoleBasedData] Opportunities query error:', error);
        throw error;
      }
      
      console.log('📊 [useRoleBasedData] Opportunities query result:', {
        count: data?.length || 0,
        opportunities: (data || []).slice(0, 5).map((opp: any) => ({
          id: opp.id,
          name: opp.name,
          amount: opp.amount,
          owner_id: opp.owner_id,
          forecast_category: opp.forecast_category,
          expected_close_date: opp.expected_close_date
        }))
      });
      
      // Map and type the data properly with new database fields
      const mappedOpportunities: Opportunity[] = (data || []).map((opp: any) => ({
        id: opp.id,
        name: opp.name,
        description: opp.description,
        amount: opp.amount,
        currency: opp.currency || 'USD',
        probability: opp.probability || 0,
        expected_close_date: opp.expected_close_date,
        status: opp.status,
        stage: opp.pipeline_stages?.name || 'Prospecting',
        forecast_category: opp.forecast_category,
        next_step_title: opp.next_step_title,
        next_step_due_date: opp.next_step_due_date,
        is_closed: opp.is_closed || false,
        is_won: opp.is_won || false,
        opp_stage: opp.opp_stage,
        owner_id: opp.owner_id,
        customer_id: opp.customer_id,
        end_user_id: opp.end_user_id,
        pipeline_id: opp.pipeline_id,
        stage_id: opp.stage_id,
        stage_name: opp.stage_name,
        customer_name: opp.customer_name,
        created_by: opp.created_by,
        created_at: opp.created_at,
        updated_at: opp.updated_at,
        created_from_activity_id: opp.created_from_activity_id,
        // Backward compatibility mapping
        company_name: opp.customer_name || opp.name,
        contact_person: null, // This data is not in opportunities table
        contact_email: null,
        deal_value: opp.amount || 0,
        notes: opp.description
      }));
      
      setOpportunities(mappedOpportunities);
      } catch (err) {
        // Error handling would be displayed in UI
      setError('Failed to load opportunities');
    }
  };

  // Fetch activities based on user role
  const fetchActivities = async (filters?: FilterOptions) => {
    if (!userProfile || !user) return;

    try {
      // First attempt: query the new v2 table
      let query = supabase.from('sales_activity_v2').select('*');

      // Role-based filtering (v2 uses created_by)
      if (userProfile.role === 'account_manager') {
        query = query.eq('created_by', user.id);
      } else if (userProfile.role === 'head' && userProfile.division_id && userProfile.entity_id) {
        // Head sees ONLY their TEAM activities
        const { data: teamUsers } = await (supabase as any)
          .from('user_profiles')
          .select('user_id')
          .eq('division_id', userProfile.division_id)
          .eq('entity_id', userProfile.entity_id);

        const userIds = (teamUsers || []).map((u: any) => u.user_id).filter(Boolean);
        if (userIds.length > 0) {
          query = query.in('created_by', userIds);
        }
      } else if (userProfile.role === 'manager' && userProfile.division_id && userProfile.entity_id) {
        const { data: teamUsers } = await (supabase as any)
          .from('user_profiles')
          .select('user_id')
          .eq('division_id', userProfile.division_id)
          .eq('entity_id', userProfile.entity_id);

        const userIds = (teamUsers || []).map((u: any) => u.user_id).filter(Boolean);
        if (userIds.length > 0) {
          query = query.in('created_by', userIds);
        }
      }

      // Additional filters
      if (filters?.selectedRep && userProfile.role !== 'account_manager') {
        query = query.eq('created_by', filters.selectedRep);
      }

      if (filters?.selectedManager && filters.selectedManager !== 'all' && userProfile.role === 'manager') {
        const { data: managerUsers } = await (supabase as any)
          .from('user_profiles')
          .select('user_id')
          .eq('division_id', filters.selectedManager);

        const userIds = (managerUsers || []).map((u: any) => u.user_id).filter(Boolean);
        if (userIds.length > 0) {
          query = query.in('created_by', userIds);
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      // If v2 relation is missing (42P01 or 404), fall back to legacy table
      if (error && (error.code === '42P01' || (error.message || '').includes('sales_activity_v2'))) {
        // Legacy attempt: query the old table which uses user_id
        let legacyQuery = supabase.from('sales_activity').select('*');

        if (userProfile.role === 'account_manager') {
          legacyQuery = legacyQuery.eq('user_id', user.id);
        } else if (userProfile.role === 'head' && userProfile.division_id && userProfile.entity_id) {
          // Head sees ONLY their TEAM activities (legacy)
          const { data: teamUsers } = await (supabase as any)
            .from('user_profiles')
            .select('user_id')
            .eq('division_id', userProfile.division_id)
            .eq('entity_id', userProfile.entity_id);

          const userIds = (teamUsers || []).map((u: any) => u.user_id).filter(Boolean);
          if (userIds.length > 0) {
            legacyQuery = legacyQuery.in('user_id', userIds);
          }
        } else if (userProfile.role === 'manager' && userProfile.division_id && userProfile.entity_id) {
          const { data: teamUsers } = await (supabase as any)
            .from('user_profiles')
            .select('user_id')
            .eq('division_id', userProfile.division_id)
            .eq('entity_id', userProfile.entity_id);

          const userIds = (teamUsers || []).map((u: any) => u.user_id).filter(Boolean);
          if (userIds.length > 0) {
            legacyQuery = legacyQuery.in('user_id', userIds);
          }
        }

        if (filters?.selectedRep && userProfile.role !== 'account_manager') {
          legacyQuery = legacyQuery.eq('user_id', filters.selectedRep);
        }

        if (filters?.selectedManager && filters.selectedManager !== 'all' && userProfile.role === 'manager') {
          const { data: managerUsers } = await (supabase as any)
            .from('user_profiles')
            .select('user_id')
            .eq('division_id', filters.selectedManager);

          const userIds = (managerUsers || []).map((u: any) => u.user_id).filter(Boolean);
          if (userIds.length > 0) {
            legacyQuery = legacyQuery.in('user_id', userIds);
          }
        }

        const { data: legacyData, error: legacyError } = await legacyQuery.order('created_at', { ascending: false });
        if (legacyError) throw legacyError;

        const mappedActivities: SalesActivity[] = (legacyData || []).map((activity: any) => ({
          id: activity.id,
          activity_time: activity.activity_time || activity.created_at,
          activity_type:
            activity.activity_type?.toLowerCase() === 'meeting'
              ? 'Meeting'
              : activity.activity_type?.toLowerCase() === 'email'
                ? 'Email'
                : 'Call',
          customer_name: activity.customer_name || '-',
          notes: activity.notes || undefined,
          user_id: activity.user_id,
          created_at: activity.created_at || activity.activity_time,
        }));

        setActivities(mappedActivities);
        return;
      }

      if (error) throw error;

      const mappedActivities: SalesActivity[] = (data || []).map((activity: any) => ({
        id: activity.id,
        activity_time: activity.scheduled_at || activity.created_at,
        activity_type:
          activity.activity_type?.toLowerCase() === 'meeting'
            ? 'Meeting'
            : activity.activity_type?.toLowerCase() === 'email'
              ? 'Email'
              : 'Call',
        customer_name: activity.customer_name || '-',
        notes: activity.notes || activity.mom_text || undefined,
        user_id: activity.created_by,
        created_at: activity.created_at || activity.scheduled_at,
      }));

      setActivities(mappedActivities);
    } catch (err) {
      console.error('Failed to load activities:', err);
      setError('Failed to load activities');
    }
  };

  // Fetch available sales reps with proper division-based filtering
  const fetchAvailableReps = async () => {
    if (!userProfile || userProfile.role === 'account_manager') return;

    try {
      let query: any = (supabase as any)
        .from('user_profiles')
        .select('user_id, full_name, email, role, entity_id, division_id, manager_id')
        .eq('role', 'account_manager')
        .eq('is_active', true)
        .not('email', 'ilike', 'demo_am_%@example.com');
      
      if (userProfile.role === 'head' && userProfile.division_id && userProfile.entity_id) {
        // Head sees ONLY their TEAM users
        query = query
          .eq('entity_id', userProfile.entity_id)
          .eq('division_id', userProfile.division_id);
      } else if (userProfile.role === 'manager' && userProfile.division_id && userProfile.entity_id) {
        // Managers see users in their team (division_id)
        query = query.eq('division_id', userProfile.division_id).eq('entity_id', userProfile.entity_id);
      }
      // Admins see all users (no filter applied)

      const { data, error } = await query.order('full_name');

      if (error) throw error;
      setAvailableReps((data as any[])?.map((rep: any) => ({ id: rep.user_id, name: rep.full_name || rep.email || rep.user_id })) || []);
    } catch (err) {
      console.error('Error fetching available reps:', err);
      setAvailableReps([]);
    }
  };

  // Fetch available managers from user_profiles
  const fetchAvailableManagers = async () => {
    if (!userProfile) return;

    try {
      let query = supabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('role', 'manager')
        .eq('is_active', true);

      // Filter based on user's scope
      if (userProfile.role === 'head') {
        if (userProfile.division_id) {
          query = query.eq('division_id', userProfile.division_id);
        } else if (userProfile.entity_id) {
          query = query.eq('entity_id', userProfile.entity_id);
        }
      } else if (userProfile.role === 'manager') {
        // Manager sees managers in same entity/division
        if (userProfile.entity_id && userProfile.division_id) {
          query = query
            .eq('entity_id', userProfile.entity_id)
            .eq('division_id', userProfile.division_id);
        }
      }

      const { data, error } = await query.order('full_name');

      if (error) throw error;
      setAvailableManagers(data?.map(mgr => ({ id: mgr.id, name: mgr.full_name })) || []);
    } catch (err) {
      console.error('Error fetching managers:', err);
      setAvailableManagers([]);
    }
  };

  // Load data when profile is available
  useEffect(() => {
    if (userProfile) {
      Promise.all([
        fetchOpportunities(),
        fetchActivities(),
        fetchAvailableReps(),
        fetchAvailableManagers()
      ]).finally(() => setLoading(false));
    }
  }, [userProfile]);

  // Listen for pipeline item additions to refresh opportunities
  useEffect(() => {
    const handlePipelineItemAdded = () => {
      if (userProfile) {
        fetchOpportunities();
      }
    };

    window.addEventListener('pipelineItemAdded', handlePipelineItemAdded);
    return () => window.removeEventListener('pipelineItemAdded', handlePipelineItemAdded);
  }, [userProfile]);

  // Refresh data with filters
  const refreshData = async (filters?: FilterOptions) => {
    if (!userProfile) return;
    
    setLoading(true);
    await Promise.all([
      fetchOpportunities(filters),
      fetchActivities(filters)
    ]);
    setLoading(false);
  };

  // Calculate metrics
  const metrics = {
    totalDeals: opportunities.length,
    totalValue: opportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0),
    wonDeals: opportunities.filter(opp => opp.status === 'won').length,
    activeDeals: opportunities.filter(opp => opp.status === 'open').length,
    conversionRate: opportunities.length > 0 ? Math.round((opportunities.filter(opp => opp.status === 'won').length / opportunities.length) * 100) : 0,
    totalActivities: activities.length,
    recentActivities: activities.slice(0, 10)
  };

  return {
    userProfile,
    opportunities,
    deals: opportunities, // Keep backward compatibility
    activities,
    availableReps,
    availableHeads,
    availableManagers,
    metrics,
    loading,
    error,
    refreshData
  };
};