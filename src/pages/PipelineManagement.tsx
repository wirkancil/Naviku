import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, TrendingUp, Target, Award, DollarSign, X, Settings, Zap, Brain, MessageSquare, Plug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AddPipelineModal from "@/components/modals/AddPipelineModal";
import EditPipelineModal from "@/components/modals/EditPipelineModal";
import { formatCurrency } from "@/lib/constants";
import { WorkflowAutomation } from "@/components/advanced/WorkflowAutomation";
import { AIForecastingEngine } from "@/components/advanced/AIForecastingEngine";
import { IntegrationManagement } from "@/components/advanced/IntegrationManagement";
import RealTimeAnalyticsDashboard from "@/components/advanced/RealTimeAnalyticsDashboard";
import ReportBuilder from "@/components/advanced/ReportBuilder";
import PipelineHealthScoring from "@/components/advanced/PipelineHealthScoring";
import GlobalSearchCommand from "@/components/advanced/GlobalSearchCommand";
import { ENABLE_ADVANCED_REPORTS, ENABLE_FORECASTING } from "@/config/features";

interface OpportunityItem {
  id: string;
  name: string;
  amount: number;
  currency: string;
  probability: number;
  stage: string;
  expected_close_date: string;
  next_step_title?: string;
  next_step_due_date?: string;
  is_closed: boolean;
  is_won: boolean;
  status?: string;
  forecast_category?: string;
}

const getQuarter = (date: string): string => {
  const month = new Date(date).getMonth() + 1;
  if (month <= 3) return 'Q1';
  if (month <= 6) return 'Q2';
  if (month <= 9) return 'Q3';
  return 'Q4';
};

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'won':
      return 'bg-green-500';
    case 'lost':
      return 'bg-red-500';
    case 'send quotation':
    case 'negotiation':
      return 'bg-yellow-500';
    default:
      return 'bg-blue-500';
  }
};

