import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, TrendingUp, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

interface DivisionPipelineOverviewProps {
  selectedRep: string;
  dateRange: string;
}

interface PipelineStage {
  name: string;
  count: number;
  value: number;
  color: string;
  percentage: number;
}

const STAGE_COLORS: Record<string, string> = {
  'Qualification': 'bg-blue-500',
  'Needs Analysis': 'bg-purple-500',
  'Proposal': 'bg-yellow-500',
  'Negotiation': 'bg-orange-500',
  'Closed Won': 'bg-green-500',
  'Won': 'bg-green-500',
  'Closed Lost': 'bg-red-500',
  'Lost': 'bg-red-500',
};

export function TeamPipelineOverview({ selectedRep, dateRange }: DivisionPipelineOverviewProps) {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrencyFormatter();
  const { profile } = useProfile();
  const [pipelineData, setPipelineData] = useState<PipelineStage[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPipelineData = async () => {
      if (!profile || profile.role !== 'head') {
        setPipelineData([]);
        setTotalValue(0);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Get all user_ids in division (Managers + Account Managers + Staff)
        let divisionUserIds: string[] = [];

        if (profile.division_id) {
          const { data: divisionMembers } = await supabase
            .from('user_profiles')
            .select('user_id')
            .eq('division_id', profile.division_id)
            .eq('is_active', true);

          if (divisionMembers && divisionMembers.length > 0) {
            divisionUserIds = divisionMembers.map(m => m.user_id).filter(Boolean);
          }
        } else if (profile.entity_id) {
          // Fallback to entity_id
          const { data: entityMembers } = await supabase
            .from('user_profiles')
            .select('user_id')
            .eq('entity_id', profile.entity_id)
            .eq('is_active', true);

          if (entityMembers && entityMembers.length > 0) {
            divisionUserIds = entityMembers.map(m => m.user_id).filter(Boolean);
          }
        }

        if (divisionUserIds.length === 0) {
          setPipelineData([]);
          setTotalValue(0);
          setLoading(false);
          return;
        }

        // If specific manager selected, filter by that manager's team
        let ownerUserIds = divisionUserIds;
        if (selectedRep !== 'all') {
          // Get manager's profile and team
          const { data: managerProfile } = await supabase
            .from('user_profiles')
            .select('id, user_id')
            .eq('id', selectedRep)
            .maybeSingle();

          if (managerProfile?.user_id) {
            const { data: teamMembers } = await supabase
              .from('manager_team_members')
              .select('account_manager_id')
              .eq('manager_id', managerProfile.id);

            const amIds = (teamMembers || []).map((m: any) => m.account_manager_id);
            if (amIds.length > 0) {
              const { data: amProfiles } = await supabase
                .from('user_profiles')
                .select('user_id')
                .in('id', amIds);
              const amUserIds = (amProfiles || []).map((p: any) => p.user_id).filter(Boolean);
              ownerUserIds = [managerProfile.user_id, ...amUserIds];
            } else {
              // Fallback: manager + department AMs
              const { data: managerProfileFull } = await supabase
                .from('user_profiles')
                .select('user_id, department_id')
                .eq('id', selectedRep)
                .maybeSingle();

              if (managerProfileFull?.department_id) {
                const { data: deptMembers } = await supabase
                  .from('user_profiles')
                  .select('user_id')
                  .eq('department_id', managerProfileFull.department_id)
                  .in('role', ['account_manager', 'staff']);
                const deptUserIds = (deptMembers || []).map((u: any) => u.user_id).filter(Boolean);
                ownerUserIds = [managerProfileFull.user_id, ...deptUserIds];
              } else {
                ownerUserIds = [managerProfile.user_id];
              }
            }
          }
        }

        // Fetch all opportunities from division
        const { data: opportunities, error } = await supabase
          .from('opportunities')
          .select('id, amount, stage, status, is_won, is_closed')
          .in('owner_id', ownerUserIds)
          .neq('status', 'archived');

        if (error) throw error;

        // Group opportunities by stage
        const stageMap = new Map<string, { count: number; value: number }>();
        let total = 0;

        (opportunities || []).forEach((opp: any) => {
          const stage = opp.stage || 'Unknown';
          const amount = Number(opp.amount) || 0;
          
          if (!stageMap.has(stage)) {
            stageMap.set(stage, { count: 0, value: 0 });
          }
          
          const stageData = stageMap.get(stage)!;
          stageData.count += 1;
          stageData.value += amount;
          total += amount;
        });

        // Convert to array and add colors/percentages
        const stages = Array.from(stageMap.entries()).map(([name, data]) => {
          const wonCount = opportunities?.filter((o: any) => 
            o.is_won === true || o.stage === 'Closed Won' || o.status === 'won'
          ).length || 0;
          const totalCount = opportunities?.length || 1;
          const percentage = name === 'Won' || name === 'Closed Won' ? 
            (wonCount / Math.max(totalCount, 1)) * 100 :
            (data.count / Math.max(totalCount, 1)) * 100;

          return {
            name,
            count: data.count,
            value: data.value,
            color: STAGE_COLORS[name] || 'bg-gray-500',
            percentage: Math.round(percentage),
          };
        });

        // Sort stages in logical order
        const stageOrder = ['Qualification', 'Needs Analysis', 'Proposal', 'Negotiation', 'Closed Won', 'Won', 'Closed Lost', 'Lost'];
        const sortedStages = stages.sort((a, b) => {
          const aIndex = stageOrder.indexOf(a.name);
          const bIndex = stageOrder.indexOf(b.name);
          if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });

        setPipelineData(sortedStages);
        setTotalValue(total);
      } catch (error) {
        console.error('Error fetching pipeline data:', error);
        setPipelineData([]);
        setTotalValue(0);
      } finally {
        setLoading(false);
      }
    };

    fetchPipelineData();
  }, [profile, selectedRep, dateRange]);




  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Sales Pipeline Overview
            </CardTitle>
            <CardDescription>
              Division-wide pipeline performance across all stages
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/pipeline')}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            View Full Pipeline
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading pipeline data...
          </div>
        ) : (
          <>
            {/* Total Pipeline Value */}
            <div className="mb-6 p-4 bg-primary/5 rounded-lg border border-primary/10">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total Pipeline Value</p>
                <p className="text-3xl font-bold text-primary">{formatCurrency(totalValue)}</p>
              </div>
            </div>

        {/* Horizontal Pipeline Flow */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Pipeline Flow</span>
            <span>Deal Count • Value</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {pipelineData.map((stage, index) => (
              <div key={stage.name} className="flex items-center gap-2">
                <div className="flex-1 min-w-[140px]">
                  <div className="p-3 bg-card border rounded-lg hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">{stage.name}</h4>
                      <Badge 
                        variant="secondary" 
                        className={`${stage.color} text-white text-xs`}
                      >
                        {stage.count}
                      </Badge>
                    </div>
                    <p className="text-lg font-semibold text-foreground">
                      {formatCurrency(stage.value)}
                    </p>
                    
                    {/* Conversion Rate for non-terminal stages */}
                    {stage.name !== 'Won' && stage.name !== 'Lost' && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Conversion</span>
                          <span>{stage.percentage}%</span>
                        </div>
                        <Progress value={stage.percentage} className="h-1" />
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Arrow separator */}
                {index < pipelineData.length - 2 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {pipelineData.find(s => s.name === 'Won')?.count || 0}
            </p>
            <p className="text-xs text-muted-foreground">Deals Won</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">
              {pipelineData.reduce((sum, stage) => stage.name !== 'Won' && stage.name !== 'Lost' ? sum + stage.count : sum, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Active Deals</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">
              {Math.round((pipelineData.find(s => s.name === 'Won')?.count || 0) / 
                Math.max(pipelineData.reduce((sum, stage) => sum + stage.count, 0), 1) * 100)}%
            </p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency((pipelineData.find(s => s.name === 'Won')?.value || 0) / Math.max(pipelineData.find(s => s.name === 'Won')?.count || 1, 1))}
            </p>
            <p className="text-xs text-muted-foreground">Avg Deal Size</p>
          </div>
        </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}