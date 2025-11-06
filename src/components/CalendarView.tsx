import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, MoreHorizontal, Edit, Trash2, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AddEventModal } from '@/components/modals/AddEventModal';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, parseISO } from 'date-fns';

interface CalendarEvent {
  id: string;
  subject: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  description?: string | null;
  type?: string | null;
  status?: string;
  created_at: string;
}

export const CalendarView: React.FC = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  const fetchEvents = async () => {
    if (!user || !profile) return;

    try {
      setIsLoading(true);
      const startDate = startOfMonth(currentDate);
      const endDate = endOfMonth(currentDate);

      // Determine which user IDs to fetch calendar for
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
          console.error('Error fetching team members for calendar:', err);
        }
      }

      const { data, error } = await supabase
        .from('sales_activity_v2')
        .select('*')
        .in('created_by', userIds)
        .not('scheduled_at', 'is', null)
        .gte('scheduled_at', startDate.toISOString())
        .lte('scheduled_at', endDate.toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) throw error;

      const mappedEvents: CalendarEvent[] = (data || []).map((a: any) => ({
        id: a.id,
        subject: a.subject || (a.activity_type ? String(a.activity_type).replace('_', ' ') : 'Activity'),
        starts_at: a.scheduled_at,
        ends_at: null,
        location: null,
        description: a.description || a.notes || null,
        type: a.activity_type || null,
        status: a.status || undefined,
        created_at: a.created_at || new Date().toISOString()
      }));

      setEvents(mappedEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast({
        title: "Error",
        description: "Failed to load events.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [user, profile, currentDate]);

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from('sales_activities')
        .delete()
        .eq('id', eventId)
        .eq('created_by', user?.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Event deleted successfully!",
      });

      fetchEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: "Error",
        description: "Failed to delete event.",
        variant: "destructive",
      });
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const getEventsForDate = (date: Date) => {
    return events.filter(event => 
      isSameDay(parseISO(event.starts_at), date)
    );
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setIsAddModalOpen(true);
  };

  // Generate calendar days
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Add padding days to make a complete week grid
  const startPadding = monthStart.getDay();
  const endPadding = 6 - monthEnd.getDay();
  
  const paddedDays = [
    ...Array.from({ length: startPadding }, (_, i) => new Date(monthStart.getTime() - (startPadding - i) * 24 * 60 * 60 * 1000)),
    ...calendarDays,
    ...Array.from({ length: endPadding }, (_, i) => new Date(monthEnd.getTime() + (i + 1) * 24 * 60 * 60 * 1000))
  ];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Calendar</CardTitle>
              <CardDescription>
                Manage your events and schedule
              </CardDescription>
            </div>
            <Button onClick={() => setIsAddModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Event
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-semibold">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
            <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Day Headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                {day}
              </div>
            ))}

            {/* Calendar Days */}
            {paddedDays.map((date, index) => {
              const dayEvents = getEventsForDate(date);
              const isCurrentMonth = isSameMonth(date, currentDate);
              const isCurrentDay = isToday(date);

              return (
                <div
                  key={index}
                  className={`min-h-[100px] p-2 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                    !isCurrentMonth ? 'text-muted-foreground bg-muted/20' : ''
                  } ${isCurrentDay ? 'bg-primary/10 border-primary' : ''}`}
                  onClick={() => handleDateClick(date)}
                >
                  <div className={`text-sm font-medium mb-1 ${isCurrentDay ? 'text-primary' : ''}`}>
                    {format(date, 'd')}
                  </div>
                  
                  {/* Events for this day */}
                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className="group relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-xs p-1 bg-primary/20 text-primary rounded truncate">
                          <div className="flex items-center justify-between">
                            <span className="truncate">
                              {format(parseISO(event.starts_at), 'HH:mm')} {event.subject}
                            </span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Edit className="mr-2 h-3 w-3" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleDeleteEvent(event.id)}
                                >
                                  <Trash2 className="mr-2 h-3 w-3" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          {event.location && (
                            <div className="flex items-center mt-1 text-xs opacity-75">
                              <MapPin className="h-2 w-2 mr-1" />
                              <span className="truncate">{event.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-muted-foreground">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Today's Events */}
      {events.filter(event => isToday(parseISO(event.starts_at))).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today's Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {events
                .filter(event => isToday(parseISO(event.starts_at)))
                .map((event) => (
                  <div key={event.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">
                          <Clock className="h-3 w-3 mr-1" />
                          {format(parseISO(event.starts_at), 'HH:mm')}
                        </Badge>
                        <h4 className="font-medium">{event.subject}</h4>
                        {event.type && (
                          <Badge variant="secondary">{event.type}</Badge>
                        )}
                      </div>
                      {event.location && (
                        <div className="flex items-center mt-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3 mr-1" />
                          {event.location}
                        </div>
                      )}
                      {event.description && (
                        <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDeleteEvent(event.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AddEventModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setSelectedDate(undefined);
        }}
        onEventAdded={fetchEvents}
        selectedDate={selectedDate}
      />
    </div>
  );
};