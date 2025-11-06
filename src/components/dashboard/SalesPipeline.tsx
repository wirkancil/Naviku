import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import { Plus, Search, Filter, Moon, Sun, DollarSign, TrendingUp, User } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrencyFormatter } from "@/hooks/useCurrencyFormatter";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type PipelineStage = "Lead" | "Contacted" | "Proposal Sent" | "Negotiation" | "Won" | "Lost";
type DealStatus = "Hot" | "Warm" | "Cold";

interface Deal {
  id: string;
  company_name: string;
  deal_value: number;
  contact_person: string;
  contact_avatar?: string;
  assigned_rep: string;
  stage: PipelineStage;
  status: DealStatus;
  created_at: string;
  user_id?: string;
}

interface SalesPipelineProps {
  className?: string;
}

const pipelineStages: PipelineStage[] = [
  "Lead",
  "Contacted", 
  "Proposal Sent",
  "Negotiation",
  "Won",
  "Lost"
];

// Empty initial deals array - data will be loaded from database
const initialDeals: Deal[] = [];

const STORAGE_KEY = "sales_pipeline_deals";

// Draggable Deal Card Component
function DealCard({ deal, isDragging }: { deal: Deal; isDragging?: boolean }) {
  const { formatCurrency } = useCurrencyFormatter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getStatusColor = (status: DealStatus) => {
    switch (status) {
      case "Hot":
        return "bg-red-50 text-red-700 border-red-200";
      case "Warm":
        return "bg-orange-50 text-orange-700 border-orange-200";
      case "Cold":
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };


  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white border border-gray-200 rounded-lg p-4 mb-3 shadow-sm hover:shadow-md transition-shadow cursor-move"
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-semibold text-gray-900 text-sm">{deal.company_name}</h4>
        <Badge className={`${getStatusColor(deal.status)} text-xs`}>
          {deal.status}
        </Badge>
      </div>
      
      <div className="flex items-center gap-2 mb-3">
        <Avatar className="h-6 w-6">
          <AvatarImage src={deal.contact_avatar} alt={deal.contact_person} />
          <AvatarFallback className="text-xs">
            {deal.contact_person.split(' ').map(n => n[0]).join('')}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm text-gray-600">{deal.contact_person}</span>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-green-600 font-semibold">
          <DollarSign className="h-4 w-4" />
          <span className="text-sm">{formatCurrency(deal.deal_value, 'USD')}</span>
        </div>
        <span className="text-xs text-gray-500">{deal.assigned_rep}</span>
      </div>
    </div>
  );
}

