import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { Plus, Search, Edit, Trash2, Check, X, TrendingUp, Phone, Video, MapPin, CheckCircle, Clock, XCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
interface SalesActivity {
  id: string;
  activity_type: "call" | "meeting_online" | "visit" | "go_show";
  customer_id: string;
  customer_name?: string;
  pic_id?: string;
  pic_name?: string;
  opportunity_id?: string;
  opportunity_name?: string;
  new_opportunity_name?: string;
  scheduled_at: string;
  status: "scheduled" | "done" | "canceled";
  notes?: string;
  mom_text?: string;
  mom_added_at?: string;
  created_by: string;
  created_at: string;
}
interface Organization {
  id: string;
  name: string;
}
interface Contact {
  id: string; // formatted as "org:{uuid}" or "ctc:{uuid}"
  full_name: string;
  source: "org" | "ctc";
  raw_id: string; // the underlying UUID without prefix, useful for DB writes
  email?: string | null;
  phone?: string | null;
}
interface Opportunity {
  id: string;
  name: string;
}
export function SalesActivityTracker() {
  const [activities, setActivities] = useState<SalesActivity[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<SalesActivity | null>(null);
  const [editingMom, setEditingMom] = useState<{
    id: string;
    mom_text: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [newActivity, setNewActivity] = useState<Partial<SalesActivity>>({
    activity_type: "call",
    customer_id: "",
    scheduled_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    status: "scheduled",
    notes: ""
  });
  const [selectedContactRef, setSelectedContactRef] = useState<string>("none");
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();
  const { profile } = useProfile();

  // Load data on component mount
  useEffect(() => {
    if (user && profile) {
      loadActivities();
      loadOrganizations();
      loadContacts();
      loadOpportunities();
    }
  }, [user, profile]);
  const loadActivities = async () => {
    if (!user || !profile) return;
    try {
      // Determine which user IDs to fetch activities for
      let userIds = [user.id];

      // If Manager, include team members
      if (profile.role === 'manager') {
        try {
          // First try explicit team mapping
          const { data: teamMembers } = await supabase
            .from('manager_team_members')
            .select('account_manager_id')
            .eq('manager_id', profile.id);

          if (teamMembers && teamMembers.length > 0) {
            const amIds = teamMembers.map(m => m.account_manager_id);
            const { data: amProfiles } = await supabase
              .from('user_profiles')
              .select('user_id')
              .in('id', amIds);
            
            if (amProfiles && amProfiles.length > 0) {
              const amUserIds = amProfiles.map(p => p.user_id).filter(Boolean);
              userIds = [user.id, ...amUserIds];
            }
          } else if (profile.entity_id && profile.division_id) {
            // Fallback to entity + team based
            const { data: teamMembers } = await supabase
              .from('user_profiles')
              .select('user_id')
              .eq('entity_id', profile.entity_id)
              .eq('division_id', profile.division_id)
              .in('role', ['account_manager', 'sales', 'staff']);
            
            if (teamMembers && teamMembers.length > 0) {
              const teamUserIds = teamMembers.map(p => p.user_id).filter(Boolean);
              userIds = [user.id, ...teamUserIds];
            }
          }
        } catch (err) {
          console.error('Error fetching team members for activities:', err);
        }
      }

      const {
        data,
        error
      } = await supabase.from('sales_activity_v2').select(`
          *,
          organizations!customer_id(name),
          organization_contacts!pic_id(full_name),
          opportunities!opportunity_id(name)
        `).in('created_by', userIds).order('scheduled_at', {
        ascending: false
      });

      // Fallback to legacy table if v2 relation is missing
      if (error && (error.code === '42P01' || (error.message || '').includes('sales_activity_v2'))) {
        const { data: legacyData, error: legacyError } = await supabase
          .from('sales_activity')
          .select('*')
          .in('user_id', userIds)
          .order('created_at', { ascending: false });
        if (legacyError) throw legacyError;

        const mappedActivities: SalesActivity[] = (legacyData || []).map((activity: any) => ({
          id: activity.id,
          activity_type: activity.activity_type,
          customer_id: activity.customer_id || '',
          customer_name: activity.customer_name,
          pic_id: undefined,
          pic_name: undefined,
          opportunity_id: undefined,
          opportunity_name: undefined,
          new_opportunity_name: undefined,
          scheduled_at: activity.activity_time || activity.created_at,
          status: 'done',
          notes: activity.notes,
          mom_text: undefined,
          mom_added_at: undefined,
          created_by: activity.user_id,
          created_at: activity.created_at || activity.activity_time
        }));
        setActivities(mappedActivities);
        return;
      }

      if (error) throw error;
      const mappedActivities: SalesActivity[] = (data || []).map(activity => ({
        id: activity.id,
        activity_type: activity.activity_type,
        customer_id: activity.customer_id,
        customer_name: activity.organizations?.name,
        pic_id: activity.pic_id,
        pic_name: activity.organization_contacts?.full_name,
        opportunity_id: activity.opportunity_id,
        opportunity_name: activity.opportunities?.name,
        new_opportunity_name: activity.new_opportunity_name,
        scheduled_at: activity.scheduled_at,
        status: activity.status,
        notes: activity.notes,
        mom_text: activity.mom_text,
        mom_added_at: activity.mom_added_at,
        created_by: activity.created_by,
        created_at: activity.created_at
      }));
      setActivities(mappedActivities);
    } catch (error) {
      console.error('Error loading activities:', error);
      toast({
        title: "Error",
        description: "Failed to load activities.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const loadOrganizations = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('organizations').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      console.error('Error loading organizations:', error);
    }
  };
  const loadContacts = async (organizationId?: string) => {
    try {
      // Load organization contacts
      let orgQuery = supabase.from('organization_contacts').select('id, full_name').eq('is_active', true);
      if (organizationId) {
        orgQuery = orgQuery.eq('organization_id', organizationId);
      }
      const {
        data: orgData,
        error: orgError
      } = await orgQuery.order('full_name');
      if (orgError) throw orgError;
      let merged: Contact[] = (orgData || []).map((c: any) => ({
        id: `org:${c.id}`,
        raw_id: c.id,
        full_name: c.full_name,
        source: 'org'
      }));

      // Load personal contacts for this organization by matching company name
      if (organizationId && user) {
        const orgName = organizations.find(o => o.id === organizationId)?.name;
        if (orgName) {
          const {
            data: personalData,
            error: personalError
          } = await supabase.from('contacts').select('id, name, email, phone').eq('company', orgName).eq('user_id', user.id).order('name');
          if (personalError) throw personalError;
          const personalMapped: Contact[] = (personalData || []).map((p: any) => ({
            id: `ctc:${p.id}`,
            raw_id: p.id,
            full_name: p.name,
            source: 'ctc',
            email: p.email,
            phone: p.phone
          }));
          merged = [...merged, ...personalMapped];
        }
      }
      setContacts(merged);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };
  const loadOpportunities = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('opportunities').select('id, name').eq('owner_id', user?.id).eq('status', 'open').order('name');
      if (error) throw error;
      setOpportunities(data || []);
    } catch (error) {
      console.error('Error loading opportunities:', error);
    }
  };
  const getActivityIcon = (type: string) => {
    switch (type) {
      case "call":
        return Phone;
      case "meeting_online":
        return Video;
      case "visit":
        return MapPin;
      case "go_show":
        return TrendingUp;
      default:
        return Phone;
    }
  };
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return CheckCircle;
      case "canceled":
        return XCircle;
      case "scheduled":
      default:
        return Clock;
    }
  };
  const getActivityBadgeColor = (type: string) => {
    const variants = {
      call: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100",
      meeting_online: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100",
      visit: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
      go_show: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
    };
    return variants[type as keyof typeof variants] || variants.call;
  };
  const getStatusBadgeColor = (status: string) => {
    const variants = {
      scheduled: "bg-amber-50 text-amber-700 border-amber-200",
      done: "bg-emerald-50 text-emerald-700 border-emerald-200",
      canceled: "bg-red-50 text-red-700 border-red-200"
    };
    return variants[status as keyof typeof variants] || variants.scheduled;
  };

  // Calculate weekly activities
  const thisWeekStart = startOfWeek(new Date());
  const thisWeekEnd = endOfWeek(new Date());
  const thisWeekActivities = activities.filter(activity => isWithinInterval(new Date(activity.scheduled_at), {
    start: thisWeekStart,
    end: thisWeekEnd
  }));
  const filteredActivities = activities.filter(activity => {
    const matchesSearch = activity.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) || activity.notes?.toLowerCase().includes(searchQuery.toLowerCase()) || activity.pic_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTypeFilter = filterType === "all" || activity.activity_type === filterType;
    const matchesStatusFilter = filterStatus === "all" || activity.status === filterStatus;
    let matchesDateFilter = true;
    if (dateFilter === "today") {
      matchesDateFilter = format(new Date(activity.scheduled_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
    } else if (dateFilter === "week") {
      matchesDateFilter = isWithinInterval(new Date(activity.scheduled_at), {
        start: thisWeekStart,
        end: thisWeekEnd
      });
    }
    return matchesSearch && matchesTypeFilter && matchesStatusFilter && matchesDateFilter;
  });
  const handleSaveActivity = async () => {
    if (!newActivity.customer_id || !newActivity.scheduled_at || !selectedContactRef || selectedContactRef === "none" || !newActivity.opportunity_id || !newActivity.status) {
      toast({
        title: "Error",
        description: "Please fill in all required fields: Customer, Contact Person, Link to Opportunity, Status, and Scheduled Date & Time.",
        variant: "destructive"
      });
      return;
    }
    try {
      // Resolve selected contact to organization_contacts.pic_id
      let picIdToUse: string | null = null;
      if (selectedContactRef && selectedContactRef !== "none") {
        if (selectedContactRef.startsWith("org:")) {
          picIdToUse = selectedContactRef.replace("org:", "");
        } else if (selectedContactRef.startsWith("ctc:")) {
          const selected = contacts.find(c => c.id === selectedContactRef);
          if (selected && newActivity.customer_id) {
            const {
              data: existing,
              error: existErr
            } = await supabase.from('organization_contacts').select('id').eq('organization_id', newActivity.customer_id).eq('full_name', selected.full_name).maybeSingle();
            if (existErr) throw existErr;
            if (existing?.id) {
              picIdToUse = existing.id;
            } else {
              const {
                data: inserted,
                error: insertErr
              } = await supabase.from('organization_contacts').insert([{
                organization_id: newActivity.customer_id,
                full_name: selected.full_name,
                email: selected.email || null,
                phone: selected.phone || null,
                is_primary: false,
                is_active: true,
                created_by: user!.id
              }]).select('id').single();
              if (insertErr) throw insertErr;
              picIdToUse = inserted.id;
            }
          }
        }
      }
      const activityData = {
        activity_type: newActivity.activity_type!,
        customer_id: newActivity.customer_id!,
        pic_id: picIdToUse,
        opportunity_id: newActivity.opportunity_id || null,
        new_opportunity_name: newActivity.new_opportunity_name || null,
        scheduled_at: newActivity.scheduled_at!,
        status: newActivity.status!,
        notes: newActivity.notes || null,
        created_by: user!.id
      };

      // Get customer name for calendar event
      const {
        data: customerData
      } = await supabase.from('organizations').select('name').eq('id', newActivity.customer_id!).single();
      const customerName = customerData?.name || 'Unknown Customer';

      // Create calendar event data
      const activityTypeLabel = newActivity.activity_type === "call" ? "Call" : newActivity.activity_type === "meeting_online" ? "Online Meeting" : newActivity.activity_type === "visit" ? "Visit" : newActivity.activity_type === "go_show" ? "Go Show" : newActivity.activity_type;
      const eventTitle = `${activityTypeLabel} - ${customerName}`;
      const eventDescription = [`Activity: ${activityTypeLabel}`, `Customer: ${customerName}`, newActivity.notes && `Notes: ${newActivity.notes}`].filter(Boolean).join('\n');
      if (editingActivity) {
        const {
          error
        } = await supabase.from('sales_activity_v2').update(activityData).eq('id', editingActivity.id);
        if (error) throw error;

        toast({
          title: "Success",
          description: "Activity updated successfully!"
        });
      } else {
        const {
          error
        } = await supabase.from('sales_activity_v2').insert([activityData]);
        if (error) throw error;

        toast({
          title: "Success",
          description: "Activity created and added to calendar!"
        });
      }
      resetForm();
      loadActivities();
    } catch (error) {
      console.error('Error saving activity:', error);
      toast({
        title: "Error",
        description: "Failed to save activity.",
        variant: "destructive"
      });
    }
  };
  const handleDeleteActivity = async (id: string) => {
    try {
      const {
        error
      } = await supabase.from('sales_activity_v2').delete().eq('id', id);
      if (error) throw error;

      toast({
        title: "Success",
        description: "Activity deleted successfully!"
      });
      loadActivities();
    } catch (error) {
      console.error('Error deleting activity:', error);
      toast({
        title: "Error",
        description: "Failed to delete activity.",
        variant: "destructive"
      });
    }
  };
  const handleEditActivity = (activity: SalesActivity) => {
    setEditingActivity(activity);
    setNewActivity({
      activity_type: activity.activity_type,
      customer_id: activity.customer_id,
      pic_id: activity.pic_id,
      opportunity_id: activity.opportunity_id,
      new_opportunity_name: activity.new_opportunity_name,
      scheduled_at: activity.scheduled_at,
      status: activity.status,
      notes: activity.notes
    });
    setSelectedContactRef(activity.pic_id ? `org:${activity.pic_id}` : "none");
    loadContacts(activity.customer_id);
    setIsAddActivityOpen(true);
  };
  const handleUpdateStatus = async (id: string, newStatus: "scheduled" | "done" | "canceled") => {
    try {
      // If marking a visit as done, check if MOM is provided
      if (newStatus === "done") {
        const activity = activities.find(a => a.id === id);
        if (activity?.activity_type === "visit" && !activity.mom_text?.trim()) {
          toast({
            title: "Minutes of Meeting Required",
            description: "Please add Minutes of Meeting before marking the visit as done.",
            variant: "destructive"
          });
          // Automatically open MOM editor
          setEditingMom({
            id: activity.id,
            mom_text: ""
          });
          return;
        }
      }
      const {
        error
      } = await supabase.from('sales_activity_v2').update({
        status: newStatus
      }).eq('id', id);
      if (error) throw error;
      toast({
        title: "Success",
        description: `Activity marked as ${newStatus}!`
      });
      loadActivities();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Error",
        description: "Failed to update activity status.",
        variant: "destructive"
      });
    }
  };
  const handleEditMom = (activity: SalesActivity) => {
    setEditingMom({
      id: activity.id,
      mom_text: activity.mom_text || ""
    });
  };
  const handleSaveMom = async () => {
    if (!editingMom) return;
    try {
      const {
        error
      } = await supabase.from('sales_activity_v2').update({
        mom_text: editingMom.mom_text,
        mom_added_at: new Date().toISOString()
      }).eq('id', editingMom.id);
      if (error) throw error;
      setEditingMom(null);
      toast({
        title: "Success",
        description: "Minutes of Meeting updated successfully!"
      });
      loadActivities();
    } catch (error) {
      console.error('Error updating MOM:', error);
      toast({
        title: "Error",
        description: "Failed to update Minutes of Meeting.",
        variant: "destructive"
      });
    }
  };
  const handleCancelEditMom = () => {
    setEditingMom(null);
  };
  const resetForm = () => {
    setNewActivity({
      activity_type: "call",
      customer_id: "",
      scheduled_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      status: "scheduled",
      notes: ""
    });
    setSelectedContactRef("none");
    setEditingActivity(null);
    setIsAddActivityOpen(false);
  };
  const getActivityTypeLabel = (type: string) => {
    switch (type) {
      case "call":
        return "Call";
      case "meeting_online":
        return "Online Meeting";
      case "visit":
        return "Visit";
      case "go_show":
        return "Go Show";
      default:
        return type;
    }
  };
  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading activities...</div>;
  }
  return <div className="space-y-6">
      {/* Header with Weekly Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Badge className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {thisWeekActivities.length} this week
          </Badge>
        </div>
        
        <Dialog open={isAddActivityOpen} onOpenChange={setIsAddActivityOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" />
              Add Activity
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingActivity ? "Edit Activity" : "Add New Activity"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="activity-type">Activity Type *</Label>
                <Select value={newActivity.activity_type} onValueChange={value => setNewActivity({
                ...newActivity,
                activity_type: value as SalesActivity["activity_type"]
              })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">📞 Call</SelectItem>
                    <SelectItem value="meeting_online">💻 Online Meeting</SelectItem>
                    <SelectItem value="visit">🏢 Visit</SelectItem>
                    <SelectItem value="go_show">📈 Go Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="customer">Customer *</Label>
                <Select value={newActivity.customer_id} onValueChange={value => {
                setNewActivity({
                  ...newActivity,
                  customer_id: value,
                  pic_id: undefined
                });
                setSelectedContactRef("none");
                loadContacts(value);
              }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.filter(org => org.id && org.id.trim() !== '').map(org => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="contact">Contact Person *</Label>
                <Select value={selectedContactRef || "none"} onValueChange={value => setSelectedContactRef(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contact person" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No contact selected</SelectItem>
                    {contacts.filter(contact => contact.id && contact.id.trim() !== '').map(contact => <SelectItem key={contact.id} value={contact.id}>{contact.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="opportunity">Link to Opportunity *</Label>
                <Select value={newActivity.opportunity_id || "none"} onValueChange={value => setNewActivity({
                ...newActivity,
                opportunity_id: value === "none" ? undefined : value
              })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select opportunity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No opportunity selected</SelectItem>
                    {opportunities.filter(opp => opp.id && opp.id.trim() !== '').map(opp => <SelectItem key={opp.id} value={opp.id}>{opp.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                
                
              </div>
              
              <div>
                <Label htmlFor="scheduled-at">Scheduled Date & Time *</Label>
                <Input id="scheduled-at" type="datetime-local" value={newActivity.scheduled_at} onChange={e => setNewActivity({
                ...newActivity,
                scheduled_at: e.target.value
              })} />
              </div>

              <div>
                <Label htmlFor="status">Status *</Label>
                <Select value={newActivity.status} onValueChange={value => setNewActivity({
                ...newActivity,
                status: value as SalesActivity["status"]
              })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">⏰ Scheduled</SelectItem>
                    <SelectItem value="done">✅ Done</SelectItem>
                    <SelectItem value="canceled">❌ Canceled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={newActivity.notes || ""} onChange={e => setNewActivity({
                ...newActivity,
                notes: e.target.value
              })} placeholder="Add notes about the activity..." rows={3} />
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button onClick={handleSaveActivity} className="bg-primary hover:bg-primary/90">
                  {editingActivity ? "Update Activity" : "Save Activity"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input placeholder="Search activities..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            
            <div className="flex gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="call">📞 Call</SelectItem>
                  <SelectItem value="meeting_online">💻 Online Meeting</SelectItem>
                  <SelectItem value="visit">🏢 Visit</SelectItem>
                  <SelectItem value="go_show">📈 Go Show</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Status filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="scheduled">⏰ Scheduled</SelectItem>
                  <SelectItem value="done">✅ Done</SelectItem>
                  <SelectItem value="canceled">❌ Canceled</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Date filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activities List */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Activities ({filteredActivities.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredActivities.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                No activities found. {searchQuery || filterType !== "all" || filterStatus !== "all" || dateFilter !== "all" ? "Try adjusting your filters." : "Add your first activity!"}
              </div> : filteredActivities.map(activity => {
            const ActivityIcon = getActivityIcon(activity.activity_type);
            const StatusIcon = getStatusIcon(activity.status);
            return <div key={activity.id} className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <ActivityIcon className="h-4 w-4" />
                            <Badge className={`${getActivityBadgeColor(activity.activity_type)} border`}>
                              {getActivityTypeLabel(activity.activity_type)}
                            </Badge>
                            <Badge className={`${getStatusBadgeColor(activity.status)} border`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {activity.status}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <h4 className="font-medium text-foreground">{activity.customer_name}</h4>
                          {activity.pic_name && <p className="text-sm text-muted-foreground">Contact: {activity.pic_name}</p>}
                          {activity.opportunity_name && <p className="text-sm text-muted-foreground">Opportunity: {activity.opportunity_name}</p>}
                          {activity.new_opportunity_name && <p className="text-sm text-muted-foreground">New Opportunity: {activity.new_opportunity_name}</p>}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{format(new Date(activity.scheduled_at), "MMM d, yyyy 'at' HH:mm")}</span>
                        </div>
                        
                        {activity.notes && <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                            {activity.notes}
                          </p>}

                        {/* MOM Section for Visits */}
                        {activity.activity_type === "visit" && <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium">Minutes of Meeting</Label>
                              {activity.status === "done" && !editingMom && <Button variant="outline" size="sm" onClick={() => handleEditMom(activity)}>
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit MOM
                                </Button>}
                            </div>
                            
                            {editingMom && editingMom.id === activity.id ? <div className="space-y-2">
                                <Textarea value={editingMom.mom_text} onChange={e => setEditingMom({
                        ...editingMom,
                        mom_text: e.target.value
                      })} placeholder="Enter minutes of meeting..." rows={3} />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={handleSaveMom}>
                                    <Check className="h-3 w-3 mr-1" />
                                    Save
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={handleCancelEditMom}>
                                    <X className="h-3 w-3 mr-1" />
                                    Cancel
                                  </Button>
                                </div>
                              </div> : <div className="text-sm bg-muted/50 rounded p-2">
                                {activity.mom_text || "No minutes of meeting recorded yet."}
                                {activity.mom_added_at && <div className="text-xs text-muted-foreground mt-1">
                                    Updated: {format(new Date(activity.mom_added_at), "MMM d, yyyy 'at' HH:mm")}
                                  </div>}
                              </div>}
                          </div>}
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        {activity.status === "scheduled" && <>
                            <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(activity.id, "done")}>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Done
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(activity.id, "canceled")}>
                              <XCircle className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                          </>}
                        <Button variant="outline" size="sm" onClick={() => handleEditActivity(activity)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteActivity(activity.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>;
          })}
          </div>
        </CardContent>
      </Card>
    </div>;
}