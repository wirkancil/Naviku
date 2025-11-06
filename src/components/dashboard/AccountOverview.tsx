import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, Target, Users, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';

interface AccountMetrics {
  totalDeals: number;
  totalValue: number;
  wonDeals: number;
  lostDeals: number;
  activeDeals: number;
  winRate: number;
  avgDealSize: number;
  revenueTarget: number;
  revenueAchieved: number;
  marginTarget: number;
  marginAchieved: number;
}

export const AccountOverview: React.FC = () => {
  const { formatCurrency } = useCurrencyFormatter();
  const [metrics, setMetrics] = useState<AccountMetrics>({
    totalDeals: 0,
    totalValue: 0,
    wonDeals: 0,
    lostDeals: 0,
    activeDeals: 0,
    winRate: 0,
    avgDealSize: 0,
    revenueTarget: 0,
    revenueAchieved: 0,
    marginTarget: 0,
    marginAchieved: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) return;

        // Get user profile to fetch targets
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('user_id', user.user.id)
          .maybeSingle();

        // Fetch opportunities for current user
        const { data: opportunities } = await supabase
          .from('opportunities')
          .select('id, amount, status, stage, is_won, is_closed')
          .eq('owner_id', user.user.id);

        // Calculate won deals and revenue achieved
        const wonOpps = (opportunities || []).filter(
          (opp) => opp.status === 'won' || opp.is_won === true
        );
        const wonOpportunityIds = wonOpps.map((opp) => opp.id);

        // Calculate margin achieved HANYA dari opportunities yang sudah punya project dan cost data
        // Margin hanya terisi setelah form add project di-submit, bukan saat status "won"
        let revenueAchieved = 0;
        let marginAchieved = 0;
        
        if (wonOpportunityIds.length > 0) {
          // Ambil projects untuk opportunities yang won
          const { data: projects } = await supabase
            .from('projects')
            .select('opportunity_id, po_amount')
            .in('opportunity_id', wonOpportunityIds);
          
          if (projects && projects.length > 0) {
            // Revenue dari projects (bukan dari opportunities)
            revenueAchieved = projects.reduce((sum, p) => sum + (Number(p.po_amount) || 0), 0);
            const projectOppIds = projects.map((p) => p.opportunity_id).filter(Boolean);
            
            // Ambil biaya dari pipeline_items yang sudah punya project
            const { data: pipelineItems } = await supabase
              .from('pipeline_items')
              .select('opportunity_id, cost_of_goods, service_costs, other_expenses, status')
              .in('opportunity_id', projectOppIds)
              .eq('status', 'won');

            // Filter: hanya hitung margin dari pipeline_items yang punya cost data
            const pipelineItemsWithCosts = (pipelineItems || []).filter((item) => {
              const totalCost = (item.cost_of_goods || 0) + (item.service_costs || 0) + (item.other_expenses || 0);
              // Hanya hitung jika total cost > 0 (sudah ada cost data dari form add project)
              return totalCost > 0;
            });

            const totalCosts = pipelineItemsWithCosts.reduce((sum, item) => {
              return sum + (item.cost_of_goods || 0) + (item.service_costs || 0) + (item.other_expenses || 0);
            }, 0);

            marginAchieved = revenueAchieved - totalCosts;
          } else {
            // Jika belum ada project, revenue = 0 dan margin = 0
            revenueAchieved = 0;
            marginAchieved = 0;
          }
        }

        // Fetch sales targets assigned to this Account Manager
        const todayStr = new Date().toISOString().split('T')[0];
        let revenueTarget = 0;
        let marginTarget = 0;
        
        if (profile?.id) {
          const { data: targets } = await supabase
            .from('sales_targets')
            .select('amount, measure, period_start, period_end')
            .eq('assigned_to', profile.id)
            .lte('period_start', todayStr)
            .gte('period_end', todayStr);

          (targets || []).forEach((t: any) => {
            if (t.measure === 'revenue') revenueTarget += Number(t.amount) || 0;
            if (t.measure === 'margin') marginTarget += Number(t.amount) || 0;
          });
        }

        if (opportunities) {
          const totalDeals = opportunities.length;
          const totalValue = opportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);
          const wonDeals = wonOpps.length;
          const lostDeals = opportunities.filter(
            (opp) => opp.status === 'lost' || opp.stage === 'Closed Lost'
          ).length;
          const activeDeals = opportunities.filter(
            (opp) => !opp.is_closed && opp.status !== 'won' && opp.status !== 'lost'
          ).length;
          const winRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;
          const avgDealSize = totalDeals > 0 ? totalValue / totalDeals : 0;

          setMetrics({
            totalDeals,
            totalValue,
            wonDeals,
            lostDeals,
            activeDeals,
            winRate,
            avgDealSize,
            revenueTarget,
            revenueAchieved,
            marginTarget,
            marginAchieved,
          });
        }
      } catch (error) {
        console.error('Error fetching account metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);


  const revenueProgress = metrics.revenueTarget > 0 ? (metrics.revenueAchieved / metrics.revenueTarget) * 100 : 0;
  const marginProgress = metrics.marginTarget > 0 ? (metrics.marginAchieved / metrics.marginTarget) * 100 : 0;
  const revenueGap = Math.max(0, metrics.revenueTarget - metrics.revenueAchieved);
  const marginGap = Math.max(0, metrics.marginTarget - metrics.marginAchieved);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Overview</CardTitle>
          <CardDescription>Loading your personal metrics...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Revenue & Margin Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue Target */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.revenueTarget)}</div>
          </CardContent>
        </Card>

        {/* Revenue Achieved */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue Achieved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(metrics.revenueAchieved)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {revenueProgress.toFixed(1)}% of target
            </p>
          </CardContent>
        </Card>

        {/* Margin Target */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Margin Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.marginTarget)}</div>
          </CardContent>
        </Card>

        {/* Margin Achieved */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Margin Achieved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(metrics.marginAchieved)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {marginProgress.toFixed(1)}% of target
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Account Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Performance Overview
          </CardTitle>
          <CardDescription>Your personal account metrics and performance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Total Pipeline</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(metrics.totalValue)}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Active Deals</span>
              </div>
              <p className="text-2xl font-bold">{metrics.activeDeals}</p>
            </div>
          </div>

          {/* Revenue Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Revenue Progress</span>
              <span className="text-sm text-muted-foreground">
                {revenueProgress.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(revenueProgress, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(metrics.revenueAchieved)}</span>
              <span>{formatCurrency(metrics.revenueTarget)}</span>
            </div>
          </div>

          {/* Margin Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Margin Progress</span>
              <span className="text-sm text-muted-foreground">
                {marginProgress.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(marginProgress, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(metrics.marginAchieved)}</span>
              <span>{formatCurrency(metrics.marginTarget)}</span>
            </div>
          </div>

          {/* Performance Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-lg font-semibold text-green-500">
                  {metrics.wonDeals}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Won</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-lg font-semibold">
                  {metrics.winRate.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Win Rate</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-lg font-semibold">
                  {formatCurrency(metrics.avgDealSize)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Avg Deal</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};