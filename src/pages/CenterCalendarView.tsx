import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCenterUser } from '@/hooks/useCenterUser';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, User, Phone, DollarSign, Edit } from 'lucide-react';
import { CenterCalendarComponent } from '@/components/CenterCalendarComponent';
import { PlacementStatusModal } from '@/components/PlacementStatusModal';

type Lead = {
  id: string;
  submission_id: string;
  customer_full_name: string | null;
  phone_number: string | null;
  carrier: string | null;
  monthly_premium: number | null;
  coverage_amount: number | null;
  face_amount?: number | null;
  state: string | null;
  created_at: string;
  draft_date: string | null;
  submission_date: string | null;
  status?: string | null;
  placement_status?: string | null;
};

const carrierOptions = [
  "All Carriers",
  "Liberty",
  "SBLI",
  "Corebridge",
  "MOH",
  "Transamerica",
  "RNA",
  "AMAM",
  "GTL",
  "Aetna",
  "Americo",
  "CICA",
  "N/A"
];

const placementStatusOptions = [
  "All Statuses",
  "Good Standing",
  "Not Placed",
  "Pending Failed Payment Fix",
  "FDPF Pending Reason",
  "FDPF Insufficient Funds",
  "FDPF Incorrect Banking Info",
  "FDPF Unauthorized Draft"
];

