import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
} from "lucide-react";
import { formatCurrency, formatDate, getCountdown, STAGE_PROBABILITIES } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NextStepModal } from "@/components/modals/NextStepModal";
import { MarkLostModal } from "@/components/modals/MarkLostModal";

// Normalisasi nama stage agar konsisten dengan kunci OPPORTUNITY_STAGES
const normalizeStageName = (name: string) => {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'presentation/poc' || lower === 'presentation / poc') return 'Presentation/POC';
  if (lower === 'approach/discovery' || lower === 'discovery') return 'Discovery';
  if (lower === 'negotiation' || lower === 'proposal') return 'Negotiation';
  if (lower === 'closed won' || lower === 'won') return 'Closed Won';
  if (lower === 'closed lost' || lower === 'lost') return 'Closed Lost';
  return trimmed;
};

interface Opportunity {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  stage: string;
  next_step_title: string | null;
  next_step_due_date: string | null;
  expected_close_date: string | null;
  last_activity_at: string | null;
  probability: number;
  forecast_category: string;
  created_at: string;
  customer_name?: string;
}

const OPPORTUNITY_STAGES = [
  { key: 'Prospecting', name: 'Prospecting', color: 'bg-blue-500' },
  { key: 'Qualification', name: 'Qualification', color: 'bg-purple-500' },
  { key: 'Discovery', name: 'Discovery', color: 'bg-indigo-500' },
  { key: 'Presentation/POC', name: 'Presentation/POC', color: 'bg-yellow-500' },
  { key: 'Negotiation', name: 'Negotiation', color: 'bg-orange-500' },
  { key: 'Closed Won', name: 'Closed Won', color: 'bg-green-500' },
  { key: 'Closed Lost', name: 'Closed Lost', color: 'bg-red-500' }
];

interface OpportunityKanbanProps {
  userProfile: any;
  onRefresh: () => void;
}

