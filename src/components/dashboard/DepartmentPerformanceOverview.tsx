import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSalesTargets } from '@/hooks/useSalesTargets';
import { supabase } from '@/integrations/supabase/client';

interface DepartmentPerformanceOverviewProps {
  selectedPeriod?: string;
}

export function DepartmentPerformanceOverview({
  selectedPeriod = 'Q1 2026',
}: DepartmentPerformanceOverviewProps) {
  const { targets, accountManagers, fetchTargets, fetchAccountManagers } = useSalesTargets();
  const [measure, setMeasure] = useState<'revenue' | 'margin'>('revenue');
  const [achievedByProfileRevenue, setAchievedByProfileRevenue] = useState<Record<string, number>>({});
  const [achievedByProfileMargin, setAchievedByProfileMargin] = useState<Record<string, number>>({});


  // Helper to get quarter date range from label like "Q3 2025"
  const getQuarterRange = (period: string) => {
    const m = period?.match(/Q([1-4])\s+(\d{4})/);
    if (!m) return { start: '', end: '' };
    const q = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    const startMonthIdx = (q - 1) * 3; // 0-based month index
    const start = new Date(year, startMonthIdx, 1);
    const end = new Date(year, startMonthIdx + 3, 0);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: fmt(start), end: fmt(end) };
  };

  // Ensure we load team members and period-filtered targets
  useEffect(() => {
    fetchAccountManagers();
    fetchTargets(selectedPeriod);
  }, [selectedPeriod, fetchAccountManagers, fetchTargets]);

  // Compute achieved revenue & margin from real won opportunities and pipeline costs
  useEffect(() => {
    const computeActuals = async () => {
      if (!selectedPeriod || accountManagers.length === 0) {
        setAchievedByProfileRevenue({});
        setAchievedByProfileMargin({});
        return;
      }

      const { start, end } = getQuarterRange(selectedPeriod);
      if (!start || !end) return;

      try {
        // Map profile.id (AM) -> user_id (opportunities.owner_id)
        const amIds = accountManagers.map((am) => am.id);
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, user_id')
          .in('id', amIds);

        const profileToUser = new Map<string, string>();
        (profiles || []).forEach((p: any) => {
          if (p.id && p.user_id) profileToUser.set(p.id, p.user_id);
        });

        const ownerUserIds = Array.from(profileToUser.values());
        if (ownerUserIds.length === 0) {
          setAchievedByProfileRevenue({});
          setAchievedByProfileMargin({});
          return;
        }

        // Won opportunities within selected period - check both is_won and stage
        const { data: opps } = await supabase
          .from('opportunities')
          .select('id, owner_id, amount, is_won, status, stage, expected_close_date, created_at')
          .in('owner_id', ownerUserIds)
          .or('is_won.eq.true,stage.eq.Closed Won')
          .neq('status', 'archived')
          .gte('expected_close_date', start)
          .lte('expected_close_date', end);

        const wonOpps = (opps || []) as any[];
        const oppIds = wonOpps.map((o) => o.id);

        // Revenue dan Margin HANYA dari projects yang sudah dibuat (setelah form add project di-submit)
        // Revenue tidak dihitung dari opportunities yang won, hanya menunggu project dibuat
        const revenueByOwner: Record<string, number> = {};
        const marginByOwner: Record<string, number> = {};
        let costsByOpp: Record<string, number> = {};

        if (oppIds.length > 0) {
          // Ambil projects untuk opportunities yang won
          const { data: projects } = await supabase
            .from('projects')
            .select('opportunity_id, po_amount')
            .in('opportunity_id', oppIds);

          const projectOppIds = (projects || []).map((p: any) => p.opportunity_id).filter(Boolean);
          
          // Revenue dari projects (bukan dari opportunities)
          (projects || []).forEach((p: any) => {
            const amt = Number(p.po_amount) || 0;
            // Find owner dari opportunity yang sesuai
            const opp = wonOpps.find((o) => o.id === p.opportunity_id);
            if (opp) {
              const owner = opp.owner_id;
              revenueByOwner[owner] = (revenueByOwner[owner] || 0) + amt;
            }
          });

          // Ambil biaya dari pipeline_items yang sudah punya project
          if (projectOppIds.length > 0) {
            const { data: items } = await supabase
              .from('pipeline_items')
              .select('opportunity_id, cost_of_goods, service_costs, other_expenses, status')
              .in('opportunity_id', projectOppIds)
              .eq('status', 'won');

            // Filter: hanya hitung margin dari pipeline_items yang punya cost data
            (items || []).forEach((it: any) => {
              const cogs = Number(it.cost_of_goods) || 0;
              const svc = Number(it.service_costs) || 0;
              const other = Number(it.other_expenses) || 0;
              const total = cogs + svc + other;
              // Hanya hitung jika total cost > 0 (sudah ada cost data dari form add project)
              if (total > 0) {
                costsByOpp[it.opportunity_id] = (costsByOpp[it.opportunity_id] || 0) + total;
              }
            });
          }

          // Hitung margin hanya untuk opportunities yang punya project
          (projects || []).forEach((p: any) => {
            const amt = Number(p.po_amount) || 0;
            const cost = costsByOpp[p.opportunity_id] || 0;
            const margin = Math.max(0, amt - cost);
            // Find owner dari opportunity yang sesuai
            const opp = wonOpps.find((o) => o.id === p.opportunity_id);
            if (opp) {
              const owner = opp.owner_id;
              marginByOwner[owner] = (marginByOwner[owner] || 0) + margin;
            }
          });
        }

        // Map back user_id -> profile.id
        const userToProfile = new Map<string, string>();
        (profiles || []).forEach((p: any) => {
          if (p.id && p.user_id) userToProfile.set(p.user_id, p.id);
        });

        const achievedRevByProfile: Record<string, number> = {};
        const achievedMarByProfile: Record<string, number> = {};

        Object.entries(revenueByOwner).forEach(([userId, rev]) => {
          const profileId = userToProfile.get(userId);
          if (profileId) achievedRevByProfile[profileId] = rev;
        });

        Object.entries(marginByOwner).forEach(([userId, mar]) => {
          const profileId = userToProfile.get(userId);
          if (profileId) achievedMarByProfile[profileId] = mar;
        });

        setAchievedByProfileRevenue(achievedRevByProfile);
        setAchievedByProfileMargin(achievedMarByProfile);
      } catch (e) {
        console.error('Error computing actuals:', e);
        setAchievedByProfileRevenue({});
        setAchievedByProfileMargin({});
      }
    };

    computeActuals();
  }, [selectedPeriod, accountManagers]);

  // Build AM bar data: target vs achieved for selected measure
  const accountManagerPerformanceData = useMemo(() => {
    if (!accountManagers || accountManagers.length === 0) return [] as { name: string; target: number; achieved: number; gap: number }[];

    return accountManagers.map((am) => {
      const targetSum = targets
        .filter((t) => t.assigned_to === am.id && t.measure === measure)
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const achieved = measure === 'revenue'
        ? (achievedByProfileRevenue[am.id] ?? 0)
        : (achievedByProfileMargin[am.id] ?? 0);

      const gap = Math.max(0, targetSum - achieved);
      return {
        name: am.full_name,
        target: targetSum,
        achieved,
        gap,
      };
    });
  }, [accountManagers, targets, measure, achievedByProfileRevenue, achievedByProfileMargin]);

  // Overall attainment for selected measure
  const attainmentData = useMemo(() => {
    const totalTarget = accountManagerPerformanceData.reduce((sum, am) => sum + am.target, 0);
    const totalAchieved = accountManagerPerformanceData.reduce((sum, am) => sum + am.achieved, 0);
    const achievementRate = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;

    return [
      { name: 'Achieved', value: Math.round(achievementRate), fill: 'hsl(var(--primary))' },
      { name: 'Remaining', value: Math.round(100 - achievementRate), fill: 'hsl(var(--muted))' },
    ];
  }, [accountManagerPerformanceData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Department Performance
          </h2>
          <p className="text-muted-foreground">Track account manager performance within your department</p>
        </div>
        <div className="w-48">
          <Select value={measure} onValueChange={(v) => setMeasure(v as 'revenue' | 'margin')}>
            <SelectTrigger>
              <SelectValue placeholder="Measure" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="margin">Margin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Bar Chart */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Account Manager Performance</CardTitle>
              <CardDescription>
                Target vs Achievement by Account Manager — {measure === 'revenue' ? 'Revenue' : 'Margin'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={accountManagerPerformanceData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Bar dataKey="target" fill="hsl(var(--muted))" name="Target" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="achieved" fill="hsl(var(--primary))" name="Achieved" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Donut Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Overall Attainment</CardTitle>
            <CardDescription className="text-center">{measure === 'revenue' ? 'Revenue' : 'Margin'} Attainment</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="relative w-[200px] h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={attainmentData} cx={100} cy={100} innerRadius={60} outerRadius={90} startAngle={90} endAngle={450} dataKey="value">
                    {attainmentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold">{attainmentData[0]?.value || 0}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}