// Pipeline Column Component
function PipelineColumn({ 
  stage, 
  deals, 
  totalValue,
  conversionRate 
}: { 
  stage: PipelineStage; 
  deals: Deal[];
  totalValue: number;
  conversionRate: number;
}) {
  const { formatCurrency } = useCurrencyFormatter();

  const getStageColor = (stage: PipelineStage) => {
    switch (stage) {
      case "Lead":
        return "bg-blue-50 border-blue-200";
      case "Contacted":
        return "bg-indigo-50 border-indigo-200";
      case "Proposal Sent":
        return "bg-purple-50 border-purple-200";
      case "Negotiation":
        return "bg-orange-50 border-orange-200";
      case "Won":
        return "bg-green-50 border-green-200";
      case "Lost":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  return (
    <div className={`min-w-80 border rounded-lg ${getStageColor(stage)} p-4`}>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">{stage}</h3>
          <span className="text-sm text-gray-500">{deals.length}</span>
        </div>
        
        <div className="text-sm font-medium text-gray-700 mb-1">
          {formatCurrency(totalValue, 'USD')}
        </div>
        
        {stage !== "Lead" && (
          <div className="flex items-center gap-2">
            <Progress value={conversionRate} className="flex-1 h-2" />
            <span className="text-xs text-gray-500">{conversionRate.toFixed(1)}%</span>
          </div>
        )}
      </div>

      <SortableContext items={deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3 min-h-32">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

interface SalesPipelineProps {
  deals?: any[];
  userProfile?: any;
  className?: string;
}

export function SalesPipeline({ deals: propDeals, userProfile: propUserProfile, className = "" }: SalesPipelineProps) {
  const [deals, setDeals] = useState<Deal[]>(propDeals || []);
  const [isAddDealOpen, setIsAddDealOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRep, setFilterRep] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  const [minValue, setMinValue] = useState<string>("");
  const [maxValue, setMaxValue] = useState<string>("");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  // Use provided deals if available, otherwise fall back to local state
  const displayDeals = propDeals || deals;

  // Available reps from Supabase, filtered by user role
  const [availableReps, setAvailableReps] = useState<{ id: string; name: string }[]>([]);

  const [newDeal, setNewDeal] = useState<Partial<Deal>>({
    company_name: "",
    deal_value: 0,
    contact_person: "",
    assigned_rep: "",
    stage: "Lead",
    status: "Warm",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Load deals from Supabase on component mount
  useEffect(() => {
    const loadDeals = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await (supabase as any)
          .from('deals')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
          // Build a lookup map of assigned_to user IDs to full names
          const assignedIds = Array.from(new Set((data as any[])
            .map((d: any) => d.assigned_to)
            .filter((id: string | null) => !!id)));

          let idToName: Record<string, string> = {};
          if (assignedIds.length > 0) {
            const { data: repProfiles } = await (supabase as any)
              .from('user_profiles')
              .select('user_id, full_name')
              .in('user_id', assignedIds);
            idToName = Object.fromEntries(((repProfiles || []) as any[]).map((r: any) => [r.user_id, r.full_name]));
          }

          // Map database fields to Deal interface, using display names for assigned reps
          const mappedDeals: Deal[] = (data as any[]).map((dbDeal: any) => ({
            id: dbDeal.id,
            company_name: dbDeal.company_name,
            deal_value: dbDeal.deal_value,
            contact_person: dbDeal.contact_person,
            contact_avatar: "/placeholder.svg", // Default avatar
            assigned_rep: idToName[dbDeal.assigned_to] || "Unknown",
            stage: dbDeal.stage as PipelineStage,
            status: dbDeal.status as DealStatus,
            created_at: dbDeal.created_at,
            user_id: dbDeal.user_id
          }));
          setDeals(mappedDeals);
        } else {
          // Initialize with empty data for new users
          setDeals([]);
        }
      } catch (error) {
        console.error('Error loading deals:', error);
        toast({
          title: "Error",
          description: "Failed to load deals from database.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadDeals();
  }, [user, toast]);

  // Fetch available reps for the Assigned Rep select based on user role
  useEffect(() => {
    const fetchAvailableReps = async () => {
      try {
        if (!propUserProfile) return;

        // Account managers: only themselves
        if (propUserProfile.role === 'account_manager') {
          if (user) {
            setAvailableReps([{ id: user.id, name: propUserProfile.full_name || 'Me' }]);
          }
          return;
        }

        // Heads/managers/admins - fetch scoped users
        let query: any = (supabase as any)
          .from('user_profiles')
          .select('user_id, full_name, entity_id, division_id');

        if (propUserProfile.role === 'head' && propUserProfile.entity_id) {
          query = query.eq('entity_id', propUserProfile.entity_id);
        } else if (propUserProfile.role === 'manager' && propUserProfile.entity_id && propUserProfile.division_id) {
          query = query
            .eq('entity_id', propUserProfile.entity_id)
            .eq('division_id', propUserProfile.division_id);
        }
        // Admins see all users

        const { data, error } = await query.order('full_name');
        if (error) throw error;

        setAvailableReps(((data || []) as any[]).map((u: any) => ({ id: u.user_id, name: u.full_name })));
      } catch (err) {
        console.error('Error fetching available reps:', err);
        setAvailableReps([]);
      }
    };

    fetchAvailableReps();
  }, [propUserProfile, user]);

  // Get unique reps for filtering (uses display names)
  const uniqueReps = Array.from(new Set(deals.map(deal => deal.assigned_rep)));

  // Filter deals based on search and filters
  const filteredDeals = deals.filter(deal => {
    const matchesSearch = deal.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         deal.contact_person.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRep = filterRep === "all" || deal.assigned_rep === filterRep;
    
    const matchesValue = (!minValue || deal.deal_value >= parseInt(minValue)) &&
                        (!maxValue || deal.deal_value <= parseInt(maxValue));
    
    // Basic period filtering (could be enhanced with actual date logic)
    const matchesPeriod = filterPeriod === "all"; // Simplified for now
    
    return matchesSearch && matchesRep && matchesValue && matchesPeriod;
  });

  // Group deals by stage
  const dealsByStage = pipelineStages.reduce((acc, stage) => {
    acc[stage] = filteredDeals.filter(deal => deal.stage === stage);
    return acc;
  }, {} as Record<PipelineStage, Deal[]>);

  // Calculate totals and conversion rates
  const getStageMetrics = (stage: PipelineStage) => {
    const stageDeals = dealsByStage[stage];
    const totalValue = stageDeals.reduce((sum, deal) => sum + deal.deal_value, 0);
    
    // Simple conversion rate calculation (could be enhanced)
    const totalDeals = deals.length;
    const conversionRate = totalDeals > 0 ? (stageDeals.length / totalDeals) * 100 : 0;
    
    return { totalValue, conversionRate };
  };

  const handleDragStart = (event: DragStartEvent) => {
    const deal = deals.find(d => d.id === event.active.id);
    setActiveDeal(deal || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);
    
    if (!over || !user) return;
    
    const dealId = active.id as string;
    const newStage = over.id as PipelineStage;
    
    if (pipelineStages.includes(newStage)) {
      // Optimistically update UI
      setDeals(deals.map(deal => 
        deal.id === dealId 
          ? { ...deal, stage: newStage }
          : deal
      ));

      try {
        const { error } = await (supabase as any)
          .from('deals')
          .update({ stage: newStage })
          .eq('id', dealId)
          .eq('user_id', user.id);

        if (error) throw error;
        
        toast({
          title: "Deal Updated",
          description: `Deal moved to ${newStage}`,
        });
      } catch (error) {
        console.error('Error updating deal:', error);
        // Revert optimistic update
        setDeals(deals.map(deal => 
          deal.id === dealId 
            ? { ...deal, stage: deals.find(d => d.id === dealId)?.stage || newStage }
            : deal
        ));
        toast({
          title: "Error",
          description: "Failed to update deal in database.",
          variant: "destructive",
        });
      }
    }
  };

  const handleAddDeal = async () => {
    if (!newDeal.company_name || !newDeal.contact_person || !newDeal.assigned_rep || !user) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      const dealData = {
        company_name: newDeal.company_name!,
        deal_value: newDeal.deal_value || 0,
        contact_person: newDeal.contact_person!,
        assigned_to: newDeal.assigned_rep!, // store user_id
        stage: newDeal.stage || "Lead",
        status: newDeal.status || "Warm",
        user_id: user.id,
        contact_email: null
      };

      const { data, error } = await supabase
        .from('deals')
        .insert([dealData])
        .select()
        .single();

      if (error) throw error;

      // Map the returned data to Deal interface, showing full_name for assigned rep
      const newDealWithId: Deal = {
        id: (data as any).id,
        company_name: (data as any).company_name,
        deal_value: (data as any).deal_value,
        contact_person: (data as any).contact_person,
        contact_avatar: "/placeholder.svg",
        assigned_rep: availableReps.find(r => r.id === (data as any).assigned_to)?.name || "Unknown",
        stage: (data as any).stage as PipelineStage,
        status: (data as any).status as DealStatus,
        created_at: (data as any).created_at,
        user_id: (data as any).user_id
      };

      setDeals([newDealWithId, ...deals]);
      setNewDeal({
        company_name: "",
        deal_value: 0,
        contact_person: "",
        assigned_rep: "",
        stage: "Lead",
        status: "Warm",
      });
      setIsAddDealOpen(false);
      
      toast({
        title: "Success",
        description: "New deal added successfully!",
      });
    } catch (error) {
      console.error('Error adding deal:', error);
      toast({
        title: "Error",
        description: "Failed to add deal to database.",
        variant: "destructive",
      });
    }
  };

  const totalPipelineValue = deals.reduce((sum, deal) => sum + deal.deal_value, 0);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-foreground">Sales Pipeline</h2>
          <Badge className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            ${totalPipelineValue.toLocaleString()}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsDarkMode(!isDarkMode)}>
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          
          <Dialog open={isAddDealOpen} onOpenChange={setIsAddDealOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" />
                Add Deal
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Deal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="company-name">Company Name *</Label>
                  <Input
                    id="company-name"
                    value={newDeal.company_name || ""}
                    onChange={(e) => setNewDeal({ ...newDeal, company_name: e.target.value })}
                    placeholder="Enter company name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="deal-value">Deal Value *</Label>
                  <Input
                    id="deal-value"
                    type="number"
                    value={newDeal.deal_value || ""}
                    onChange={(e) => setNewDeal({ ...newDeal, deal_value: parseInt(e.target.value) || 0 })}
                    placeholder="Enter deal value"
                  />
                </div>
                
                <div>
                  <Label htmlFor="contact-person">Contact Person *</Label>
                  <Input
                    id="contact-person"
                    value={newDeal.contact_person || ""}
                    onChange={(e) => setNewDeal({ ...newDeal, contact_person: e.target.value })}
                    placeholder="Enter contact person"
                  />
                </div>
                
                <div>
                  <Label htmlFor="assigned-rep">Assigned Rep *</Label>
                  <Select 
                    value={newDeal.assigned_rep || ""} 
                    onValueChange={(value) => setNewDeal({ ...newDeal, assigned_rep: value })}
                  >
                    <SelectTrigger id="assigned-rep">
                      <SelectValue placeholder="Select rep" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableReps.length === 0 ? (
                        <SelectItem value="" disabled>No reps available</SelectItem>
                      ) : (
                        availableReps.map((rep) => (
                          <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="stage">Stage</Label>
                    <Select 
                      value={newDeal.stage || "Lead"} 
                      onValueChange={(value) => setNewDeal({ ...newDeal, stage: value as PipelineStage })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelineStages
                          .filter(stage => stage && stage.trim() !== '')
                          .map(stage => (
                            <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select 
                      value={newDeal.status || "Warm"} 
                      onValueChange={(value) => setNewDeal({ ...newDeal, status: value as DealStatus })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hot">🔥 Hot</SelectItem>
                        <SelectItem value="Warm">🟡 Warm</SelectItem>
                        <SelectItem value="Cold">🧊 Cold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsAddDealOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddDeal}>Add Deal</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search deals by company or contact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Select value={filterRep} onValueChange={setFilterRep}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Reps" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reps</SelectItem>
                  {uniqueReps.map(rep => (
                    <SelectItem key={rep} value={rep}>{rep}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Min $"
                  value={minValue}
                  onChange={(e) => setMinValue(e.target.value)}
                  className="w-20"
                />
                <Input
                  type="number"
                  placeholder="Max $"
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                  className="w-20"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto">
          <div className="flex gap-6 pb-4" style={{ minWidth: 'max-content' }}>
            {pipelineStages.map((stage) => {
              const { totalValue, conversionRate } = getStageMetrics(stage);
              return (
                <SortableContext key={stage} items={[stage]} strategy={verticalListSortingStrategy}>
                  <div 
                    id={stage}
                    className="cursor-pointer"
                  >
                    <PipelineColumn
                      stage={stage}
                      deals={dealsByStage[stage]}
                      totalValue={totalValue}
                      conversionRate={conversionRate}
                    />
                  </div>
                </SortableContext>
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {activeDeal ? <DealCard deal={activeDeal} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}