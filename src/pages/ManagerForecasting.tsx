import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useProfile } from "@/hooks/useProfile";
import { useRoleBasedData } from "@/hooks/useRoleBasedData";
import { ExportButton } from "@/components/ExportButton";
import { formatCurrency } from "@/lib/constants";
import { TrendingUp, Target, Calendar, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ForecastTile {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

export default function ManagerForecasting() {
  const { profile } = useProfile();
  const { opportunities, loading } = useRoleBasedData();
  const [probabilityAdjustment, setProbabilityAdjustment] = useState([0]);
  const [periodTarget, setPeriodTarget] = useState(0);

  // Debug logging
  useEffect(() => {
    console.log('🔍 [ManagerForecasting] Profile:', {
      role: profile?.role,
      id: profile?.id,
      entity_id: profile?.entity_id,
      division_id: profile?.division_id
    });
    console.log('🔍 [ManagerForecasting] Opportunities:', {
      count: opportunities.length,
      opportunities: opportunities.slice(0, 5).map(opp => ({
        name: opp.name,
        amount: opp.amount,
        forecast_category: opp.forecast_category,
        expected_close_date: opp.expected_close_date,
        owner_id: opp.owner_id
      }))
    });
    console.log('🔍 [ManagerForecasting] Period Target:', periodTarget);
  }, [profile, opportunities, periodTarget]);

  // Quarter range for current quarter
  const getQuarterRange = () => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3); // 0..3
    const start = new Date(now.getFullYear(), quarter * 3, 1);
    const end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start: fmt(start), end: fmt(end) };
  };

  const { start: quarterStart, end: quarterEnd } = getQuarterRange();

  const isWithinQuarter = (dateStr?: string) => {
    if (!dateStr) return false;
    return dateStr >= quarterStart && dateStr <= quarterEnd;
  };

  // Fetch target for current quarter aggregated over manager's team
  useEffect(() => {
    const fetchTarget = async () => {
      if (!profile) return;
      try {
        // Determine team profiles by manager_id OR (entity + team)
        // Strategy: Query users who have manager_id OR (entity_id + division_id match)
        let assignedProfileIds: string[] = [];
        
        // PRIORITY 1: Query users with explicit manager_id assignment
        console.log('🔍 [ManagerForecasting] Fetching targets for manager:', profile.id);
        const { data: managerAssignedProfiles, error: managerError } = await supabase
          .from('user_profiles')
          .select('id, full_name, role')
          .in('role', ['account_manager', 'sales', 'staff'])
          .eq('is_active', true)
          .eq('manager_id', profile.id);
        
        console.log('🔍 [ManagerForecasting] Query via manager_id:', {
          error: managerError,
          count: managerAssignedProfiles?.length || 0,
          profiles: managerAssignedProfiles
        });
        
        if (!managerError && managerAssignedProfiles) {
          const assignedIds = managerAssignedProfiles.map((p: any) => p.id).filter(Boolean);
          assignedProfileIds = [...assignedProfileIds, ...assignedIds];
          console.log('✅ [ManagerForecasting] Found via manager_id:', assignedIds.length, 'profiles');
        }
        
        // PRIORITY 2: Query users in same entity + division (if manager has entity + division)
        if (profile.division_id && profile.entity_id) {
          const { data: teamProfiles, error: teamError } = await supabase
            .from('user_profiles')
            .select('id')
            .in('role', ['account_manager', 'sales', 'staff'])
            .eq('is_active', true)
            .eq('entity_id', profile.entity_id)
            .eq('division_id', profile.division_id);
          
          if (!teamError && teamProfiles) {
            const teamIds = teamProfiles.map((p: any) => p.id).filter(Boolean);
            // Merge and deduplicate
            const existingIds = new Set(assignedProfileIds);
            const newIds = teamIds.filter((id: string) => !existingIds.has(id));
            assignedProfileIds = [...assignedProfileIds, ...newIds];
          }
        }
        if (assignedProfileIds.length === 0) {
          setPeriodTarget(0);
          return;
        }

        console.log('🔍 [ManagerForecasting] Fetching targets for profile IDs:', assignedProfileIds);
        const { data: targets, error } = await supabase
          .from('sales_targets')
          .select('assigned_to, amount, measure, period_start, period_end')
          .in('assigned_to', assignedProfileIds)
          .eq('measure', 'revenue')
          .lte('period_start', quarterEnd)
          .gte('period_end', quarterStart);
        
        console.log('📊 [ManagerForecasting] Targets query result:', {
          error,
          count: targets?.length || 0,
          targets: targets?.map((t: any) => ({
            assigned_to: t.assigned_to,
            amount: t.amount,
            period_start: t.period_start,
            period_end: t.period_end
          }))
        });
        
        if (error) {
          console.error('❌ [ManagerForecasting] Targets query error:', error);
          throw error;
        }

        // Sum contribution within selected quarter
        const parseDate = (s: string) => new Date(s + 'T00:00:00');
        const diffMonthsInclusive = (a: Date, b: Date) => {
          return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
        };
        const startDate = parseDate(quarterStart);
        const endDate = parseDate(quarterEnd);

        const totalTarget = (targets || []).reduce((sum: number, t: any) => {
          const tStart = parseDate(t.period_start);
          const tEnd = parseDate(t.period_end);
          const totalMonths = Math.max(diffMonthsInclusive(tStart, tEnd), 1);
          const oStart = new Date(Math.max(tStart.getTime(), startDate.getTime()));
          const oEnd = new Date(Math.min(tEnd.getTime(), endDate.getTime()));
          if (oEnd < oStart) return sum;
          const overlapMonths = Math.max(diffMonthsInclusive(oStart, oEnd), 0);
          const contribution = (Number(t.amount) || 0) * (overlapMonths / totalMonths);
          return sum + contribution;
        }, 0);

        setPeriodTarget(totalTarget);
      } catch (err) {
        console.error('Error fetching forecast target:', err);
        setPeriodTarget(0);
      }
    };

    fetchTarget();
  }, [profile, quarterStart, quarterEnd]);

  // Calculate weighted pipeline using filtered opportunities
  const calculateWeightedPipeline = (adjustment = 0) => {
    const filteredOpps = opportunities.filter(opp => isWithinQuarter(opp.expected_close_date));
    return filteredOpps.reduce((sum, opp) => {
      const adjustedProbability = Math.min(100, Math.max(0, (opp.probability || 0) + adjustment));
      return sum + (opp.amount || 0) * adjustedProbability / 100;
    }, 0);
  };

  // Calculate forecast by quarter (commit/best/omitted within quarter)
  const calculateQuarterForecast = () => {
    const filteredOpps = opportunities.filter(opp => isWithinQuarter(opp.expected_close_date));
    const commit = filteredOpps.filter(opp => opp.forecast_category === 'Commit').reduce((sum, opp) => sum + (opp.amount || 0), 0);
    const best = filteredOpps.filter(opp => opp.forecast_category === 'Best Case').reduce((sum, opp) => sum + (opp.amount || 0), 0);
    const omitted = filteredOpps.filter(opp => opp.forecast_category === 'Pipeline').reduce((sum, opp) => sum + (opp.amount || 0), 0);
    const target = periodTarget;
    const gap = Math.max(0, target - commit);
    return { commit, best, omitted, gap, target };
  };

  const baseWeightedPipeline = calculateWeightedPipeline();
  const adjustedWeightedPipeline = calculateWeightedPipeline(probabilityAdjustment[0]);
  const { commit, best, omitted, gap, target } = calculateQuarterForecast();

  const forecastTiles: ForecastTile[] = [
    { label: "Commit", value: commit, icon: <Target className="h-5 w-5" />, color: "text-green-600" },
    { label: "Best", value: best, icon: <TrendingUp className="h-5 w-5" />, color: "text-blue-600" },
    { label: "Omitted", value: omitted, icon: <Calendar className="h-5 w-5" />, color: "text-gray-600" },
    { label: "Gap", value: gap, icon: <AlertTriangle className="h-5 w-5" />, color: gap > 0 ? "text-red-600" : "text-green-600" }
  ];

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Pipeline Forecasting</h1>
          <p className="text-muted-foreground mt-1">Manager / Pipeline / Forecasting</p>
        </div>
        <ExportButton data={opportunities} filename="pipeline-forecast" />
      </div>

      {/* Weighted Pipeline Metric */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-blue-500" />
            Weighted Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">
                {formatCurrency(adjustedWeightedPipeline)}
              </div>
              {probabilityAdjustment[0] !== 0 && (
                <div className="text-sm text-muted-foreground">
                  Base: {formatCurrency(baseWeightedPipeline)}
                  <span className={`ml-2 ${adjustedWeightedPipeline > baseWeightedPipeline ? 'text-green-600' : 'text-red-600'}`}>
                    ({adjustedWeightedPipeline > baseWeightedPipeline ? '+' : ''}
                    {formatCurrency(adjustedWeightedPipeline - baseWeightedPipeline)})
                  </span>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-1">Based on</div>
              <div className="text-lg font-semibold">
                {opportunities.filter(opp => isWithinQuarter(opp.expected_close_date)).length} opportunities
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quarter Forecast Tiles */}
      <Card>
        <CardHeader>
          <CardTitle>Quarter Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {forecastTiles.map((tile, index) => (
              <Card key={index} className="border-2">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={tile.color}>{tile.icon}</div>
                    <span className="text-sm font-medium">{tile.label}</span>
                  </div>
                  <div className={`text-2xl font-bold ${tile.color}`}>{formatCurrency(tile.value)}</div>
                  {tile.label === "Gap" && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Target: {formatCurrency(target)}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Forecast Summary */}
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="font-medium text-green-600">Commit Achievement</div>
                <div>{target > 0 ? Math.round((commit / target) * 100) : 0}% of target</div>
              </div>
              <div>
                <div className="font-medium text-blue-600">Best Case Potential</div>
                <div>{target > 0 ? Math.round(((commit + best) / target) * 100) : 0}% of target</div>
              </div>
              <div>
                <div className="font-medium text-purple-600">Total Pipeline</div>
                <div>{formatCurrency(commit + best + omitted)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Probability Scenario Slider */}
      <Card>
        <CardHeader>
          <CardTitle>Scenario Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-4">
                <label className="text-sm font-medium">
                  Probability Adjustment: {probabilityAdjustment[0] > 0 ? '+' : ''}{probabilityAdjustment[0]}%
                </label>
                <button onClick={() => setProbabilityAdjustment([0])} className="text-sm text-blue-600 hover:text-blue-800">
                  Reset
                </button>
              </div>
              
              <Slider value={probabilityAdjustment} onValueChange={setProbabilityAdjustment} max={20} min={-20} step={1} className="w-full" />
              
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>-20%</span>
                <span>0%</span>
                <span>+20%</span>
              </div>
            </div>

            {/* Scenario Impact */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="text-sm font-medium mb-2">Conservative Scenario (-10%)</div>
                <div className="text-lg font-bold text-orange-600">
                  {formatCurrency(calculateWeightedPipeline(-10))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(calculateWeightedPipeline(-10) - baseWeightedPipeline)} vs baseline
                </div>
              </div>
              
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="text-sm font-medium mb-2">Optimistic Scenario (+10%)</div>
                <div className="text-lg font-bold text-green-600">
                  {formatCurrency(calculateWeightedPipeline(10))}
                </div>
                <div className="text-xs text-muted-foreground">
                  +{formatCurrency(calculateWeightedPipeline(10) - baseWeightedPipeline)} vs baseline
                </div>
              </div>
            </div>

            {/* Insights */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm font-medium text-blue-800 mb-2">Forecasting Insights</div>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Current weighted pipeline is {periodTarget > 0 ? Math.round((baseWeightedPipeline / periodTarget) * 100) : 0}% of quarterly target</li>
                <li>• {gap > 0 ? `Need ${formatCurrency(gap)} more in Commit category to reach target` : 'Exceeded target by ' + formatCurrency(Math.abs(gap))}</li>
                <li>• A +10% probability adjustment would add {formatCurrency(calculateWeightedPipeline(10) - baseWeightedPipeline)} to pipeline</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}