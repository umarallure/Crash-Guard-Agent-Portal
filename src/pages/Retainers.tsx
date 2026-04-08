import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Filter, Phone, User, Eye, Clock, UserPlus, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isRestrictedUser } from '@/lib/userPermissions';
import { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ClaimDroppedCallModal } from '@/components/ClaimDroppedCallModal';
import { ClaimLicensedAgentModal } from '@/components/ClaimLicensedAgentModal';
import { logCallUpdate, getLeadInfo } from '@/lib/callLogging';
import { getTodayDateEST } from '@/lib/dateUtils';
import { PresetDateRangeFilter } from '@/components/PresetDateRangeFilter';
import { isDateInRange, type DateRangePreset } from '@/lib/dateRangeFilter';

type Lead = Database['public']['Tables']['leads']['Row'];
type CallResult = Database['public']['Tables']['call_results']['Row'];
type VerificationSession = Database['public']['Tables']['verification_sessions']['Row'];

interface LeadWithCallResult extends Lead {
  call_results: CallResult[];
  verification_sessions?: VerificationSession[];
}

const Retainers = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadWithCallResult[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<LeadWithCallResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  // Track which lead cards are expanded (show accident details)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [vendorOptions, setVendorOptions] = useState<string[]>(['all']);
  const [nameFilter, setNameFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [viewLeadLoadingId, setViewLeadLoadingId] = useState<string | null>(null);
  
  // No analytics: we only query the leads table
  
  const isBen = user?.id === '424f4ea8-1b8c-4c0f-bc13-3ea699900c79';
  const isAuthorizedUser = user?.id === '424f4ea8-1b8c-4c0f-bc13-3ea699900c79' || user?.id === '9c004d97-b5fb-4ed6-805e-e2c383fe8b6f' || user?.id === 'c2f07638-d3d2-4fe9-9a65-f57395745695' || user?.id === '30b23a3f-df6b-40af-85d1-84d3e6f0b8b4' || user?.id === 'd68d18e4-9deb-4282-b4d0-1e6e6a0789e9';

  // Claim call modal state
  const [modalType, setModalType] = useState<'dropped' | 'licensed' | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimSessionId, setClaimSessionId] = useState<string | null>(null);
  const [claimSubmissionId, setClaimSubmissionId] = useState<string | null>(null);
  const [claimLicensedAgent, setClaimLicensedAgent] = useState<string>("");
  const [claimIsRetentionCall, setClaimIsRetentionCall] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimLead, setClaimLead] = useState<any>(null);
  const [licensedAgents, setLicensedAgents] = useState<any[]>([]);
  const [fetchingAgents, setFetchingAgents] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
    
    if (!loading && user && isRestrictedUser(user.id)) {
      navigate('/daily-deal-flow');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchLeads();
      fetchVendors();
    }
  }, [user]);

  const handleViewLead = async (lead: LeadWithCallResult) => {
    const submissionId = (lead?.submission_id || '').trim();
    const leadId = (lead?.id || '').trim();
    if (!submissionId || !leadId) return;
    setViewLeadLoadingId(submissionId);

    try {
      const { data: session, error } = await supabase
        .from('verification_sessions')
        .select('id, status, created_at')
        .eq('submission_id', submissionId)
        .in('status', ['pending', 'in_progress', 'ready_for_transfer', 'transferred', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (session?.id) {
        navigate(`/call-result-update?submissionId=${encodeURIComponent(submissionId)}`);
        return;
      }

      navigate(`/leads/${encodeURIComponent(leadId)}`);
    } catch (e) {
      console.error('Error resolving View Lead route:', e);
      toast({
        title: 'Error',
        description: 'Unable to open lead right now. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setViewLeadLoadingId(null);
    }
  };

  const fetchVendors = async () => {
    try {
      // centers table isn't in generated types; use a narrow typed wrapper
      const supabaseCenters = supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (col: string, val: unknown) => {
              not: (col: string, op: string, val: unknown) => Promise<{
                data: { lead_vendor: string | null }[] | null;
                error: unknown;
              }>;
            };
          };
        };
      };

      const { data, error } = await supabaseCenters
        .from('centers')
        .select('lead_vendor')
        .eq('is_active', true)
        .not('lead_vendor', 'is', null);

      if (error) throw error;

      const vendors = new Set<string>();
      const rows = (Array.isArray(data) ? data : []) as { lead_vendor: string | null }[];
      rows.forEach((row) => {
        const vendor = (row.lead_vendor || '').trim();
        if (vendor) vendors.add(vendor);
      });

      setVendorOptions(['all', ...Array.from(vendors)]);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      // Keep existing options (all) on error to avoid blocking UI
    }
  };

  useEffect(() => {
    applyFilters();
    setCurrentPage(1); 
  }, [leads, datePreset, customStartDate, customEndDate, vendorFilter, nameFilter]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setIsSearching(true);
      fetchLeads(nameFilter.trim() || undefined).finally(() => setIsSearching(false));
      setCurrentPage(1); 
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [nameFilter]);

  const fetchLeads = async (searchTerm?: string) => {
    try {
      // Query only the leads table (no joins)
      let query = supabase
        .from('leads')
        .select(`*`, { count: 'exact' })
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(0, 9999);

      if (searchTerm) {
        const term = `%${searchTerm}%`;
        query = query.or(
          [
            `customer_full_name.ilike.${term}`,
            `phone_number.ilike.${term}`,
            `submission_id.ilike.${term}`,
            `email.ilike.${term}`,
            `lead_vendor.ilike.${term}`,
          ].join(',')
        );
      }

      const { data: leadsData, error: leadsError } = await query;

      if (leadsError) throw leadsError;

      if (!leadsData) {
        setLeads([]);
        setIsLoading(false);
        return;
      }

      // Ensure call_results and verification_sessions are present as arrays for compatibility
      const leadsWithData = leadsData.map(lead => ({
        ...(lead as Lead),
        call_results: [],
        verification_sessions: []
      })) as LeadWithCallResult[];

      setLeads(leadsWithData || []);
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

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // No analytics-related functions

  const applyFilters = () => {
    const searchLower = nameFilter.trim().toLowerCase();

    let filtered = leads;

    filtered = filtered.filter((lead) =>
      isDateInRange(lead.submission_date || lead.created_at, datePreset, customStartDate, customEndDate)
    );

    if (vendorFilter !== 'all') {
      const targetVendor = vendorFilter.toLowerCase();
      filtered = filtered.filter((lead) => (lead.lead_vendor || '').toLowerCase() === targetVendor);
    }

    if (searchLower) {
      filtered = filtered.filter((lead) => {
        return (
          (lead.customer_full_name || '').toLowerCase().includes(searchLower) ||
          (lead.phone_number || '').toLowerCase().includes(searchLower) ||
          (lead.submission_id || '').toLowerCase().includes(searchLower) ||
          (lead.email || '').toLowerCase().includes(searchLower) ||
          (lead.lead_vendor || '').toLowerCase().includes(searchLower)
        );
      });
    }

    setFilteredLeads(filtered);
  };
  const getLeadStatus = (lead: LeadWithCallResult) => {
    if (!lead.call_results || lead.call_results.length === 0) return 'No Result';
    const latestResult = lead.call_results[0];
    
    // Handle application_submitted being boolean or string
    const isSubmitted = Boolean(latestResult.application_submitted);
    
    if (isSubmitted) {
      return 'Submitted';
    }
    
    return latestResult.status || 'Not Submitted';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Submitted': return 'bg-success text-success-foreground';
      case 'No Result': return 'bg-muted text-muted-foreground';
      default: return 'bg-red-500 text-white';
    }
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

  const openClaimModal = async (submissionId: string, agentTypeOverride?: 'licensed') => {
    const { data: existingSession } = await supabase
      .from('verification_sessions')
      .select('id, status, total_fields')
      .eq('submission_id', submissionId)
      .gt('total_fields', 0)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let sessionId = existingSession?.id;

    if (!sessionId) {
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('submission_id', submissionId)
        .single();

      if (leadError || !leadData) {
        toast({
          title: "Error",
          description: "Failed to fetch lead data",
          variant: "destructive",
        });
        return;
      }

      // Create the verification session
      const { data: newSession, error } = await supabase
        .from('verification_sessions')
        .insert({
          submission_id: submissionId,
          status: 'pending',
          progress_percentage: 0,
          total_fields: 0,
          verified_fields: 0
        })
        .select('id')
        .single();

      if (error) {
        toast({
          title: "Error",
          description: "Failed to create verification session",
          variant: "destructive",
        });
        return;
      }
      sessionId = newSession.id;

      const verificationItems = [];
      const leadFields = [
        'accident_date', 'accident_location', 'accident_scenario', 'injuries', 'medical_attention',
        'police_attended', 'insured', 'vehicle_registration', 'insurance_company',
        'third_party_vehicle_registration', 'other_party_admit_fault', 'passengers_count',
        'prior_attorney_involved', 'prior_attorney_details', 'contact_name', 'contact_number',
        'contact_address',
        'lead_vendor', 'customer_full_name', 'street_address', 'beneficiary_information',
        'billing_and_mailing_address_is_the_same', 'date_of_birth', 'age', 'phone_number',
        'social_security', 'driver_license', 'exp', 'existing_coverage',
        'applied_to_life_insurance_last_two_years', 'height', 'weight', 'doctors_name',
        'tobacco_use', 'health_conditions', 'medications', 'insurance_application_details',
        'carrier', 'monthly_premium', 'coverage_amount', 'draft_date', 'first_draft',
        'institution_name', 'beneficiary_routing', 'beneficiary_account', 'account_type',
        'city', 'state', 'zip_code', 'birth_state', 'call_phone_landline', 'additional_notes'
      ];

      for (const field of leadFields) {
        const value = leadData[field as keyof typeof leadData];
        if (value !== null && value !== undefined) {
          verificationItems.push({
            session_id: sessionId, 
            field_name: field,
            original_value: String(value),
            verified_value: String(value),
            is_verified: false,
            is_modified: false
          });
        }
      }

      if (verificationItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('verification_items')
          .insert(verificationItems);

        if (itemsError) {
          console.error('Error creating verification items:', itemsError);
        }

        await supabase
          .from('verification_sessions')
          .update({ total_fields: verificationItems.length })
          .eq('id', sessionId);
      }
    }

    setClaimSessionId(sessionId);
    setClaimSubmissionId(submissionId);
    setClaimModalOpen(true);
    
    // Fetch lead info including retention status
    const { data: lead } = await supabase
      .from('leads')
      .select('lead_vendor, customer_full_name, is_retention_call')
      .eq('submission_id', submissionId)
      .single();
    setClaimLead(lead);
    
    // Initialize retention call toggle based on existing lead status
    setClaimIsRetentionCall(lead?.is_retention_call || false);
    
    if (agentTypeOverride === 'licensed') {
      setModalType('licensed');
    } else {
      setModalType('dropped');
    }

    setClaimLicensedAgent("");
    fetchAgents('licensed');
  };

  // Fetch agents for dropdowns
  type AgentStatusRow = { user_id: string };
  type AppUserRow = { user_id: string; display_name: string | null; email: string | null };
  type AppUsersQueryClient = {
    from: (
      table: "app_users"
    ) => {
      select: (columns: string) => {
        in: (column: "user_id", values: string[]) => Promise<{ data: AppUserRow[] | null }>;
      };
    };
  };

  const fetchAgents = async (type: 'licensed') => {
    setFetchingAgents(true);
    try {
      const { data: agentStatus } = await supabase
        .from('agent_status')
        .select('user_id')
        .eq('agent_type', type);

      const ids = (agentStatus as AgentStatusRow[] | null | undefined)?.map((a) => a.user_id) || [];
      let profiles: Array<{ user_id: string; display_name: string }> = [];

      if (ids.length > 0) {
        const { data: fetchedProfiles } = await (supabase as unknown as AppUsersQueryClient)
          .from('app_users')
          .select('user_id, display_name, email')
          .in('user_id', ids);

        profiles = ((fetchedProfiles || []) as AppUserRow[]).map((u) => ({
          user_id: u.user_id,
          display_name: u.display_name || (u.email ? String(u.email).split('@')[0] : '')
        }));
      }

      setLicensedAgents(profiles);
    } catch (error) {
      console.log(error);
    } finally {
      setFetchingAgents(false);
    }
  };

  const handleClaimCall = async () => {
    setClaimLoading(true);
    try {
      const agentId = claimLicensedAgent;
      if (!agentId) {
        toast({
          title: "Error",
          description: "Please select an agent",
          variant: "destructive",
        });
        return;
      }

      // Update verification session
      const updateFields: any = {
        status: 'in_progress',
        is_retention_call: claimIsRetentionCall
      };
      updateFields.licensed_agent_id = agentId;

      await supabase
        .from('verification_sessions')
        .update(updateFields)
        .eq('id', claimSessionId);

      // Update the lead with retention flag
      await supabase
        .from('leads')
        .update({ is_retention_call: claimIsRetentionCall } as any)
        .eq('submission_id', claimSubmissionId);

      // Log the call claim event
      const agentName = licensedAgents.find(a => a.user_id === agentId)?.display_name || 'Licensed Agent';

      const { customerName, leadVendor } = await getLeadInfo(claimSubmissionId!);
      
      await logCallUpdate({
        submissionId: claimSubmissionId!,
        agentId: agentId,
        agentType: 'licensed',
        agentName: agentName,
        eventType: 'call_claimed',
        eventDetails: {
          verification_session_id: claimSessionId,
          claimed_at: new Date().toISOString(),
          claimed_from_dashboard: true,
          claim_type: 'manual_claim'
        },
        verificationSessionId: claimSessionId!,
        customerName,
        leadVendor,
        isRetentionCall: claimIsRetentionCall
      });

      // Send notification
      await supabase.functions.invoke('center-transfer-notification', {
        body: {
          type: 'reconnected',
          submissionId: claimSubmissionId,
          agentType: 'licensed',
          agentName: agentName,
          leadData: claimLead
        }
      });

      // Store submissionId before clearing state for redirect
      const submissionIdForRedirect = claimSubmissionId;

      setClaimModalOpen(false);
      setClaimSessionId(null);
      setClaimSubmissionId(null);
      setClaimLead(null);
      setClaimLicensedAgent("");
      setClaimIsRetentionCall(false);
      
      toast({
        title: "Success",
        description: `Call claimed by ${agentName}`,
      });
      
      // Refresh leads data
      fetchLeads();
      
      // Auto-redirect to the detailed session page - this will open existing session or create new one
      navigate(`/call-result-update?submissionId=${submissionIdForRedirect}`);
      
    } catch (error) {
      console.error('Error claiming call:', error);
      toast({
        title: "Error",
        description: "Failed to claim call",
        variant: "destructive",
      });
    } finally {
      setClaimLoading(false);
    }
  };

  const paginatedLeads = getPaginatedLeads();
  const totalPages = getTotalPages();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading retainers...</p>
        </div>
      </div>
    );
  }

  if (isLoading && leads.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Filters</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <Label htmlFor="vendor-filter">Vendor</Label>
                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorOptions.map((vendor) => (
                      <SelectItem key={vendor} value={vendor}>
                        {vendor === 'all' ? 'All Vendors' : vendor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name-filter">Search Leads</Label>
                <div className="relative">
                  <Input
                    id="name-filter"
                    type="text"
                    placeholder="Search by name, phone, submission ID, or email..."
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    className="pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isSearching ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    ) : nameFilter ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setNameFilter('')}
                        className="h-6 w-6 p-0 hover:bg-transparent"
                      >
                        <span className="text-muted-foreground hover:text-foreground">✕</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Quick Actions</h3>
                <p className="text-sm text-muted-foreground">Create new callbacks or manage leads</p>
              </div>
              <Button 
                onClick={() => navigate('/new-callback')}
                className="flex items-center space-x-2"
              >
                <Phone className="h-4 w-4" />
                <span>New Callback</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="space-y-6">
            {/* Leads List */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Total Leads</h2>
                {totalPages > 1 && (
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                )}
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
                            <div
                              className="flex items-center space-x-3 cursor-pointer select-none group"
                              onClick={() => toggleExpand(lead.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(lead.id); } }}
                            >
                              <button
                                type="button"
                                className="text-lg font-semibold group-hover:underline text-left"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/leads/${encodeURIComponent(lead.id)}`);
                                }}
                              >
                                {(lead.customer_full_name || 'N/A') + ' - ' + (lead.lead_vendor || 'N/A')}
                              </button>
                              <Badge className={getStatusColor(getLeadStatus(lead))}>
                                {getLeadStatus(lead)}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); toggleExpand(lead.id); }}
                                className="ml-2 flex items-center gap-1"
                                aria-expanded={!!expandedCards[lead.id]}
                                title={expandedCards[lead.id] ? 'Hide details' : 'Show details'}
                              >
                                {expandedCards[lead.id] ? (
                                  <>
                                    <ChevronUp className="h-4 w-4" />
                                    <span className="hidden sm:inline text-sm text-muted-foreground">Hide</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-4 w-4" />
                                    <span className="hidden sm:inline text-sm text-muted-foreground">Accident Details</span>
                                  </>
                                )}
                              </Button>
                            </div>
                            
                            {/* Basic Lead Info (simplified) */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                              <div>
                                <span className="font-medium">Phone:</span> {lead.phone_number || 'N/A'}
                              </div>
                              <div>
                                <span className="font-medium">Email:</span> {lead.email || 'N/A'}
                              </div>
                              <div>
                                <span className="font-medium">City / State:</span> {lead.city || 'N/A'}{lead.city && lead.state ? `, ${lead.state}` : ''}
                              </div>
                              <div>
                                <span className="font-medium">DOB / Age:</span> {lead.date_of_birth ? format(new Date(lead.date_of_birth), 'MMM dd, yyyy') : 'N/A'}{lead.age ? ` (${lead.age})` : ''}
                              </div>
                      
                            </div>

                            {/* Accident / Incident Details (collapsible) */}
                            {expandedCards[lead.id] && (
                              <div className="border-t pt-3">
                                <h4 className="font-medium text-sm mb-2">Accident Details</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                                  <div><span className="font-medium">Accident Date:</span> {lead.accident_date ? format(new Date(lead.accident_date), 'MMM dd, yyyy') : 'N/A'}</div>
                                  <div><span className="font-medium">Location:</span> {lead.accident_location || 'N/A'}</div>
                                  <div className="md:col-span-2"><span className="font-medium">Scenario:</span> {lead.accident_scenario || 'N/A'}</div>
                                  <div><span className="font-medium">Injuries:</span> {lead.injuries || 'N/A'}</div>
                                  <div><span className="font-medium">Medical Attention:</span> {lead.medical_attention || 'N/A'}</div>
                                  <div><span className="font-medium">Police Attended:</span> {lead.police_attended === null ? 'N/A' : (lead.police_attended ? 'Yes' : 'No')}</div>
                                  <div><span className="font-medium">Insured:</span> {lead.insured === null ? 'N/A' : (lead.insured ? 'Yes' : 'No')}</div>
                                  <div><span className="font-medium">Passengers:</span> {lead.passengers_count ?? 'N/A'}</div>
                                  <div><span className="font-medium">Vehicle Reg #:</span> {lead.vehicle_registration || 'N/A'}</div>
                                  <div><span className="font-medium">Insurance Co.:</span> {lead.insurance_company || 'N/A'}</div>
                                  <div><span className="font-medium">Third Party Reg #:</span> {lead.third_party_vehicle_registration || 'N/A'}</div>
                                  <div><span className="font-medium">Other Party Admitted Fault:</span> {lead.other_party_admit_fault === null ? 'N/A' : (lead.other_party_admit_fault ? 'Yes' : 'No')}</div>
                                  <div className="md:col-span-2"><span className="font-medium">Prior Attorney:</span> {lead.prior_attorney_involved ? `Yes — ${lead.prior_attorney_details || ''}` : 'No'}</div>
                                  <div className="md:col-span-2"><span className="font-medium">Contact:</span> {lead.contact_name ? `${lead.contact_name} (${lead.contact_number || 'N/A'}) — ${lead.contact_address || 'N/A'}` : 'N/A'}</div>
                                </div>
                              </div>
                            )}

                            {/* Call Result Details */}
                            {lead.call_results.length > 0 && (
                              <div className="border-t pt-3">
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-1 text-sm">
                                  {lead.call_results[0].carrier && (
                                    <div>
                                      <span className="font-medium">Carrier:</span> {lead.call_results[0].carrier}
                                    </div>
                                  )}
                                  {lead.call_results[0].product_type && (
                                    <div>
                                      <span className="font-medium">Product:</span> {lead.call_results[0].product_type}
                                    </div>
                                  )}
                                  {lead.call_results[0].buffer_agent && (
                                    <div>
                                      <span className="font-medium">Buffer Agent:</span> {lead.call_results[0].buffer_agent}
                                    </div>
                                  )}
                                  {lead.call_results[0].agent_who_took_call && (
                                    <div>
                                      <span className="font-medium">Agent:</span> {lead.call_results[0].agent_who_took_call}
                                    </div>
                                  )}
                                  {lead.call_results[0].licensed_agent_account && (
                                    <div>
                                      <span className="font-medium">Licensed Agent:</span> {lead.call_results[0].licensed_agent_account}
                                    </div>
                                  )}
                                  {lead.call_results[0].status && (
                                    <div>
                                      <span className="font-medium">Status:</span> {lead.call_results[0].status}
                                    </div>
                                  )}
                                  {lead.call_results[0].submission_date && (
                                    <div>
                                      <span className="font-medium">Submitted:</span> {format(new Date(lead.call_results[0].submission_date), 'MMM dd, yyyy')}
                                    </div>
                                  )}
                                  {lead.call_results[0].sent_to_underwriting !== null && (
                                    <div>
                                      <span className="font-medium">Underwriting:</span> {lead.call_results[0].sent_to_underwriting ? 'Yes' : 'No'}
                                    </div>
                                  )}
                                </div>
                                {lead.call_results[0].notes && (
                                  <div className="mt-2">
                                    <span className="font-medium text-sm">Notes:</span>{' '}
                                    <span className="text-sm text-muted-foreground">{lead.call_results[0].notes}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Verification Session Info */}
                            {lead.verification_sessions && lead.verification_sessions.length > 0 && (
                              <div className="border-t pt-3">
                                <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                                  <Clock className="h-4 w-4" />
                                  Verification Session:
                                </h4>
                                <div className="flex items-center gap-4 text-sm">
                                  <Badge 
                                    className={`${
                                      lead.verification_sessions[0].status === 'completed' ? 'bg-green-100 text-green-800' :
                                      lead.verification_sessions[0].status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                      lead.verification_sessions[0].status === 'ready_for_transfer' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}
                                  >
                                    {lead.verification_sessions[0].status.replace('_', ' ').toUpperCase()}
                                  </Badge>
                                  {lead.verification_sessions[0].progress_percentage !== null && (
                                    <span className="text-muted-foreground">
                                      {lead.verification_sessions[0].progress_percentage}% Complete
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex flex-col gap-2 ml-4">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => openClaimModal(lead.submission_id)}
                              className="flex items-center gap-2"
                            >
                              <UserPlus className="h-4 w-4" />
                              Claim Call
                            </Button>
                            
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewLead(lead)}
                              disabled={viewLeadLoadingId === lead.submission_id}
                              className="flex items-center gap-2"
                            >
                              {viewLeadLoadingId === lead.submission_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                              View Lead
                            </Button>
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
                            const maxButtons = 7;
                            const total = totalPages;
                            const current = currentPage;
                            const pages: Array<number | string> = [];

                            if (total <= maxButtons) {
                              for (let i = 1; i <= total; i++) pages.push(i);
                            } else {
                              const side = 1;
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
                                  <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted-foreground">…</span>
                                );
                              }

                              return (
                                <Button
                                  key={`page-${p}`}
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
      
      {/* Claim Call Modals */}
      <ClaimDroppedCallModal
        open={claimModalOpen && modalType === 'dropped'}
        loading={claimLoading}
        licensedAgents={licensedAgents}
        fetchingAgents={fetchingAgents}
        claimLicensedAgent={claimLicensedAgent}
        onLicensedAgentChange={setClaimLicensedAgent}
        onCancel={() => setClaimModalOpen(false)}
        onClaim={handleClaimCall}
      />
      
      <ClaimLicensedAgentModal
        open={claimModalOpen && modalType === 'licensed'}
        loading={claimLoading}
        licensedAgents={licensedAgents}
        fetchingAgents={fetchingAgents}
        claimLicensedAgent={claimLicensedAgent}
        isRetentionCall={claimIsRetentionCall}
        onLicensedAgentChange={setClaimLicensedAgent}
        onRetentionCallChange={setClaimIsRetentionCall}
        onCancel={() => setClaimModalOpen(false)}
        onClaim={handleClaimCall}
      />
    </div>
  );
};

export default Retainers;