const CenterCalendarView = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const { centerInfo, leadVendor, loading: centerLoading } = useCenterUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCarrier, setSelectedCarrier] = useState<string>("All Carriers");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  useEffect(() => {
    console.log('[CenterCalendarView] Auth/Center check:', {
      authLoading,
      centerLoading,
      hasUser: !!user,
      hasCenterInfo: !!centerInfo,
      leadVendor
    });
    if (!authLoading && !centerLoading && (!user || !centerInfo)) {
      console.log('[CenterCalendarView] Redirecting to center-auth');
      navigate('/center-auth');
    }
  }, [user, centerInfo, authLoading, centerLoading, navigate]);

  useEffect(() => {
    if (centerInfo && leadVendor) {
      fetchLeads();
    }
  }, [centerInfo, leadVendor]);

  useEffect(() => {
    if (selectedDate) {
      filterLeadsByDate(selectedDate);
    }
  }, [selectedDate, leads, selectedCarrier]);

  const fetchLeads = async () => {
    if (!leadVendor) return;

    try {
      const { data: leadsData, error: leadsError } = await supabase
        .from('leads')
        .select('id, submission_id, customer_full_name, phone_number, carrier, monthly_premium, coverage_amount, state, created_at, draft_date, submission_date')
        .eq('is_active', true)
        .eq('lead_vendor', leadVendor)
        .order('draft_date', { ascending: false });

      if (leadsError) throw leadsError;

      // Get status, face_amount, and draft_date from daily_deal_flow for each lead
      const leadsWithStatus = await Promise.all(
        (leadsData || []).map(async (lead) => {
          const { data: dealFlowData } = await supabase
            .from('daily_deal_flow')
            .select('status, draft_date, face_amount, carrier, placement_status')
            .eq('submission_id', lead.submission_id)
            .maybeSingle();

          return {
            ...lead,
            status: dealFlowData?.status || null,
            // Use draft_date from daily_deal_flow if available, otherwise use leads table
            draft_date: dealFlowData?.draft_date || lead.draft_date,
            // Use face_amount from daily_deal_flow if available, otherwise use coverage_amount from leads
            face_amount: dealFlowData?.face_amount || null,
            // Use carrier from daily_deal_flow if available, otherwise use leads table
            carrier: dealFlowData?.carrier || lead.carrier,
            // Get placement_status from daily_deal_flow
            placement_status: dealFlowData?.placement_status || null,
          };
        })
      );

      setLeads(leadsWithStatus);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast({
        title: "Error fetching leads",
        description: "Unable to load your leads. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterLeadsByDate = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    const filtered = leads.filter(lead => {
      if (!lead.draft_date) return false;
      try {
        // Parse date string directly without timezone conversion
        let leadDraftDate: string;
        if (typeof lead.draft_date === 'string' && lead.draft_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Already in YYYY-MM-DD format, use directly
          leadDraftDate = lead.draft_date;
        } else {
          // Parse and format
          leadDraftDate = format(new Date(lead.draft_date), 'yyyy-MM-dd');
        }
        const matchesDate = leadDraftDate === dateString;
        
        // Apply carrier filter
        if (selectedCarrier === "All Carriers") {
          return matchesDate;
        }
        return matchesDate && lead.carrier === selectedCarrier;
      } catch (error) {
        // Skip leads with invalid draft_date
        return false;
      }
    });
    setFilteredLeads(filtered);
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
  };

  const handleSendCallback = (lead: Lead) => {
    navigate(`/center-callback-request?submissionId=${lead.submission_id}`);
  };

  const handleEditPlacementStatus = (lead: Lead) => {
    setSelectedLead(lead);
    setModalOpen(true);
  };

  const handleSavePlacementStatus = async (newStatus: string) => {
    if (!selectedLead) return;

    try {
      const { error } = await supabase
        .from('daily_deal_flow')
        .update({ placement_status: newStatus })
        .eq('submission_id', selectedLead.submission_id);

      if (error) throw error;

      toast({
        title: "Status Updated",
        description: "Placement status has been updated successfully.",
      });

      // Refresh leads to show updated status
      fetchLeads();
    } catch (error) {
      console.error('Error updating placement status:', error);
      toast({
        title: "Error",
        description: "Failed to update placement status. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getLeadCountForDate = (date: Date): number => {
    const dateString = format(date, 'yyyy-MM-dd');
    return leads.filter(lead => {
      if (!lead.draft_date) return false;
      try {
        // Parse date string directly without timezone conversion
        let leadDraftDate: string;
        if (typeof lead.draft_date === 'string' && lead.draft_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Already in YYYY-MM-DD format, use directly
          leadDraftDate = lead.draft_date;
        } else {
          // Parse and format
          leadDraftDate = format(new Date(lead.draft_date), 'yyyy-MM-dd');
        }
        return leadDraftDate === dateString;
      } catch (error) {
        // Skip leads with invalid draft_date
        return false;
      }
    }).length;
  };

  if (authLoading || centerLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading calendar...</p>
        </div>
      </div>
    );
  }

  if (!centerInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Access denied. Center user authentication required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Center Info Badge */}
        <div className="mb-6">
          <Badge variant="outline" className="flex items-center space-x-2 w-fit px-4 py-2">
            <User className="h-4 w-4" />
            <span className="font-medium">{centerInfo.center_name}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{leadVendor}</span>
          </Badge>
        </div>

        {/* Main Layout: Calendar + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Section - Left/Main */}
          <div className="lg:col-span-2">
            {/* Carrier Filter */}
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <Label htmlFor="carrier-filter">Filter by Carrier</Label>
                  <Select value={selectedCarrier} onValueChange={setSelectedCarrier}>
                    <SelectTrigger id="carrier-filter">
                      <SelectValue placeholder="Select carrier" />
                    </SelectTrigger>
                    <SelectContent>
                      {carrierOptions.map((carrier) => (
                        <SelectItem key={carrier} value={carrier}>
                          {carrier}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5" />
                  <span>Select Draft Date</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CenterCalendarComponent
                  selectedDate={selectedDate}
                  onDateSelect={handleDateSelect}
                  getLeadCountForDate={getLeadCountForDate}
                  leads={leads}
                />
              </CardContent>
            </Card>

            {/* Stats Below Calendar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">Total Leads</span>
                  </div>
                  <p className="text-2xl font-bold">{leads.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">With Draft Date</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {leads.filter(l => l.draft_date).length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-purple-500" />
                    <span className="text-sm text-muted-foreground">Selected Date</span>
                  </div>
                  <p className="text-2xl font-bold">{filteredLeads.length}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sidebar - Right */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedDate ? (
                    <>
                      Leads for {format(selectedDate, 'MMM dd, yyyy')}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({filteredLeads.length})
                      </span>
                    </>
                  ) : (
                    'Select a date'
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[calc(100vh-12rem)] overflow-y-auto">
                {!selectedDate ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Please select a date from the calendar</p>
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No leads scheduled for this date</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredLeads.map((lead) => (
                      <Card key={lead.id} className="border hover:shadow-md transition-shadow">
                        <CardContent className="p-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-sm line-clamp-1">
                                {lead.customer_full_name || 'Unknown'}
                              </h4>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditPlacementStatus(lead)}
                                className="h-7 w-7 p-0"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            <div className="space-y-0.5 text-xs text-muted-foreground">
                              <div className="flex items-center space-x-1">
                                <Phone className="h-3 w-3" />
                                <span>{lead.phone_number || 'N/A'}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <DollarSign className="h-3 w-3" />
                                <span>
                                  ${lead.face_amount?.toLocaleString() || lead.coverage_amount?.toLocaleString() || 'N/A'}
                                </span>
                              </div>
                              {lead.carrier && (
                                <div className="flex items-center space-x-1">
                                  <span className="font-medium">Carrier:</span>
                                  <span>{lead.carrier}</span>
                                </div>
                              )}
                              {lead.state && (
                                <div className="flex items-center space-x-1">
                                  <span className="font-medium">State:</span>
                                  <span>{lead.state}</span>
                                </div>
                              )}
                              {lead.placement_status && (
                                <div className="flex items-center space-x-1">
                                  <Badge 
                                    variant={
                                      lead.placement_status === 'Good Standing' ? 'default' :
                                      lead.placement_status === 'Not Placed' ? 'destructive' :
                                      'secondary'
                                    }
                                    className="text-xs"
                                  >
                                    {lead.placement_status}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Placement Status Modal */}
      {selectedLead && (
        <PlacementStatusModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          currentStatus={selectedLead.placement_status || null}
          leadName={selectedLead.customer_full_name || 'Unknown'}
          onSave={handleSavePlacementStatus}
        />
      )}
    </div>
  );
};

export default CenterCalendarView;
