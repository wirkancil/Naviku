import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";

export interface SalesSummaryMetrics {
  totalRevenue: number;
  totalMargin: number;
  marginPercentage: number;
  dealsClosed: number;
  targetAchievement: number;
  averageDealSize: number;
  conversionRate: number;
  topPerformers: Array<{
    id: string;
    name: string;
    revenue: number;
    margin: number;
    deals: number;
  }>;
  revenueByMonth: Array<{
    month: string;
    revenue: number;
    margin: number;
    deals: number;
  }>;
  pipelineByStage: Array<{
    stage: string;
    count: number;
    value: number;
  }>;
}

export const useSalesSummary = (startDate?: Date, endDate?: Date) => {
  const { user } = useAuth();
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['sales-summary', user?.id, profile?.role, startDate, endDate],
    queryFn: async () => {
      if (!user || !profile) throw new Error('Not authenticated');

      // Build date filter
      let dateFilter = '';
      if (startDate && endDate) {
        dateFilter = `and created_at >= '${startDate.toISOString()}' and created_at <= '${endDate.toISOString()}'`;
      }

      // Get won opportunities based on role
      let query = supabase
        .from('opportunities')
        .select(`
          id,
          amount,
          currency,
          created_at,
          owner_id,
          user_profiles!opportunities_owner_id_fkey(full_name),
          pipeline_items(cost_of_goods, service_costs, other_expenses)
        `)
        .eq('is_won', true);

      if (profile.role === 'manager') {
        // Get team opportunities (Account Managers) + Manager's own opportunities
        // Manager's achievements = Manager's own sales + All Account Managers' sales
        const { data: teamMembers } = await supabase
          .from('manager_team_members')
          .select('account_manager_id')
          .eq('manager_id', profile.id);

        const amIds = (teamMembers || []).map((m: any) => m.account_manager_id);
        let ownerUserIds: string[] = [user.id]; // Start with Manager's own user_id
        
        if (amIds.length > 0) {
          const { data: amProfiles } = await supabase
            .from('user_profiles')
            .select('user_id')
            .in('id', amIds);
          const amUserIds = (amProfiles || []).map((p: any) => p.user_id).filter(Boolean);
          ownerUserIds = [user.id, ...amUserIds]; // Manager + Account Managers
        } else if (profile.department_id) {
          // Fallback: get all Account Managers in department (excluding Manager to avoid duplicate)
          const { data: deptUsers } = await supabase
            .from('user_profiles')
            .select('user_id')
            .eq('department_id', profile.department_id)
            .in('role', ['account_manager', 'staff']); // Only AMs, not Manager
          const deptUserIds = (deptUsers || []).map((u: any) => u.user_id).filter(Boolean);
          ownerUserIds = [user.id, ...deptUserIds]; // Manager + Department AMs
        }

        // Always include Manager's own user_id + team members
        query = query.in('owner_id', ownerUserIds);
      } else if (profile.role === 'head') {
        // Get all opportunities in division (prioritize division_id, fallback to entity_id)
        let divisionUserIds: string[] = [];

        if (profile.division_id) {
          // First try division_id (preferred)
          const { data: divisionMembers } = await supabase
            .from('user_profiles')
            .select('user_id')
            .eq('division_id', profile.division_id)
            .eq('is_active', true);

          if (divisionMembers && divisionMembers.length > 0) {
            divisionUserIds = divisionMembers.map(m => m.user_id).filter(Boolean);
          }
        } else if (profile.entity_id) {
          // Fallback to entity_id if no division_id
          const { data: entityMembers } = await supabase
            .from('user_profiles')
            .select('user_id')
            .eq('entity_id', profile.entity_id)
            .eq('is_active', true);

          if (entityMembers && entityMembers.length > 0) {
            divisionUserIds = entityMembers.map(m => m.user_id).filter(Boolean);
          }
        }

        if (divisionUserIds.length > 0) {
          query = query.in('owner_id', divisionUserIds);
        } else {
          // If no division or entity, fallback to just the current user
          query = query.eq('owner_id', user.id);
        }
      }

      const { data: wonOpps, error } = await query;
      if (error) throw error;

      // Use projects (PO) for revenue when available, fallback to won opportunities amount
      const wonOppIds = (wonOpps || []).map((o: any) => o.id);
      let totalRevenue = 0;
      let totalMargin = 0;
      try {
        const { data: projects, error: projErr } = await supabase
          .from('projects')
          .select('opportunity_id, po_amount')
          .in('opportunity_id', wonOppIds);
        if (projErr) throw projErr;
        const projList = projects || [];
        if (projList.length > 0) {
          totalRevenue = projList.reduce((sum: number, p: any) => sum + (Number(p.po_amount) || 0), 0);
          const projectOppIds = projList.map((p: any) => p.opportunity_id).filter(Boolean);
          const { data: pipeItems, error: pipeErr } = await supabase
            .from('pipeline_items')
            .select('opportunity_id, cost_of_goods, service_costs, other_expenses, status')
            .in('opportunity_id', projectOppIds)
            .eq('status', 'won');
          if (pipeErr) throw pipeErr;
          const wonPipeItems = pipeItems || [];
          const totalCosts = wonPipeItems.reduce((sum: number, item: any) => {
            const cogs = Number(item.cost_of_goods) || 0;
            const svc = Number(item.service_costs) || 0;
            const other = Number(item.other_expenses) || 0;
            return sum + cogs + svc + other;
          }, 0);
          totalMargin = totalCosts > 0 ? (totalRevenue - totalCosts) : 0;
        } else {
          // Fallback: no projects -> use won opportunities amount; margin stays 0
          totalRevenue = wonOpps?.reduce((sum: number, opp: any) => sum + (opp.amount || 0), 0) || 0;
          totalMargin = 0;
        }
      } catch (e) {
        // If projects or pipeline query fails, fallback safely
        totalRevenue = wonOpps?.reduce((sum: number, opp: any) => sum + (opp.amount || 0), 0) || 0;
        totalMargin = 0;
      }

      const marginPercentage = totalRevenue > 0 && totalMargin > 0 ? (totalMargin / totalRevenue) * 100 : 0;
      
      const dealsClosed = wonOpps?.length || 0;

      // Get targets for achievement calculation
      const { data: targets } = await supabase
        .from('sales_targets')
        .select('amount')
        .eq('assigned_to', profile.id)
        .gte('period_end', new Date().toISOString().split('T')[0])
        .lte('period_start', new Date().toISOString().split('T')[0])
        .maybeSingle();

      const targetAchievement = targets?.amount ? (totalRevenue / targets.amount) * 100 : 0;
      const averageDealSize = dealsClosed > 0 ? totalRevenue / dealsClosed : 0;

      // Calculate top performers
      const performerMap = new Map<string, { name: string; revenue: number; margin: number; deals: number }>();
      wonOpps?.forEach(opp => {
        const ownerId = opp.owner_id;
        const ownerName = (opp.user_profiles as any)?.full_name || 'Unknown';
        const existing = performerMap.get(ownerId) || { name: ownerName, revenue: 0, margin: 0, deals: 0 };
        
        const pipelineItem = (opp.pipeline_items as any)?.[0];
        const oppCosts = pipelineItem ? 
          (pipelineItem.cost_of_goods || 0) + (pipelineItem.service_costs || 0) + (pipelineItem.other_expenses || 0) : 0;
        const oppMargin = (opp.amount || 0) - oppCosts;
        
        existing.revenue += opp.amount || 0;
        existing.margin += oppMargin;
        existing.deals += 1;
        performerMap.set(ownerId, existing);
      });

      const topPerformers = Array.from(performerMap.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // Revenue by month
      const monthMap = new Map<string, { revenue: number; margin: number; deals: number }>();
      wonOpps?.forEach(opp => {
        const month = new Date(opp.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const existing = monthMap.get(month) || { revenue: 0, margin: 0, deals: 0 };
        
        const pipelineItem = (opp.pipeline_items as any)?.[0];
        const oppCosts = pipelineItem ? 
          (pipelineItem.cost_of_goods || 0) + (pipelineItem.service_costs || 0) + (pipelineItem.other_expenses || 0) : 0;
        const oppMargin = (opp.amount || 0) - oppCosts;
        
        existing.revenue += opp.amount || 0;
        existing.margin += oppMargin;
        existing.deals += 1;
        monthMap.set(month, existing);
      });

      const revenueByMonth = Array.from(monthMap.entries())
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

      // Get pipeline by stage
      const { data: pipelineData } = await supabase
        .from('opportunities')
        .select('stage, amount')
        .eq('status', 'open');

      const stageMap = new Map<string, { count: number; value: number }>();
      pipelineData?.forEach(opp => {
        const existing = stageMap.get(opp.stage) || { count: 0, value: 0 };
        existing.count += 1;
        existing.value += opp.amount || 0;
        stageMap.set(opp.stage, existing);
      });

      const pipelineByStage = Array.from(stageMap.entries())
        .map(([stage, data]) => ({ stage, ...data }));

      // Get total opportunities for conversion rate
      const { count: totalOpps } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');

      const conversionRate = totalOpps ? (dealsClosed / totalOpps) * 100 : 0;

      return {
        totalRevenue,
        totalMargin,
        marginPercentage,
        dealsClosed,
        targetAchievement,
        averageDealSize,
        conversionRate,
        topPerformers,
        revenueByMonth,
        pipelineByStage,
      } as SalesSummaryMetrics;
    },
    enabled: !!user && !!profile && ['manager', 'head', 'admin'].includes(profile.role),
  });
};
