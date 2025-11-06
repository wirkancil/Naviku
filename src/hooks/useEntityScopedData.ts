import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from './useProfile';

export interface EntityScopedOpportunity {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
  owner_id: string;
  customer_id: string;
  created_at: string;
}

export interface EntityScopedTarget {
  id: string;
  assigned_to: string;
  amount: number;
  period_start: string;
  period_end: string;
  measure: string;
}

export const useEntityScopedData = () => {
  const { profile } = useProfile();
  const [opportunities, setOpportunities] = useState<EntityScopedOpportunity[]>([]);
  const [targets, setTargets] = useState<EntityScopedTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntityScopedOpportunities = async () => {
    try {
      const { data, error } = await supabase.rpc('get_entity_scoped_opportunities');
      if (error) throw error as any;
      setOpportunities(data || []);
    } catch (err: any) {
      console.error('Error fetching entity-scoped opportunities:', err);
      // Fallback if RPC is missing (PGRST202) or not registered yet
      if (err?.code === 'PGRST202' || (typeof err?.message === 'string' && err.message.includes('Could not find the function'))) {
        try {
          const currentUser = (await supabase.auth.getUser()).data.user;
          if (!currentUser) {
            setOpportunities([]);
            return;
          }
          let query = supabase
            .from('opportunities')
            .select('id, name, amount, stage, owner_id, customer_id, created_at');

          if (profile?.role === 'account_manager' || profile?.role === 'sales') {
            query = query.eq('owner_id', currentUser.id);
          } else if (profile?.role === 'manager' && profile?.entity_id && profile?.division_id) {
            const { data: owners } = await supabase
              .from('user_profiles')
              .select('user_id')
              .eq('entity_id', profile.entity_id)
              .eq('division_id', profile.division_id);
            const ownerIds = (owners || []).map((o: any) => o.user_id).filter(Boolean);
            if (ownerIds.length > 0) {
              query = query.in('owner_id', ownerIds);
            } else {
              // Ensure empty result if no owners found in scope
              query = query.eq('owner_id', '00000000-0000-0000-0000-000000000000');
            }
          } else if (profile?.role === 'head' && profile?.entity_id && profile?.division_id) {
            // Head sees ONLY their TEAM (not entire entity!)
            const { data: owners } = await supabase
              .from('user_profiles')
              .select('user_id')
              .eq('entity_id', profile.entity_id)
              .eq('division_id', profile.division_id);
            const ownerIds = (owners || []).map((o: any) => o.user_id).filter(Boolean);
            if (ownerIds.length > 0) {
              query = query.in('owner_id', ownerIds);
            }
          } // admins see all by default

          const { data: oppData, error: oppError } = await query;
          if (oppError) throw oppError;
          setOpportunities((oppData || []) as any);
        } catch (fallbackErr: any) {
          console.error('Fallback opportunities query failed:', fallbackErr);
          setError(fallbackErr?.message || 'Failed to load opportunities');
        }
      } else {
        setError(err.message);
      }
    }
  };

  const fetchEntityScopedTargets = async () => {
    try {
      const { data, error } = await supabase.rpc('get_entity_scoped_targets');
      if (error) throw error as any;
      setTargets(data || []);
    } catch (err: any) {
      console.error('Error fetching entity-scoped targets:', err);
      if (err?.code === 'PGRST202' || (typeof err?.message === 'string' && err.message.includes('Could not find the function'))) {
        try {
          let query = supabase
            .from('sales_targets')
            .select('id, assigned_to, amount, period_start, period_end, measure, entity_id, division_id');

          if ((profile?.role === 'account_manager' || profile?.role === 'sales') && profile?.id) {
            query = query.eq('assigned_to', profile.id);
          } else if (profile?.role === 'manager' && profile?.entity_id && profile?.division_id) {
            query = query
              .eq('entity_id', profile.entity_id)
              .eq('division_id', profile.division_id);
          } else if (profile?.role === 'head' && profile?.entity_id && profile?.division_id) {
            // Head sees ONLY their TEAM targets (not entire entity!)
            query = query
              .eq('entity_id', profile.entity_id)
              .eq('division_id', profile.division_id);
          } // admins see all by default

          const { data: targetData, error: targetError } = await query;
          if (targetError) throw targetError;
          // Strip extra fields if present
          setTargets((targetData || []).map((t: any) => ({
            id: t.id,
            assigned_to: t.assigned_to,
            amount: t.amount || 0,
            period_start: t.period_start,
            period_end: t.period_end,
            measure: t.measure,
          })));
        } catch (fallbackErr: any) {
          console.error('Fallback targets query failed:', fallbackErr);
          setError(fallbackErr?.message || 'Failed to load targets');
        }
      } else {
        setError(err.message);
      }
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        fetchEntityScopedOpportunities(),
        fetchEntityScopedTargets()
      ]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getOpportunityStats = () => {
    const totalValue = opportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);
    const stageBreakdown: Record<string, number> = {};
    opportunities.forEach(opp => {
      stageBreakdown[opp.stage] = (stageBreakdown[opp.stage] || 0) + 1;
    });
    return {
      total: opportunities.length,
      totalValue,
      stageBreakdown: Object.entries(stageBreakdown).map(([stage, count]) => ({
        stage,
        count
      }))
    };
  };

  const getTargetStats = () => {
    const totalTargetValue = targets.reduce((sum, target) => sum + target.amount, 0);
    const currentPeriodTargets = targets.filter(target => {
      const now = new Date();
      const start = new Date(target.period_start);
      const end = new Date(target.period_end);
      return start <= now && now <= end;
    });
    return {
      total: targets.length,
      totalValue: totalTargetValue,
      currentPeriod: currentPeriodTargets.length,
      currentPeriodValue: currentPeriodTargets.reduce((sum, target) => sum + target.amount, 0)
    };
  };

  const getEntityScope = () => {
    if (!profile) return 'loading';
    switch (profile.role) {
      case 'admin':
        return 'global';
      case 'head':
        return 'entity';
      case 'manager':
        return 'team';
      case 'account_manager':
        return 'individual';
      default:
        return 'none';
    }
  };

  useEffect(() => {
    if (profile) {
      fetchAllData();
    }
  }, [profile]);

  return {
    opportunities,
    targets,
    loading,
    error,
    getOpportunityStats,
    getTargetStats,
    getEntityScope,
    refetch: fetchAllData,
  };
};