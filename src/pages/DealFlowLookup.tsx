import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Search, Phone, Calendar, DollarSign, FileText, Building2, User } from 'lucide-react';
import { formatDateUS } from '@/lib/dateUtils';

interface DealFlowResult {
  id: string;
  submission_id: string;
  client_phone_number: string | null;
  lead_vendor: string | null;
  date: string | null;
  insured_name: string | null;
  buffer_agent: string | null;
  agent: string | null;
  licensed_agent_account: string | null;
  status: string | null;
  call_result: string | null;
  carrier: string | null;
  product_type: string | null;
  draft_date: string | null;
  monthly_premium: number | null;
  face_amount: number | null;
  from_callback: boolean | null;
  notes: string | null;
  policy_number: string | null;
  carrier_audit: string | null;
  product_type_carrier: string | null;
  level_or_gi: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface MondayColumnValue {
  id: string;
  text: string | null;
  value: string | null;
}

interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

const MONDAY_COLUMN_MAP: Record<string, string> = {
  "status": "Stage",
  "date1": "Deal creation date",
  "text_mkpx3j6w": "Policy Number",
  "color_mknkq2qd": "Carrier",
  "numbers": "Deal Value",
  "text_mknk5m2r": "Notes",
  "color_mkp5sj20": "Status",
  "pulse_updated_mknkqf59": "Last updated",
  "color_mkq0rkaw": "Sales Agent",
  "text_mkq196kp": "Policy Type",
  "date_mkq1d86z": "Effective Date",
  "dropdown_mkq2x0kx": "Call Center",
  "long_text_mksd6zg1": "Deal Summary",
};

export default function DealFlowLookup() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [searchMode, setSearchMode] = useState<'phone' | 'name'>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [results, setResults] = useState<DealFlowResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  
  const [policyInfo, setPolicyInfo] = useState<Record<string, MondayItem[]>>({});
  const [policyInfoLoading, setPolicyInfoLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user && !authLoading) {
      navigate('/auth', { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Name normalization utilities
  const normalizeNameForSearch = (inputName: string): string[] => {
    const trimmed = inputName.trim();
    if (!trimmed) return [];

    const nameParts = trimmed.split(/\s+/);
    const variations: string[] = [];

    if (nameParts.length === 1) {
      // Single name - search as is
      variations.push(trimmed.toLowerCase());
    } else if (nameParts.length === 2) {
      const [first, last] = nameParts;
      
      // Format 1: "Julia Jordan" (First Last)
      variations.push(`${first} ${last}`.toLowerCase());
      
      // Format 2: "JORDAN, JULIA" (LAST, FIRST)
      variations.push(`${last}, ${first}`.toLowerCase());
      variations.push(`${last},${first}`.toLowerCase()); // without space
      
      // Format 3: "Jordan Julia" (Last First)
      variations.push(`${last} ${first}`.toLowerCase());
      
      // Format 4: Capitalized variations
      variations.push(`${last.toUpperCase()}, ${first.toUpperCase()}`);
      variations.push(`${last.toUpperCase()},${first.toUpperCase()}`);
      
      // Format 5: Mixed case common format
      const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      variations.push(`${capitalizeFirst(last)}, ${capitalizeFirst(first)}`);
    } else if (nameParts.length >= 3) {
      // Handle middle names/initials
      const first = nameParts[0];
      const middle = nameParts.slice(1, -1).join(' ');
      const last = nameParts[nameParts.length - 1];
      
      // Various formats with middle name
      variations.push(`${first} ${middle} ${last}`.toLowerCase());
      variations.push(`${last}, ${first} ${middle}`.toLowerCase());
      variations.push(`${last}, ${first}`.toLowerCase()); // Skip middle
      variations.push(`${first} ${last}`.toLowerCase()); // Skip middle
      variations.push(`${last.toUpperCase()}, ${first.toUpperCase()}`);
    }

    // Add original input
    variations.push(trimmed.toLowerCase());
    variations.push(trimmed.toUpperCase());
    variations.push(trimmed);

    // Remove duplicates
    return [...new Set(variations)];
  };

  const normalizeNameForMonday = (inputName: string): string => {
    // For Monday.com, we'll convert to "LAST, FIRST" format
    const trimmed = inputName.trim();
    const nameParts = trimmed.split(/\s+/);
    
    if (nameParts.length >= 2) {
      const first = nameParts[0];
      const last = nameParts[nameParts.length - 1];
      return `${last.toUpperCase()}, ${first.toUpperCase()}`;
    }
    
    return trimmed.toUpperCase();
  };

  const normalizePhoneNumber = (phoneNumber: string): string[] => {
    // Remove all non-digit characters
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    
    // Generate multiple possible formats
    const formats = [];
    
    // Format 1: As-is with parentheses and dash: (XXX) XXX-XXXX
    if (digitsOnly.length === 10) {
      formats.push(`(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`);
    }
    
    // Format 2: Just digits
    formats.push(digitsOnly);
    
    // Format 3: With country code if 10 digits
    if (digitsOnly.length === 10) {
      formats.push(`1${digitsOnly}`);
    }
    
    // Format 4: Original input
    formats.push(phoneNumber);
    
    return [...new Set(formats)]; // Remove duplicates
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (searchMode === 'phone' && !phone) {
      toast.error('Please enter a phone number.');
      return;
    }
    
    if (searchMode === 'name' && !name) {
      toast.error('Please enter a name.');
      return;
    }

    setIsLoading(true);
    setSearchPerformed(true);
    setResults([]);
    setPolicyInfo({});
    setPolicyInfoLoading({});

    try {
      if (searchMode === 'phone') {
        // Phone search logic
        const phoneFormats = normalizePhoneNumber(phone);
        console.log('Searching for phone formats:', phoneFormats);
        
        const { data, error } = await supabase
          .from('daily_deal_flow')
          .select('*')
          .in('client_phone_number', phoneFormats)
          .order('date', { ascending: false });

        if (error) {
          console.error('Error fetching data:', error);
          toast.error('An error occurred while searching.');
        } else {
          setResults(data || []);
          if (data && data.length === 0) {
            toast.info('No records found for this phone number.');
          } else {
            toast.success(`Found ${data?.length || 0} record(s)`);
          }
        }
      } else {
        // Name search logic
        const nameVariations = normalizeNameForSearch(name);
        console.log('Searching for name variations:', nameVariations);
        
        // Use textSearch or multiple ilike queries in sequence
        // We'll try each variation and combine results
        const allResults: DealFlowResult[] = [];
        const seenIds = new Set<string>();
        
        // Search with each variation to maximize matches
        for (const variation of nameVariations.slice(0, 5)) { // Limit to first 5 variations to avoid too many queries
          try {
            const { data, error } = await supabase
              .from('daily_deal_flow')
              .select('*')
              .ilike('insured_name', `%${variation}%`)
              .order('date', { ascending: false });
            
            if (!error && data) {
              // Add unique results
              data.forEach(record => {
                if (!seenIds.has(record.id)) {
                  seenIds.add(record.id);
                  allResults.push(record);
                }
              });
            }
          } catch (err) {
            console.warn(`Search failed for variation: ${variation}`, err);
          }
        }

        if (allResults.length === 0) {
          // If no results from direct queries, fall back to client-side filtering
          const { data, error } = await supabase
            .from('daily_deal_flow')
            .select('*')
            .not('insured_name', 'is', null)
            .order('date', { ascending: false })
            .limit(500); // Limit to prevent overload

          if (error) {
            console.error('Error fetching data:', error);
            toast.error('An error occurred while searching.');
            return;
          }

          // Client-side filtering with fuzzy matching
          const filtered = data?.filter(record => {
            if (!record.insured_name) return false;
            const recordName = record.insured_name.toLowerCase();
            
            return nameVariations.some(variation => {
              const varLower = variation.toLowerCase();
              
              // Exact match
              if (recordName === varLower) return true;
              
              // Contains match
              if (recordName.includes(varLower)) return true;
              
              // Part-by-part matching
              const recordParts = recordName.split(/[\s,]+/).filter(p => p.length > 1);
              const varParts = varLower.split(/[\s,]+/).filter(p => p.length > 1);
              
              const allVarPartsInRecord = varParts.every(vp => 
                recordParts.some(rp => rp.includes(vp) || vp.includes(rp))
              );
              
              return allVarPartsInRecord;
            });
          }) || [];
          
          setResults(filtered);
          if (filtered.length === 0) {
            toast.info('No records found for this name. Try different formats like "First Last" or "Last, First"');
          } else {
            toast.success(`Found ${filtered.length} record(s)`);
          }
        } else {
          // Use results from direct queries
          setResults(allResults);
          toast.success(`Found ${allResults.length} record(s)`);
        }
      }
    } catch (error) {
      toast.error('An error occurred while searching.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchPolicyInfo = async (clientPhone: string | null, clientName: string | null, resultIdentifier: string) => {
    if (policyInfo[resultIdentifier]) return;
    
    // Always prefer phone search for Monday.com as it's more reliable
    // Even when searching by name, we use the phone from the Daily Deal Flow record
    if (!clientPhone) {
      toast.error('Unable to fetch policy info: phone number not available for this record');
      return;
    }

    setPolicyInfoLoading(prev => ({ ...prev, [resultIdentifier]: true }));
    try {
      // Always search Monday.com by phone (more reliable than name)
      const response = await supabase.functions.invoke('get-monday-policy-info', {
        body: { phone: clientPhone }
      });
      
      const data = response.data;
      const error = response.error;

      if (error) throw error;

      setPolicyInfo(prev => ({ ...prev, [resultIdentifier]: data?.items || [] }));
    } catch (error: any) {
      toast.error(`Failed to fetch policy info: ${error.message}`);
      console.error('Monday.com fetch error:', error);
    } finally {
      setPolicyInfoLoading(prev => ({ ...prev, [resultIdentifier]: false }));
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold tracking-tight flex items-center justify-center gap-3">
              <Search className="h-10 w-10" />
              Deal Flow & Policy Lookup
            </h1>
            <p className="text-muted-foreground mt-2">
              Search Daily Deal Flow records and Monday.com policies by phone number
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Search by Phone or Name</CardTitle>
              <CardDescription>Choose your search method and enter the information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Search Mode Toggle */}
              <div className="space-y-3">
                <Label>Search Method</Label>
                <RadioGroup 
                  value={searchMode} 
                  onValueChange={(value: 'phone' | 'name') => setSearchMode(value)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="phone" id="phone" />
                    <Label htmlFor="phone" className="cursor-pointer flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone Number
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="name" id="name" />
                    <Label htmlFor="name" className="cursor-pointer flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Client Name
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Search Form */}
              <form onSubmit={handleSearch} className="space-y-4">
                {searchMode === 'phone' ? (
                  <div className="space-y-2">
                    <Label htmlFor="phoneInput">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phoneInput"
                        type="tel"
                        placeholder="(555) 123-4567 or 5551234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Accepts any format: (555) 123-4567, 555-123-4567, or 5551234567
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="nameInput">Client Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="nameInput"
                        type="text"
                        placeholder="Julia Jordan or JORDAN, JULIA"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Works with multiple formats: "First Last", "LAST, FIRST", or "Last First"
                    </p>
                  </div>
                )}
                
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Search {searchMode === 'phone' ? 'by Phone' : 'by Name'}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {searchPerformed && (
            <div className="mt-8">
              {isLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-muted-foreground">Searching records...</p>
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Found {results.length} Record(s)</h2>
                  </div>
                  
                  {results.map((result, index) => (
                    <Card key={result.id} className="border-l-4 border-l-primary">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center justify-between">
                          <span>{result.insured_name || 'N/A'}</span>
                          <span className="text-sm font-normal text-muted-foreground">
                            {result.date ? new Date(result.date).toLocaleDateString() : 'N/A'}
                          </span>
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Submission ID: {result.submission_id}
                        </CardDescription>
                      </CardHeader>
                      
                      <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value={`details-${result.id}`} className="border-0">
                          <AccordionTrigger className="px-6 py-2 hover:no-underline">
                            <span className="text-sm font-medium flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              View Full Details
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <CardContent className="space-y-4 pt-2">
                              {/* Contact & Basic Info */}
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    Phone
                                  </p>
                                  <p className="font-medium">{result.client_phone_number || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground flex items-center gap-1">
                                    <Building2 className="h-3 w-3" />
                                    Lead Vendor
                                  </p>
                                  <p className="font-medium">{result.lead_vendor || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Status</p>
                                  <p className="font-medium">
                                    <span className={cn(
                                      "px-2 py-1 rounded text-xs",
                                      result.status === 'Pending Approval' && "bg-yellow-100 text-yellow-800",
                                      result.status === 'Submitted' && "bg-green-100 text-green-800"
                                    )}>
                                      {result.status || 'N/A'}
                                    </span>
                                  </p>
                                </div>
                              </div>

                              {/* Agent Info */}
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm border-t pt-4">
                                <div>
                                  <p className="text-muted-foreground">Buffer Agent</p>
                                  <p className="font-medium">{result.buffer_agent || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Agent</p>
                                  <p className="font-medium">{result.agent || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Licensed Account</p>
                                  <p className="font-medium">{result.licensed_agent_account || 'N/A'}</p>
                                </div>
                              </div>

                              {/* Policy Info */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t pt-4">
                                <div>
                                  <p className="text-muted-foreground">Carrier</p>
                                  <p className="font-medium">{result.carrier || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Product Type</p>
                                  <p className="font-medium">{result.product_type || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    Monthly Premium
                                  </p>
                                  <p className="font-medium">
                                    {result.monthly_premium ? `$${result.monthly_premium.toFixed(2)}` : 'N/A'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    Face Amount
                                  </p>
                                  <p className="font-medium">
                                    {result.face_amount ? `$${result.face_amount.toLocaleString()}` : 'N/A'}
                                  </p>
                                </div>
                              </div>

                              {/* Additional Details */}
                              {(result.draft_date || result.call_result || result.policy_number) && (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm border-t pt-4">
                                  {result.draft_date && (
                                    <div>
                                      <p className="text-muted-foreground flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        Draft Date
                                      </p>
                                      <p className="font-medium">
                                        {formatDateUS(result.draft_date)}
                                      </p>
                                    </div>
                                  )}
                                  {result.call_result && (
                                    <div>
                                      <p className="text-muted-foreground">Call Result</p>
                                      <p className="font-medium">{result.call_result}</p>
                                    </div>
                                  )}
                                  {result.policy_number && (
                                    <div>
                                      <p className="text-muted-foreground">Policy Number</p>
                                      <p className="font-medium">{result.policy_number}</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Notes */}
                              {result.notes && (
                                <div className="border-t pt-4">
                                  <p className="text-sm font-medium mb-2">Notes:</p>
                                  <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded">
                                    {result.notes}
                                  </p>
                                </div>
                              )}
                            </CardContent>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>

                      <CardFooter className="flex flex-col gap-2">
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`policy-info-${result.id}`}>
                            <AccordionTrigger
                              className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-between')}
                              onClick={() => handleFetchPolicyInfo(
                                result.client_phone_number, 
                                result.insured_name,
                                result.id
                              )}
                            >
                              <span className="flex items-center gap-2">
                                <Building2 className="h-4 w-4" />
                                {policyInfoLoading[result.id] ? 'Fetching Monday.com Policy Info...' : 'View Monday.com Policy Info'}
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="pt-4">
                              {policyInfoLoading[result.id] ? (
                                <div className="flex items-center justify-center py-4">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                  <p className="ml-3">Loading policy info...</p>
                                </div>
                              ) : policyInfo[result.id] ? (
                                policyInfo[result.id].length > 0 ? (
                                  <div className="space-y-4">
                                    {policyInfo[result.id].map((item, idx) => (
                                      <div key={item.id} className="border rounded-lg p-4 space-y-2 bg-muted/30">
                                        <h4 className="font-semibold text-sm mb-3 pb-2 border-b">
                                          Policy {idx + 1}: {item.name}
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          {item.column_values
                                            .filter(col => MONDAY_COLUMN_MAP[col.id] && col.text)
                                            .map(col => (
                                              <div key={col.id} className="flex flex-col">
                                                <span className="font-medium text-muted-foreground text-xs">
                                                  {MONDAY_COLUMN_MAP[col.id]}:
                                                </span>
                                                <span className="font-medium">{col.text}</span>
                                              </div>
                                            ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground text-center py-4">
                                    No Monday.com policy information found.
                                  </p>
                                )
                              ) : (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                  Click to load Monday.com policy information.
                                </p>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="text-center py-12">
                  <CardContent>
                    <div className="flex flex-col items-center gap-4">
                      <Search className="h-16 w-16 text-muted-foreground" />
                      <div>
                        <h3 className="text-lg font-medium">No Results Found</h3>
                        <p className="text-muted-foreground mt-1">
                          No records found for the provided phone number.
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Try searching with different formats like: (555) 123-4567 or 5551234567
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