export function OpportunityKanban({ userProfile, onRefresh }: OpportunityKanbanProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);

  useEffect(() => {
    if (!userProfile) return;
    fetchOpportunities();
  }, [userProfile]);

  const fetchOpportunities = async () => {
    if (!userProfile) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('opportunities')
        .select(`
          id,
          name,
          description,
          amount,
          currency,
          stage,
          status,
          probability,
          forecast_category,
          expected_close_date,
          next_step_title,
          next_step_due_date,
          last_activity_at,
          created_at,
          owner_id,
          customer_id,
          customer:organizations!customer_id(name),
          pipeline_stages!stage_id (
            name
          )
        `)
        .eq('status', 'open');

      // Role-based filtering
      if (userProfile.role === 'account_manager') {
        query = query.eq('owner_id', userProfile.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Database query error:', error);
        throw error;
      }

      // Debug logging for raw data
       
      // Debug individual opportunity names
      data?.slice(0, 5).forEach((opp: any, index: number) => {
          id: opp.id,
          name: opp.name,
          nameType: typeof opp.name,
          nameLength: opp.name?.length,
          isEmpty: !opp.name,
          isNull: opp.name === null,
          isUndefined: opp.name === undefined,
          isEmptyString: opp.name === '',
          rawObject: JSON.stringify(opp, null, 2)
        });
      });

      const mappedData: Opportunity[] = (data || []).map((opp: any) => {
        const mappedName = (opp.name && opp.name.trim()) ? opp.name.trim() : '[No Name]';
        
        // Debug each mapping
          originalName: opp.name,
          mappedName: mappedName,
          condition1: opp.name && opp.name.trim(),
          condition2: opp.name?.trim()
        });
        
        return {
          id: opp.id,
          name: mappedName,
          amount: opp.amount,
          currency: opp.currency || 'USD',
          // Utamakan kolom teks 'stage' agar fallback client-side terbaca
          stage: normalizeStageName(opp.stage || opp.pipeline_stages?.name || 'Prospecting'),
          next_step_title: opp.next_step_title,
          next_step_due_date: opp.next_step_due_date,
          expected_close_date: opp.expected_close_date,
          last_activity_at: opp.last_activity_at,
          probability: opp.probability || 0,
          forecast_category: opp.forecast_category || 'Pipeline',
          created_at: opp.created_at,
          customer_name: opp.customer?.name
        };
      });

      // Debug logging for mapped data
      
      // Debug individual mapped names
      mappedData.slice(0, 5).forEach((opp: Opportunity, index: number) => {
          id: opp.id,
          name: opp.name,
          originalName: data?.[index]?.name
        });
      });
      

      setOpportunities(mappedData);
      onRefresh();
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      toast.error('Failed to load opportunities');
    } finally {
      setLoading(false);
    }
  };

  const markAsWon = async (opportunityId: string) => {
    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ 
          status: 'won',
          is_won: true,
          is_closed: true,
          expected_close_date: new Date().toISOString().split('T')[0],
          probability: 100,
          stage: 'Closed Won',
          updated_at: new Date().toISOString()
        })
        .eq('id', opportunityId);

      if (error) throw error;

      // Create activity record for the win
      const { error: activityError } = await supabase
        .from('activities')
        .insert({
          opportunity_id: opportunityId,
          subject: 'Opportunity marked as won',
          description: 'Congratulations! This opportunity has been successfully closed.',
          status: 'done',
          created_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (activityError) {
        console.warn('Warning: Failed to create activity record:', activityError);
      }

      toast.success('Opportunity marked as won! 🎉');
      fetchOpportunities();
    } catch (error) {
      console.error('Error marking opportunity as won:', error);
      toast.error('Failed to mark opportunity as won');
    }
  };

  const openLostModal = (opportunity: Opportunity) => {
    setSelectedOpportunity(opportunity);
    setLostModalOpen(true);
  };

  const getInactivityDays = (lastActivity: string | null) => {
    if (!lastActivity) return null;
    const days = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getNextStepStatus = (dueDate: string | null) => {
    if (!dueDate) return null;
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { status: 'overdue', days: Math.abs(diffDays) };
    if (diffDays === 0) return { status: 'today', days: 0 };
    if (diffDays <= 3) return { status: 'due_soon', days: diffDays };
    return { status: 'future', days: diffDays };
  };

  const getOpportunitiesByStage = () => {
    const stageGroups: { [key: string]: Opportunity[] } = {};
    
    OPPORTUNITY_STAGES.forEach(stage => {
      stageGroups[stage.key] = opportunities.filter(opp => opp.stage === stage.key);
    });
    
    return stageGroups;
  };

  const renderOpportunityCard = (opp: Opportunity, stage: string) => {
    const dueDateInfo = opp.next_step_due_date ? getCountdown(opp.next_step_due_date) : null;

    return (
      <Card key={opp.id} className="mb-3 hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          {/* Header with title and probability pill */}
          <div className="flex items-start justify-between mb-3">
            <h4 className="font-semibold text-base flex-1 mr-2">
              {opp.name}
            </h4>
            <Badge variant="secondary" className="px-2 py-1 text-sm font-medium">
              {Math.round((STAGE_PROBABILITIES[opp.stage] || 0) * 100)}%
            </Badge>
          </div>
          
          {/* Amount */}
          <div className="text-2xl font-bold text-blue-600 mb-4">
            {formatCurrency(opp.amount || 0, opp.currency)}
          </div>

          {/* Next Step - single line */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex-1 min-w-0">
                <span className="text-muted-foreground font-medium">Next Step</span>
                <div className="font-medium text-foreground mt-1">
                  {opp.next_step_title || 'Qualification'}
                </div>
              </div>
              {dueDateInfo && (
                <div className="flex-shrink-0 ml-3 text-right">
                  <div className="text-xs text-muted-foreground">
                    {formatDate(opp.next_step_due_date)}
                  </div>
                  <div className={`text-xs font-medium mt-1 ${dueDateInfo.isOverdue ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {dueDateInfo.isOverdue ? '-' : 'in '}{dueDateInfo.text}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Next Step Button */}
          <div className="flex justify-end">
            <NextStepModal
              opportunityId={opp.id}
              opportunityName={opp.name}
              currentNextStep={opp.next_step_title}
              currentDueDate={opp.next_step_due_date}
              onSuccess={() => {
                // Add small delay to ensure database changes are committed
                setTimeout(() => {
                  fetchOpportunities();
                }, 500);
              }}
            />
          </div>
        </CardContent>
      </Card>
    );
  };

  const stageGroups = getOpportunitiesByStage();

  const renderStageCard = (stage: any) => {
    const stageOpportunities = stageGroups[stage.key] || [];
    const stageValue = stageOpportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);

    return (
      <Card key={stage.key} className="h-fit">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${stage.color}`} />
              {stage.name}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {stageOpportunities.length}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {formatCurrency(stageValue)}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {stageOpportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No opportunities in this stage
              </p>
            ) : (
              stageOpportunities.map(opp => renderOpportunityCard(opp, stage.key))
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      {/* Opportunity Kanban Board */}
      <div className="space-y-4">
        {/* Prospecting - Full Width */}
        <div className="w-full">
          {renderStageCard(OPPORTUNITY_STAGES[0])}
        </div>
        
        {/* Other stages - 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {OPPORTUNITY_STAGES.slice(1).map((stage) => renderStageCard(stage))}
        </div>
      </div>

      {/* Mark Lost Modal */}
      {selectedOpportunity && (
        <MarkLostModal
          open={lostModalOpen}
          onOpenChange={setLostModalOpen}
          opportunityId={selectedOpportunity.id}
          opportunityName={selectedOpportunity.name}
          onSuccess={fetchOpportunities}
        />
      )}
    </>
  );
}