export default function PipelineManagement() {
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<OpportunityItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      fetchOpportunities();
    }
  }, [user?.id]);

  const fetchOpportunities = async () => {
    try {
      setLoading(true);
      
      if (!user?.id) {
        setLoading(false);
        return;
      }
      
      // Fetch opportunities with new database structure
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq('owner_id', user.id);

      if (error) throw error;

      const formattedData: OpportunityItem[] = (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        amount: item.amount || 0,
        currency: item.currency || 'USD',
        probability: item.probability || 0,
        stage: item.stage || 'Prospecting',
        expected_close_date: item.expected_close_date,
        next_step_title: item.next_step_title,
        next_step_due_date: item.next_step_due_date,
        is_closed: item.is_closed || false,
        is_won: item.is_won || false,
        status: item.status || 'open',
        forecast_category: item.forecast_category || 'Pipeline'
      }));

      setOpportunities(formattedData);
    } catch (error) {
      console.error('Error fetching opportunities:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupedByQuarter = opportunities.reduce((acc, item) => {
    const quarter = getQuarter(item.expected_close_date);
    if (!acc[quarter]) acc[quarter] = [];
    acc[quarter].push(item);
    return acc;
  }, {} as Record<string, OpportunityItem[]>);

  const totalValue = opportunities.reduce((sum, item) => sum + item.amount, 0);
  const averageProbability = opportunities.length > 0 
    ? opportunities.reduce((sum, item) => sum + item.probability, 0) / opportunities.length 
    : 0;

  const proposalDeals = opportunities.filter(item => item.stage === 'Proposal/Negotiation');
  const wonDeals = opportunities.filter(item => item.stage === 'Closed Won' || (item.is_closed && item.is_won));
  const lostDeals = opportunities.filter(item => item.stage === 'Closed Lost' || (item.is_closed && !item.is_won));

  const filteredProposalDeals = selectedQuarter 
    ? proposalDeals.filter(item => getQuarter(item.expected_close_date) === selectedQuarter)
    : proposalDeals;
  
  const filteredWonDeals = selectedQuarter 
    ? wonDeals.filter(item => getQuarter(item.expected_close_date) === selectedQuarter)
    : wonDeals;
    
  const filteredLostDeals = selectedQuarter 
    ? lostDeals.filter(item => getQuarter(item.expected_close_date) === selectedQuarter)
    : lostDeals;

  const handleEditItem = (item: OpportunityItem) => {
    setEditingItem(item);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingItem(null);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-48 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Advanced Pipeline Management</h1>
        <div className="flex items-center gap-4">
          <AddPipelineModal onAddPipeline={fetchOpportunities} />
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {new Date().getFullYear()} Enhanced CRM Suite
            </span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-9">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="manager">Manager View</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="health">Health Score</TabsTrigger>
          {ENABLE_ADVANCED_REPORTS && <TabsTrigger value="reports">Reports</TabsTrigger>}
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          {ENABLE_FORECASTING && <TabsTrigger value="forecasting">AI Forecasting</TabsTrigger>}
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="search">Global Search</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-6">
          {/* Basic Pipeline View */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
                <p className="text-xs text-muted-foreground">
                  +20.1% from last month
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Opportunities</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{opportunities.length}</div>
                <p className="text-xs text-muted-foreground">
                  +12% from last month
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Probability</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Math.round(averageProbability)}%</div>
                <p className="text-xs text-muted-foreground">
                  +5.2% from last month
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Closing This Quarter</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{proposalDeals.length}</div>
                <p className="text-xs text-muted-foreground">
                  In proposal stage
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="manager" className="space-y-6">
          {/* Consolidated Manager Pipeline View - replaces redundant ManagerPipeline.tsx */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Weighted Pipeline</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(opportunities.reduce((sum, opp) => sum + (opp.amount || 0) * (opp.probability || 0) / 100, 0))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Commit (Q)</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(opportunities.filter(opp => opp.forecast_category === 'Commit').reduce((sum, opp) => sum + (opp.amount || 0), 0))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Best (Q)</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {formatCurrency(opportunities.filter(opp => opp.forecast_category === 'Best Case').reduce((sum, opp) => sum + (opp.amount || 0), 0))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gap to Target</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {formatCurrency(Math.max(0, 5000000 - opportunities.filter(opp => opp.forecast_category === 'Commit').reduce((sum, opp) => sum + (opp.amount || 0), 0)))}
                </div>
                <p className="text-xs text-muted-foreground">Target: {formatCurrency(5000000)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Kanban Board - Manager Pipeline View */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {["Proposal/Negotiation", "Closed Won", "Closed Lost"].map(stageName => {
              const stageOpportunities = opportunities.filter(opp => {
                if (stageName === "Proposal/Negotiation") return opp.stage === "Proposal/Negotiation";
                if (stageName === "Closed Won") return opp.stage === "Closed Won" || opp.status === "won";
                if (stageName === "Closed Lost") return opp.stage === "Closed Lost" || opp.status === "lost";
                return false;
              });
              const stageTotal = stageOpportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);

              return (
                <Card key={stageName} className="h-fit">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg">{stageName}</CardTitle>
                      <Badge variant="outline">{stageOpportunities.length}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total: {formatCurrency(stageTotal)}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {stageOpportunities.map(opp => (
                        <Card key={opp.id} className="mb-3 hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-medium text-sm">{opp.name}</h4>
                              <Badge variant="outline" className="text-xs">{opp.probability}%</Badge>
                            </div>
                            <div className="text-lg font-semibold text-blue-600 mb-3">
                              {formatCurrency(opp.amount || 0)}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
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
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <RealTimeAnalyticsDashboard />
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <PipelineHealthScoring />
        </TabsContent>

        {ENABLE_ADVANCED_REPORTS && (
          <TabsContent value="reports" className="space-y-6">
            <ReportBuilder />
          </TabsContent>
        )}

        <TabsContent value="workflow" className="space-y-6">
          <WorkflowAutomation />
        </TabsContent>

        {ENABLE_FORECASTING && (
          <TabsContent value="forecasting" className="space-y-6">
            <AIForecastingEngine />
          </TabsContent>
        )}

        <TabsContent value="integrations" className="space-y-6">
          <IntegrationManagement />
        </TabsContent>

        <TabsContent value="search" className="space-y-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-4">
              <h3 className="text-lg font-semibold">Global Search</h3>
              <p className="text-muted-foreground max-w-md">
                Use Ctrl+K to open the global search command palette and quickly find opportunities, contacts, companies, and more.
              </p>
              <GlobalSearchCommand open={false} onOpenChange={() => {}} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}