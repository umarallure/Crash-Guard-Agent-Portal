import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar, Filter, LogOut, Phone, User, DollarSign, Send, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCenterUser } from '@/hooks/useCenterUser';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { CallbackRequestForm } from '@/components/CallbackRequestForm';
import { CenterCreateLeadModal } from '@/components/CenterCreateLeadModal';
import { PresetDateRangeFilter } from '@/components/PresetDateRangeFilter';
import { isDateInRange, type DateRangePreset } from '@/lib/dateRangeFilter';

type Lead = {
  id: string;
  submission_id: string;
  customer_full_name: string | null;
  phone_number: string | null;
  carrier: string | null;
  monthly_premium: number | null;
  coverage_amount: number | null;
  state: string | null;
  created_at: string;
  submission_date: string | null;
};

const CenterLeadPortal = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const { centerInfo, leadVendor, loading: centerLoading } = useCenterUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [createLeadModalOpen, setCreateLeadModalOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !centerLoading && (!user || !centerInfo)) {
      navigate('/center-auth');
    }
  }, [user, centerInfo, authLoading, centerLoading, navigate]);

  useEffect(() => {
    if (centerInfo && leadVendor) {
      fetchLeads();
    }
  }, [centerInfo, leadVendor]);

  useEffect(() => {
    applyFilters();
    setCurrentPage(1); // Reset to first page when filters change
  }, [leads, datePreset, customStartDate, customEndDate, nameFilter]);

  const fetchLeads = async () => {
    if (!leadVendor) return;

    try {
      // Get leads for this center's vendor with only the required fields
      const { data: leadsData, error: leadsError } = await supabase
        .from('leads')
        .select('id, submission_id, customer_full_name, phone_number, carrier, monthly_premium, coverage_amount, state, created_at, submission_date')
        .eq('is_active', true)
        .eq('lead_vendor', leadVendor)
        .order('created_at', { ascending: false });

      if (leadsError) throw leadsError;

      setLeads(leadsData || []);
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

  const applyFilters = () => {
    let filtered = leads;

    filtered = filtered.filter((lead) =>
      isDateInRange(lead.submission_date || lead.created_at, datePreset, customStartDate, customEndDate)
    );

    if (nameFilter) {
      filtered = filtered.filter(lead =>
        lead.customer_full_name?.toLowerCase().includes(nameFilter.toLowerCase())
      );
    }

    setFilteredLeads(filtered);
  };

  const getLeadStatus = (lead: Lead) => {
    return 'Available';
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/center-auth');
  };

  const handleSendCallback = (lead: Lead) => {
    console.log('[DEBUG] Send Callback clicked for lead:', lead.submission_id);
    const url = `/center-callback-request?submissionId=${lead.submission_id}`;
    console.log('[DEBUG] Navigating to:', url);
    navigate(url);
  };

  const handleLeadCreated = () => {
    fetchLeads(); // Refresh the leads list
    toast({
      title: "Success",
      description: "Lead has been created and added to your portal.",
    });
  };

  // Pagination functions
  const getPaginatedLeads = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredLeads.slice(startIndex, endIndex);
  };

  const getTotalPages = () => {
    return Math.ceil(filteredLeads.length / itemsPerPage);
  };

  const handlePageChange = (page: number) => {
    const total = getTotalPages();
    if (page < 1) page = 1;
    if (page > total) page = total;
    setCurrentPage(page);
  };

  const paginatedLeads = getPaginatedLeads();
  const totalPages = getTotalPages();

  if (authLoading || centerLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading your dashboard...</p>
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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Active Leads</span>
              </div>
              <p className="text-2xl font-bold">{leads.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">This Week</span>
              </div>
              <p className="text-2xl font-bold">
                {leads.filter(l => {
                  const weekAgo = new Date();
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return l.created_at && new Date(l.created_at) > weekAgo;
                }).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Phone className="h-4 w-4 text-purple-500" />
                <span className="text-sm text-muted-foreground">Recent Leads</span>
              </div>
              <p className="text-2xl font-bold">
                {leads.filter(l => {
                  const weekAgo = new Date();
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return l.created_at && new Date(l.created_at) > weekAgo;
                }).length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Filters</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date-filter">Date</Label>
                <PresetDateRangeFilter
                  preset={datePreset}
                  onPresetChange={setDatePreset}
                  customStartDate={customStartDate}
                  customEndDate={customEndDate}
                  onCustomStartDateChange={setCustomStartDate}
                  onCustomEndDateChange={setCustomEndDate}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name-filter">Customer Name</Label>
                <Input
                  id="name-filter"
                  type="text"
                  placeholder="Search by name..."
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leads List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Your Leads ({filteredLeads.length})</h2>
            <div className="flex items-center space-x-4">
              {totalPages > 1 && (
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </div>
              )}
              <Button 
                variant="outline"
                onClick={() => navigate('/center-calendar-view')}
              >
                <Calendar className="mr-2 h-4 w-4" />
                Calendar View
              </Button>
              <Button 
                onClick={() => setCreateLeadModalOpen(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Lead
              </Button>
            </div>
          </div>

          {filteredLeads.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No leads found matching your filters.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {paginatedLeads.map((lead) => (
                <Card key={lead.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-semibold">{lead.customer_full_name}</h3>
                          <Badge className="bg-blue-500 text-white">
                            {getLeadStatus(lead)}
                          </Badge>
                        </div>

                        {/* Basic Lead Info */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Phone:</span> {lead.phone_number || 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium">Coverage:</span> ${lead.coverage_amount?.toLocaleString() || 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium">Premium:</span> ${lead.monthly_premium?.toLocaleString() || 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium">Date:</span>{' '}
                            {lead.created_at ? format(new Date(lead.created_at), 'MMM dd, yyyy') : 'N/A'}
                          </div>
                        </div>

                        {/* Additional Lead Info */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Carrier:</span> {lead.carrier || 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium">State:</span> {lead.state || 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium">Submission Date:</span>{' '}
                            {lead.submission_date ? format(new Date(lead.submission_date), 'MMM dd, yyyy') : 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium">Created:</span>{' '}
                            {lead.created_at ? format(new Date(lead.created_at), 'MMM dd, yyyy') : 'N/A'}
                          </div>
                        </div>

                        {/* Action Button */}
                        <div className="flex justify-end pt-2">
                          <Button 
                            onClick={() => handleSendCallback(lead)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Send Callback
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredLeads.length)} of {filteredLeads.length} entries
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {/* Compact page list: show first, last, current +/- neighbors with ellipses */}
                      {(() => {
                        const maxButtons = 7; // total buttons to show including first/last
                        const total = totalPages;
                        const current = currentPage;
                        const pages: Array<number | string> = [];

                        if (total <= maxButtons) {
                          for (let i = 1; i <= total; i++) pages.push(i);
                        } else {
                          const side = 1; // neighbors on each side of current
                          const left = Math.max(2, current - side);
                          const right = Math.min(total - 1, current + side);

                          pages.push(1);
                          if (left > 2) pages.push('left-ellipsis');

                          for (let p = left; p <= right; p++) pages.push(p);

                          if (right < total - 1) pages.push('right-ellipsis');
                          pages.push(total);
                        }

                        return pages.map((p, idx) => {
                          if (typeof p === 'string') {
                            return (
                              <span key={p + idx} className="px-2 text-sm text-muted-foreground">…</span>
                            );
                          }

                          return (
                            <Button
                              key={p}
                              variant={current === p ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handlePageChange(Number(p))}
                              className="w-8 h-8 p-0"
                            >
                              {p}
                            </Button>
                          );
                        });
                      })()}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Lead Modal */}
      {leadVendor && (
        <CenterCreateLeadModal
          open={createLeadModalOpen}
          onClose={() => setCreateLeadModalOpen(false)}
          onLeadCreated={handleLeadCreated}
          leadVendor={leadVendor}
        />
      )}

      {/* Callback Request Form Dialog - Removed, now using separate page */}
    </div>
  );
};

export default CenterLeadPortal;
