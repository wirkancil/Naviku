import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/useProfile";
import { useManagerTeam } from "@/hooks/useManagerTeam";
import { formatCurrency, STAGE_PROBABILITIES, STAGE_PERFORMANCE_RULES } from "@/lib/constants";
import { AlertCircle, Calendar, Target, TrendingUp, FileText, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import OpportunityDetailModal from "@/components/modals/OpportunityDetailModal";
import { DelayModal } from "@/components/modals/DelayModal";

interface KanbanOpportunity {
  id: string;
  name: string;
  amount: number;
  probability: number;
  next_step_text?: string;
  next_step_due?: string;
  last_activity_at?: string;
  status: string;
  forecast_category?: string;
  stage: string;
}

export default function ManagerPipeline() {
  const { profile } = useProfile();
  const { teamMembers, loading: teamLoading } = useManagerTeam();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get filter values from URL params or defaults
  const [selectedTeam, setSelectedTeam] = useState(searchParams.get("team") || "my");
  const [selectedPeriod, setSelectedPeriod] = useState(searchParams.get("period") || "Q");
  const [selectedAccountManager, setSelectedAccountManager] = useState(searchParams.get("rep") || "all");
  const [selectedForecastCategory, setSelectedForecastCategory] = useState(searchParams.get("fc") || "all");
  
  const [opportunities, setOpportunities] = useState<KanbanOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>('');
  const [reloadCount, setReloadCount] = useState(0);
  const [quarterTarget, setQuarterTarget] = useState<number>(0);

  // Helper: build start/end date range based on selectedPeriod (Q/M/Y)
  const getPeriodRange = () => {
    const now = new Date();
    if (selectedPeriod === "Q") {
      const quarter = Math.floor(now.getMonth() / 3); // 0..3
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { start: fmt(start), end: fmt(end) };
    }
    if (selectedPeriod === "M") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { start: fmt(start), end: fmt(end) };
    }
    // Year
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 12, 0);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start: fmt(start), end: fmt(end) };
  };

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("team", selectedTeam);
    params.set("period", selectedPeriod);
    params.set("rep", selectedAccountManager);
    params.set("fc", selectedForecastCategory);
    setSearchParams(params);
  }, [selectedTeam, selectedPeriod, selectedAccountManager, selectedForecastCategory, setSearchParams]);

  // Fetch opportunities based on filters
  useEffect(() => {
    const fetchOpportunities = async () => {
      if (!profile || profile.role !== 'manager') return;
      
      setLoading(true);
      try {
        let query = supabase
          .from('opportunities')
          .select('*')
          .neq('status', 'archived');

        // Apply role-based filtering - managers see team opportunities
        const teamUserIds = teamMembers.map(m => m.user_id).filter(Boolean);
        if (teamUserIds.length > 0) {
          query = query.in('owner_id', teamUserIds);
        } else if (profile.entity_id && profile.division_id) {
          // Fallback: filter by manager_id OR (entity + team)
          let fallbackUserIds: string[] = [];
          
          // PRIORITY 1: Query users with explicit manager_id assignment
          const { data: managerAssignedUsers } = await supabase
            .from('user_profiles')
            .select('user_id')
            .in('role', ['account_manager', 'staff', 'sales'])
            .eq('is_active', true)
            .eq('manager_id', profile.id);
          
          if (managerAssignedUsers) {
            const assignedIds = managerAssignedUsers.map((u: any) => u.user_id).filter(Boolean);
            fallbackUserIds = [...fallbackUserIds, ...assignedIds];
          }
          
          // PRIORITY 2: Query users in same entity + division
          const { data: teamUsers } = await supabase
            .from('user_profiles')
            .select('user_id')
            .in('role', ['account_manager', 'staff', 'sales'])
            .eq('is_active', true)
            .eq('entity_id', profile.entity_id)
            .eq('division_id', profile.division_id);
          
          if (teamUsers) {
            const teamIds = teamUsers.map((u: any) => u.user_id).filter(Boolean);
            // Merge and deduplicate
            const existingIds = new Set(fallbackUserIds);
            const newIds = teamIds.filter((id: string) => !existingIds.has(id));
            fallbackUserIds = [...fallbackUserIds, ...newIds];
          }
          
          if (fallbackUserIds.length > 0) {
            query = query.in('owner_id', fallbackUserIds);
          }
        }

        // Apply account manager filter
        if (selectedAccountManager !== 'all') {
          query = query.eq('owner_id', selectedAccountManager);
        }

        // Apply forecast category filter
        if (selectedForecastCategory !== 'all') {
          query = query.eq('forecast_category', selectedForecastCategory as any);
        }

        // Apply period range on expected_close_date
        const { start, end } = getPeriodRange();
        if (start && end) {
          query = query.gte('expected_close_date', start).lte('expected_close_date', end);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        const mappedOpportunities: KanbanOpportunity[] = (data || []).map((opp: any) => ({
          id: opp.id,
          name: opp.name,
          amount: opp.amount || 0,
          probability: opp.probability || 0,
          next_step_text: opp.next_step_title,
          next_step_due: opp.next_step_due_date,
          last_activity_at: opp.last_activity_at,
          status: opp.status,
          forecast_category: opp.forecast_category,
          stage: opp.stage
        }));

        setOpportunities(mappedOpportunities);
      } catch (error) {
        console.error('Error fetching opportunities:', error);
        setOpportunities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOpportunities();
  }, [profile, teamMembers, selectedAccountManager, selectedForecastCategory, selectedPeriod, reloadCount]);

  // Fetch quarterly/monthly/year target for current filters
  useEffect(() => {
    const fetchTarget = async () => {
      if (!profile) return;
      try {
        const { start, end } = getPeriodRange();

        // Determine assigned_to profile IDs to include
        // For Manager Pipeline: show targets assigned to Account Managers (not Manager's own target)
        let assignedProfileIds: string[] = [];
        if (selectedAccountManager !== 'all') {
          const { data: single } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('user_id', selectedAccountManager)
            .maybeSingle();
          if (single?.id) assignedProfileIds = [single.id];
        } else {
          // Determine team profiles by manager_id OR (entity + team)
          // Strategy: Query users who have manager_id OR (entity_id + division_id match)
          
          // PRIORITY 1: Query users with explicit manager_id assignment
          const { data: managerAssignedProfiles } = await supabase
            .from('user_profiles')
            .select('id')
            .in('role', ['account_manager', 'sales', 'staff'])
            .eq('is_active', true)
            .eq('manager_id', profile.id);
          
          if (managerAssignedProfiles) {
            const assignedIds = managerAssignedProfiles.map((p: any) => p.id).filter(Boolean);
            assignedProfileIds = [...assignedProfileIds, ...assignedIds];
          }
          
          // PRIORITY 2: Query users in same entity + division (if manager has entity + division)
          if (profile.division_id && profile.entity_id) {
            const { data: teamProfiles } = await supabase
              .from('user_profiles')
              .select('id')
              .in('role', ['account_manager', 'sales', 'staff'])
              .eq('is_active', true)
              .eq('entity_id', profile.entity_id)
              .eq('division_id', profile.division_id);
            
            if (teamProfiles) {
              const teamIds = teamProfiles.map((p: any) => p.id).filter(Boolean);
              // Merge and deduplicate
              const existingIds = new Set(assignedProfileIds);
              const newIds = teamIds.filter((id: string) => !existingIds.has(id));
              assignedProfileIds = [...assignedProfileIds, ...newIds];
            }
          }
        }

        if (assignedProfileIds.length === 0) {
          setQuarterTarget(0);
          return;
        }

        let targetQuery = supabase
          .from('sales_targets')
          .select('assigned_to, amount, measure, period_start, period_end')
          .in('assigned_to', assignedProfileIds)
          .eq('measure', 'revenue')
          .lte('period_start', end)
          .gte('period_end', start);

        const { data: targets, error } = await targetQuery;
        if (error) throw error;

        // Sum contribution within selected period window
        const parseDate = (s: string) => new Date(s + 'T00:00:00');
        const diffMonthsInclusive = (a: Date, b: Date) => {
          return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
        };

        const startDate = parseDate(start);
        const endDate = parseDate(end);

        const totalTarget = (targets || []).reduce((sum: number, t: any) => {
          const tStart = parseDate(t.period_start);
          const tEnd = parseDate(t.period_end);
          const totalMonths = Math.max(diffMonthsInclusive(tStart, tEnd), 1);

          // overlap range
          const oStart = new Date(Math.max(tStart.getTime(), startDate.getTime()));
          const oEnd = new Date(Math.min(tEnd.getTime(), endDate.getTime()));
          if (oEnd < oStart) return sum;
          const overlapMonths = Math.max(diffMonthsInclusive(oStart, oEnd), 0);
          const contribution = (Number(t.amount) || 0) * (overlapMonths / totalMonths);
          return sum + contribution;
        }, 0);

        setQuarterTarget(totalTarget);
      } catch (err) {
        console.error('Error fetching target:', err);
        setQuarterTarget(0);
      }
    };

    fetchTarget();
  }, [profile, selectedAccountManager, selectedPeriod, teamMembers]);

  // Team options (locked to current manager)
  const teamOptions = [
    { value: "my", label: "My Team" }
  ];

  // Period options
  const periodOptions = [
    { value: "Q", label: "Current Quarter" },
    { value: "M", label: "Current Month" },
    { value: "Y", label: "Current Year" }
  ];

  // Account manager options from team members
  const accountManagerOptions = [
    { value: "all", label: "All Reps" },
    ...teamMembers.map(member => ({
      value: member.user_id,
      label: member.full_name
    }))
  ];

  // Forecast category options
  const forecastCategories = [
    { value: "all", label: "All Categories" },
    { value: "Commit", label: "Commit" },
    { value: "Best Case", label: "Best Case" },
    { value: "Pipeline", label: "Pipeline" },
    { value: "Closed Won", label: "Closed Won" },
    { value: "Closed Lost", label: "Closed Lost" }
  ];

  // Calculate KPIs
  const calculateKPIs = () => {
    const weightedPipeline = opportunities.reduce((sum, opp) => sum + opp.amount * (opp.probability || 0) / 100, 0);
    const commitQ = opportunities.filter(opp => opp.forecast_category === 'Commit').reduce((sum, opp) => sum + opp.amount, 0);
    const bestQ = opportunities.filter(opp => opp.forecast_category === 'Best Case').reduce((sum, opp) => sum + opp.amount, 0);
    const gapToTarget = Math.max(0, quarterTarget - commitQ);

    return {
      weightedPipeline,
      commitQ,
      bestQ,
      gapToTarget
    };
  };
  
  const { weightedPipeline, commitQ, bestQ, gapToTarget } = calculateKPIs();

  const openDetailModal = (opportunityId: string) => {
    setSelectedOpportunityId(opportunityId);
    setShowDetailModal(true);
  };

  // Group opportunities by stage
  const getOpportunitiesByStage = (stageName: string) => {
    return opportunities.filter(opp => {
      if (stageName === "Proposal/Negotiation") {
        return opp.stage === "Proposal/Negotiation";
      }
      if (stageName === "Closed Won") {
        return opp.stage === "Closed Won" || opp.status === "won";
      }
      if (stageName === "Closed Lost") {
        return opp.stage === "Closed Lost" || opp.status === "lost";
      }
      return false;
    });
  };

  const getDaysUntilDue = (dueDate?: string) => {
    if (!dueDate) return 0;
    const today = new Date();
    const due = new Date(dueDate);
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getDaysSinceActivity = (activityDate?: string) => {
    if (!activityDate) return 999;
    const today = new Date();
    const activity = new Date(activityDate);
    return Math.ceil((today.getTime() - activity.getTime()) / (1000 * 60 * 60 * 24));
  };

  const renderOpportunityCard = (opp: KanbanOpportunity) => {
    const daysUntilDue = getDaysUntilDue(opp.next_step_due);
    const daysSinceActivity = getDaysSinceActivity(opp.last_activity_at);
    const isOverdue = daysUntilDue < 0 && opp.status === 'open';
    const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 7 && opp.status === 'open';
    const isInactive = opp.status === 'open' && daysSinceActivity >= 14;

    return (
      <Card key={opp.id} className="mb-3 hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-medium text-sm">{opp.name}</h4>
            <Badge variant="outline" className="text-xs">
              {Math.round((STAGE_PROBABILITIES[opp.stage] || 0) * 100)}%
            </Badge>
          </div>
          
          <div className="text-lg font-semibold text-blue-600 mb-3">
            {formatCurrency(opp.amount)}
          </div>

          <div className="text-xs text-muted-foreground mb-3">
            Next Step: {opp.next_step_text || 'No next step set'}
          </div>

          <div className="flex flex-wrap gap-1 mb-3">
            {isOverdue && (
              <Badge variant="destructive" className="text-xs">
                Overdue
              </Badge>
            )}
            {isDueSoon && (
              <Badge variant="secondary" className="text-xs">
                Due in {daysUntilDue} days
              </Badge>
            )}
            {isInactive && (
              <Badge variant="outline" className="text-xs">
                14 days inactive
              </Badge>
            )}
            {opp.forecast_category && (
              <Badge variant="outline" className="text-xs">
                {opp.forecast_category}
              </Badge>
            )}
          </div>

          <div className="flex gap-2">
            {opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost' && (
              <>
                <DelayModal
                  opportunityId={opp.id}
                  currentReason={opp.next_step_text}
                  currentDueDate={opp.next_step_due || undefined}
                  onSuccess={() => setReloadCount((c) => c + 1)}
                />
                <Button size="sm" variant="outline" className="text-xs">
                  Next Step
                </Button>
              </>
            )}
            {opp.status === 'open' && opp.stage === 'Proposal/Negotiation' && (
              <>
                <Button size="sm" variant="outline" className="text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Mark Won
                </Button>
                <Button size="sm" variant="outline" className="text-xs">
                  <XCircle className="w-3 h-3 mr-1" />
                  Mark Lost
                </Button>
              </>
            )}
            <Button 
              size="sm" 
              variant="outline" 
              className="text-xs text-blue-700 hover:bg-blue-50 border-blue-200"
              onClick={() => openDetailModal(opp.id)}
            >
              <FileText className="w-3 h-3 mr-1" />
              Detail
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading || teamLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Pipeline Overview</h1>
          <p className="text-muted-foreground mt-1">
            Manager / Pipeline / Overview
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Team</label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teamOptions.map(team => (
                    <SelectItem key={team.value} value={team.value}>
                      {team.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Period</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map(period => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Account Manager</label>
              <Select value={selectedAccountManager} onValueChange={setSelectedAccountManager}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountManagerOptions.map(am => (
                    <SelectItem key={am.value} value={am.value}>
                      {am.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Forecast Category</label>
              <Select value={selectedForecastCategory} onValueChange={setSelectedForecastCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {forecastCategories.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Weighted Pipeline</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(weightedPipeline)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Commit (Q)</span>
            </div>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(commitQ)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Best (Q)</span>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(bestQ)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium">Gap to Target</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(gapToTarget)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {["Proposal/Negotiation", "Closed Won", "Closed Lost"].map(stageName => {
          const stageOpportunities = getOpportunitiesByStage(stageName);
          const stageTotal = stageOpportunities.reduce((sum, opp) => sum + opp.amount, 0);
          const normalizeForRules = (name: string) => name.replace(/ \/? /g, "/");
          const points = STAGE_PERFORMANCE_RULES[normalizeForRules(stageName)]?.points ?? 0;
          const headerDetail = (() => {
            switch (stageName) {
              case "Proposal/Negotiation":
                return `Commercial terms sent, decision date/approvals path confirmed — earns ${points} points`;
              case "Closed Won":
                return `Opportunity won — earns ${points} points`;
              case "Closed Lost":
                return `Opportunity lost — earns ${points} points`;
              default:
                return "";
            }
          })();
          
          return (
            <Card key={stageName} className="h-fit">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg">{stageName}</CardTitle>
                  <Badge variant="outline">
                    {stageOpportunities.length}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Total: {formatCurrency(stageTotal)}
                </div>
                {headerDetail && (
                  <div className="text-xs text-muted-foreground">
                    {headerDetail}
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {stageOpportunities.map(renderOpportunityCard)}
                  {stageOpportunities.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      No opportunities in this stage
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Opportunity Detail Modal */}
      <OpportunityDetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        opportunityId={selectedOpportunityId}
      />
    </div>
  );
}