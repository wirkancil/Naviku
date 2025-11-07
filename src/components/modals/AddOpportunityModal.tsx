import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Plus } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
type OpportunityStatus = "Hot" | "Warm" | "Cold";
type OpportunityProgress = "Prospecting" | "Qualification" | "Approaching" | "Presentation/POC";
interface NewOpportunity {
  name: string;
  description: string;
  product: string;
  amount: string;
  currency: string;
  status: OpportunityStatus;
  customerId: string;
  endUserId?: string;
  expectedCloseDate: string;
  progress: OpportunityProgress;
}
interface Customer {
  id: string;
  name: string;
  type: string;
}
interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
}
interface PipelineStage {
  id: string;
  name: string;
  sort_order: number;
  default_probability: number;
}
interface AddOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddOpportunity: () => void;
}
export default function AddOpportunityModal({
  isOpen,
  onClose,
  onAddOpportunity
}: AddOpportunityModalProps) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [endUsers, setEndUsers] = useState<Customer[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [newOpportunity, setNewOpportunity] = useState<NewOpportunity>({
    name: '',
    description: '',
    product: '',
    amount: '',
    currency: 'IDR',
    status: 'Warm',
    customerId: '',
    endUserId: '',
    expectedCloseDate: '',
    progress: 'Prospecting'
  });

  // Fetch customers and pipeline data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch customers
        const {
          data: customerData
        } = await supabase.from('organizations').select('id, name, type').eq('type', 'customer').eq('is_active', true);
        if (customerData) {
          setCustomers(customerData);
        }

        // Fetch end users
        const {
          data: endUserData
        } = await supabase.from('organizations').select('id, name, type').eq('type', 'end_user').eq('is_active', true);
        if (endUserData) {
          setEndUsers(endUserData);
        }

        // Fetch default pipeline with stages
        const {
          data: pipelineData,
          error: pipelineError
        } = await supabase.from('pipelines').select('id, name').eq('is_active', true).order('created_at').limit(1).maybeSingle();
        if (pipelineError) {
          console.error('Pipeline fetch error:', pipelineError);
          toast.error('Failed to load pipeline configuration');
          return;
        }
        if (pipelineData) {
          // Fetch stages for this pipeline
          const {
            data: stagesData,
            error: stagesError
          } = await supabase.from('pipeline_stages').select('id, name, sort_order, default_probability').eq('pipeline_id', pipelineData.id).eq('is_active', true).order('sort_order');
          if (stagesError) {
            console.error('Stages fetch error:', stagesError);
            toast.error('Failed to load pipeline stages');
            return;
          }
          if (stagesData) {
            setPipeline({
              id: pipelineData.id,
              name: pipelineData.name,
              stages: stagesData
            });
            // Set default progress to first option
            setNewOpportunity(prev => ({
              ...prev,
              progress: 'Prospecting'
            }));
          }
        } else {
          toast.error('No active pipeline found. Please contact your administrator.');
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load form data');
      }
    };
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);
  const handleSubmit = async () => {
    if (!newOpportunity.name.trim()) {
      toast.error('Opportunity name is required');
      return;
    }
    
    if (!newOpportunity.customerId) {
      toast.error('Please select a customer');
      return;
    }
    
    if (!pipeline) {
      toast.error('Pipeline configuration not loaded. Please try again.');
      return;
    }
    
    setLoading(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id!;
      const amount = newOpportunity.amount ? parseFloat(newOpportunity.amount.replace(/,/g, '')) : 0;
      
      // Set default expected close date to 30 days from now if not provided
      const defaultCloseDate = new Date();
      defaultCloseDate.setDate(defaultCloseDate.getDate() + 30);
      const expectedCloseDate = newOpportunity.expectedCloseDate || defaultCloseDate.toISOString().split('T')[0];
      
      // Create opportunity
      const { data: opportunityData, error: oppError } = await supabase
        .from('opportunities')
        .insert({
          name: newOpportunity.name.trim(),
          description: newOpportunity.description || null,
          product: newOpportunity.product || null,
          amount: amount || null,
          currency: newOpportunity.currency,
          probability: 10,
          expected_close_date: expectedCloseDate,
          customer_id: newOpportunity.customerId,
          end_user_id: newOpportunity.endUserId || newOpportunity.customerId,
          end_user_mode: newOpportunity.endUserId ? null : 'same_as_customer',
          pipeline_id: pipeline.id,
          stage_id: pipeline.stages[0]?.id,
          status: 'open',
          created_by: userId,
          owner_id: userId
        })
        .select()
        .single();
      
      if (oppError) throw oppError;

      // Create corresponding pipeline item with the same expected close date using RPC function
      const { data: pipelineItemId, error: pipelineItemError } = await supabase.rpc('create_pipeline_item', {
        p_opportunity_id: opportunityData.id,
        p_pipeline_id: pipeline.id,
        p_amount: amount,
        p_currency: newOpportunity.currency as any,
        p_status: 'negotiation',
        p_probability: 10,
        p_expected_close_date: expectedCloseDate
      });
      
      if (pipelineItemError) {
        console.error('Error creating pipeline item:', pipelineItemError);
        throw pipelineItemError;
      }

      toast.success('Opportunity created successfully!');
      onAddOpportunity();
      handleCancel();
    } catch (error) {
      console.error('Error creating opportunity:', error);
      toast.error('Failed to create opportunity');
    } finally {
      setLoading(false);
    }
  };
  const handleCancel = () => {
    setNewOpportunity({
      name: '',
      description: '',
      product: '',
      amount: '',
      currency: 'IDR',
      status: 'Warm',
      customerId: '',
      endUserId: '',
      expectedCloseDate: '',
      progress: 'Prospecting'
    });
    onClose();
  };
  return <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogTrigger asChild>
        
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Add New Opportunity</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          {/* Opportunity Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Opportunity Name <span className="text-destructive">*</span>
            </Label>
            <Input id="name" value={newOpportunity.name} onChange={e => setNewOpportunity(prev => ({
            ...prev,
            name: e.target.value
          }))} placeholder="Enter opportunity name" className="w-full" />
          </div>
          
          {/* Customer */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Customer <span className="text-destructive">*</span>
            </Label>
            <Select value={newOpportunity.customerId} onValueChange={value => setNewOpportunity(prev => ({
            ...prev,
            customerId: value
          }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.filter(customer => customer.id && customer.id.trim() !== '' && customer.name && customer.name.trim() !== '').map(customer => <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* End User */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              End User <span className="text-destructive">*</span>
            </Label>
            <Select value={newOpportunity.endUserId || "none"} onValueChange={value => setNewOpportunity(prev => ({
            ...prev,
            endUserId: value === "none" ? "" : value
          }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select end user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Same as customer</SelectItem>
                {endUsers.filter(user => user.id && user.id.trim() !== '' && user.name && user.name.trim() !== '').map(user => <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Product */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Product <span className="text-destructive">*</span>
            </Label>
            <Select value={newOpportunity.product} onValueChange={value => setNewOpportunity(prev => ({
            ...prev,
            product: value
          }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Infrastructure">Infrastructure</SelectItem>
                <SelectItem value="Security">Security</SelectItem>
                <SelectItem value="Automation">Automation</SelectItem>
                <SelectItem value="Prosnap">Prosnap</SelectItem>
                <SelectItem value="Services">Services</SelectItem>
                <SelectItem value="Manage Services">Manage Services</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-sm font-medium">Amount</Label>
            <Input id="amount" type="text" value={newOpportunity.amount} onChange={e => {
            const value = e.target.value.replace(/[^\d]/g, '');
            const formattedValue = value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            setNewOpportunity(prev => ({
              ...prev,
              amount: formattedValue
            }));
          }} placeholder="0,000" className="text-right" />
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Currency</Label>
            <Select value={newOpportunity.currency} onValueChange={value => setNewOpportunity(prev => ({
            ...prev,
            currency: value
          }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IDR">IDR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
        </Select>
      </div>

          {/* Target Close */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Target Close</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !newOpportunity.expectedCloseDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newOpportunity.expectedCloseDate
                    ? format(new Date(newOpportunity.expectedCloseDate), "PPP")
                    : "Pick target close date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={
                    newOpportunity.expectedCloseDate
                      ? new Date(newOpportunity.expectedCloseDate)
                      : undefined
                  }
                  onSelect={(date) =>
                    setNewOpportunity((prev) => ({
                      ...prev,
                      expectedCloseDate: date ? format(date, "yyyy-MM-dd") : "",
                    }))
                  }
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Opportunity Progress - Fixed to Prospecting only */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Opportunity Stage</Label>
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <span className="text-sm font-medium">Prospecting</span>
              <span className="text-xs text-muted-foreground">All opportunities start here</span>
            </div>
            <p className="text-xs text-muted-foreground">
              New opportunities must start at Prospecting stage. Use "Next Step" to advance through stages sequentially.
            </p>
          </div>

          
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">Description (Optional)</Label>
            <Textarea id="description" value={newOpportunity.description} onChange={e => setNewOpportunity(prev => ({
            ...prev,
            description: e.target.value
          }))} placeholder="Add any additional notes about this opportunity..." className="w-full resize-none" rows={3} />
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-3 pt-6 gap-3">
          <Button variant="outline" onClick={handleCancel} className="sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!newOpportunity.name || !newOpportunity.customerId || !newOpportunity.product || loading} className="sm:w-auto">
            {loading ? 'Creating...' : 'Create Opportunity'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>;
}