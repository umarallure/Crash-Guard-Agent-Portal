import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Download, Loader2, FileText, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDateUS, formatDateTimeUS } from "@/lib/dateUtils";

interface BulkLookupResult {
  client_phone_number: string;
  lead_vendor: string;
  insured_name: string;
  submission_id: string;
  status: string;
  call_result: string;
  agent: string;
  buffer_agent: string;
  licensed_agent_account: string;
  carrier: string;
  product_type: string;
  draft_date: string;
  monthly_premium: number;
  face_amount: number;
  notes: string;
  policy_number: string;
  carrier_audit: string;
  product_type_carrier: string;
  level_or_gi: string;
  from_callback: boolean;
  date: string;
  created_at: string;
  updated_at: string;
}

const BulkLookup = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BulkLookupResult[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [foundDuplicateGroups, setFoundDuplicateGroups] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const formatLookupDate = (value?: string | null) => formatDateUS(value, "");
  const formatLookupDateTime = (value?: string | null) => formatDateTimeUS(value, "");

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
        toast({
          title: "Invalid file type",
          description: "Please select a CSV file.",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
      setResults([]);
      setProcessedCount(0);
      setTotalCount(0);
    }
  };

  // Function to normalize phone numbers to database format
  const normalizePhoneNumber = (phone: string): string => {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // If it starts with 1 and has 11 digits, remove the 1 (US country code)
    const cleanDigits = digits.startsWith('1') && digits.length === 11 
      ? digits.substring(1) 
      : digits;
    
    // Format as (XXX) XXX-XXXX if we have 10 digits
    if (cleanDigits.length === 10) {
      return `(${cleanDigits.substring(0, 3)}) ${cleanDigits.substring(3, 6)}-${cleanDigits.substring(6)}`;
    }
    
    // Return original if we can't format it
    return phone;
  };

  const parseCSV = (csvText: string): Array<{name: string, phone: string}> => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file must have at least a header row and one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
    
    // Look for name columns (more flexible matching)
    const nameIndex = headers.findIndex(h => 
      h.includes('name') || h.includes('insured') || h.includes('client')
    );
    
    // Look for phone columns
    const phoneIndex = headers.findIndex(h => 
      h.includes('phone') || h.includes('number') || h.includes('tel')
    );

    if (nameIndex === -1 || phoneIndex === -1) {
      throw new Error('CSV must contain columns for name and phone number');
    }

    const parsedData: Array<{name: string, phone: string}> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length > Math.max(nameIndex, phoneIndex)) {
        const name = values[nameIndex]?.trim();
        const rawPhone = values[phoneIndex]?.trim();

        if (name && rawPhone) {
          const normalizedPhone = normalizePhoneNumber(rawPhone);
          parsedData.push({ name, phone: normalizedPhone });
        }
      }
    }

    return parsedData;
  };

  const findDuplicatesByNameAndPhone = async (lookupData: Array<{name: string, phone: string}>): Promise<BulkLookupResult[]> => {
    const allResults: BulkLookupResult[] = [];
    let duplicateGroupsFound = 0;

    try {
      // Extract unique phones and first names for batch queries
      const uniquePhones = [...new Set(lookupData.map(item => item.phone))];
      const uniqueFirstNames = [...new Set(lookupData.map(item => item.name.trim().split(' ')[0].toLowerCase()))];
      const uniqueFullNames = [...new Set(lookupData.map(item => item.name))];

      setProcessedCount(1);
      
      // Batch query 1: Get all entries by phone numbers (most efficient)
      const { data: phoneResults, error: phoneError } = await supabase
        .from('daily_deal_flow')
        .select('*')
        .in('client_phone_number', uniquePhones)
        .order('created_at', { ascending: false });

      if (phoneError) {
        console.error('Error querying by phone:', phoneError);
        throw phoneError;
      }

      setProcessedCount(2);

      // Batch query 2: Get all entries by first names (using OR conditions)
      let firstNameResults: any[] = [];
      if (uniqueFirstNames.length > 0) {
        // Build OR condition for first names using ilike
        const firstNameConditions = uniqueFirstNames.map(name => `insured_name.ilike.${name}%`).join(',');
        
        const { data: nameResults, error: nameError } = await supabase
          .from('daily_deal_flow')
          .select('*')
          .or(firstNameConditions)
          .order('created_at', { ascending: false });

        if (nameError) {
          console.error('Error querying by names:', nameError);
        } else if (nameResults) {
          // Filter client-side to ensure exact first name matches
          firstNameResults = nameResults.filter(entry => {
            if (!entry.insured_name) return false;
            const entryFirstName = entry.insured_name.trim().split(' ')[0].toLowerCase();
            return uniqueFirstNames.includes(entryFirstName);
          });
        }
      }

      setProcessedCount(3);

      // Combine all results and remove duplicates
      const allDbResults = [...(phoneResults || []), ...firstNameResults];
      const uniqueDbResults = allDbResults.filter((entry, index, self) =>
        index === self.findIndex(e => e.submission_id === entry.submission_id)
      );

      // Group results by phone and name combinations with strict matching
      const resultGroups = new Map<string, any[]>();
      
      for (const lookupItem of lookupData) {
        const firstName = lookupItem.name.trim().split(' ')[0].toLowerCase();
        const fullName = lookupItem.name.trim();
        const phone = lookupItem.phone;
        const groupKey = `${firstName}_${phone}`;

        if (!resultGroups.has(groupKey)) {
          // Find matching entries for this lookup item with STRICT criteria
          const matchingEntries = uniqueDbResults.filter(entry => {
            // MUST match phone number exactly
            const phoneMatch = entry.client_phone_number === phone;
            
            if (!phoneMatch) return false; // Phone must match, no exceptions
            
            // For entries with matching phone, check name criteria
            const entryName = entry.insured_name ? entry.insured_name.trim() : '';
            const entryFirstName = entryName.split(' ')[0].toLowerCase();
            
            // Match by exact full name OR exact first name
            const exactNameMatch = entryName === fullName;
            const firstNameMatch = entryFirstName === firstName;

            return exactNameMatch || firstNameMatch;
          });

          if (matchingEntries.length >= 2) {
            // Check if at least one entry has 'Pending Approval' status
            const hasPendingApproval = matchingEntries.some(entry => 
              entry.status === 'Pending Approval'
            );

            if (hasPendingApproval) {
              resultGroups.set(groupKey, matchingEntries);
              duplicateGroupsFound++;
            }
          }
        }
      }

      // Format and collect all results
      for (const [_, entries] of resultGroups) {
        const formattedEntries = entries.map(entry => ({
          client_phone_number: entry.client_phone_number || '',
          lead_vendor: entry.lead_vendor || '',
          insured_name: entry.insured_name || '',
          submission_id: entry.submission_id || '',
          status: entry.status || '',
          call_result: entry.call_result || '',
          agent: entry.agent || '',
          buffer_agent: entry.buffer_agent || '',
          licensed_agent_account: entry.licensed_agent_account || '',
          carrier: entry.carrier || '',
          product_type: entry.product_type || '',
          draft_date: entry.draft_date || '',
          monthly_premium: entry.monthly_premium || 0,
          face_amount: entry.face_amount || 0,
          notes: entry.notes || '',
          policy_number: entry.policy_number || '',
          carrier_audit: entry.carrier_audit || '',
          product_type_carrier: entry.product_type_carrier || '',
          level_or_gi: entry.level_or_gi || '',
          from_callback: entry.from_callback || false,
          date: entry.date || '',
          created_at: entry.created_at || '',
          updated_at: entry.updated_at || ''
        }));

        allResults.push(...formattedEntries);
      }

      setProcessedCount(lookupData.length);

    } catch (error) {
      console.error('Error in batch processing:', error);
      throw error;
    }

    setFoundDuplicateGroups(duplicateGroupsFound);
    return allResults;
  };

  const handleProcess = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to process.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResults([]);
    setProcessedCount(0);
    setTotalCount(0);
    setFoundDuplicateGroups(0);

    try {
      const csvText = await file.text();
      const lookupData = parseCSV(csvText);
      setTotalCount(lookupData.length);

      toast({
        title: "Processing started",
        description: `Batch processing ${lookupData.length} leads for duplicates...`,
      });

      const duplicateResults = await findDuplicatesByNameAndPhone(lookupData);
      setResults(duplicateResults);

      toast({
        title: "Processing completed",
        description: `Found ${foundDuplicateGroups} leads with duplicates (${duplicateResults.length} total entries) in optimized batch queries.`,
      });

    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "An error occurred while processing the file.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (results.length === 0) {
      toast({
        title: "No data to export",
        description: "Please process a CSV file first to generate results.",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      'Submission ID',
      'Insured Name',
      'Client Phone Number',
      'Lead Vendor',
      'Date',
      'Status',
      'Call Result',
      'Agent',
      'Buffer Agent',
      'Licensed Agent Account',
      'Carrier',
      'Product Type',
      'Draft Date',
      'Monthly Premium',
      'Face Amount',
      'From Callback',
      'Notes',
      'Policy Number',
      'Carrier Audit',
      'Product Type Carrier',
      'Level or GI',
      'Created At',
      'Updated At'
    ];

    const csvContent = [
      headers.join(','),
      ...results.map(row => [
        `"${row.submission_id}"`,
        `"${row.insured_name}"`,
        `"${row.client_phone_number}"`,
        `"${row.lead_vendor}"`,
        `"${formatLookupDate(row.date)}"`,
        `"${row.status}"`,
        `"${row.call_result}"`,
        `"${row.agent}"`,
        `"${row.buffer_agent}"`,
        `"${row.licensed_agent_account}"`,
        `"${row.carrier}"`,
        `"${row.product_type}"`,
        `"${formatLookupDate(row.draft_date)}"`,
        `"${row.monthly_premium}"`,
        `"${row.face_amount}"`,
        `"${row.from_callback}"`,
        `"${(row.notes || '').replace(/"/g, '""')}"`,
        `"${row.policy_number}"`,
        `"${row.carrier_audit}"`,
        `"${row.product_type_carrier}"`,
        `"${row.level_or_gi}"`,
        `"${formatLookupDateTime(row.created_at)}"`,
        `"${formatLookupDateTime(row.updated_at)}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `duplicate_leads_by_name_phone_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export completed",
      description: `Exported ${results.length} duplicate entries from ${foundDuplicateGroups} leads to CSV file.`,
    });
  };

  const exportDuplicateDataToCSV = (duplicateData: any[]) => {
    if (duplicateData.length === 0) {
      toast({
        title: "No data to export",
        description: "No duplicate data available.",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      'Submission ID',
      'Insured Name',
      'Client Phone Number',
      'Lead Vendor',
      'Date',
      'Status',
      'Call Result',
      'Agent',
      'Buffer Agent',
      'Licensed Agent Account',
      'Carrier',
      'Product Type',
      'Draft Date',
      'Monthly Premium',
      'Face Amount',
      'From Callback',
      'Notes',
      'Policy Number',
      'Carrier Audit',
      'Product Type Carrier',
      'Level or GI',
      'Created At',
      'Updated At'
    ];

    const csvContent = [
      headers.join(','),
      ...duplicateData.map(row => [
        `"${row.submission_id || ''}"`,
        `"${row.insured_name || ''}"`,
        `"${row.client_phone_number || ''}"`,
        `"${row.lead_vendor || ''}"`,
        `"${formatLookupDate(row.date)}"`,
        `"${row.status || ''}"`,
        `"${row.call_result || ''}"`,
        `"${row.agent || ''}"`,
        `"${row.buffer_agent || ''}"`,
        `"${row.licensed_agent_account || ''}"`,
        `"${row.carrier || ''}"`,
        `"${row.product_type || ''}"`,
        `"${formatLookupDate(row.draft_date)}"`,
        `"${row.monthly_premium || ''}"`,
        `"${row.face_amount || ''}"`,
        `"${row.from_callback || ''}"`,
        `"${(row.notes || '').replace(/"/g, '""')}"`,
        `"${row.policy_number || ''}"`,
        `"${row.carrier_audit || ''}"`,
        `"${row.product_type_carrier || ''}"`,
        `"${row.level_or_gi || ''}"`,
        `"${formatLookupDateTime(row.created_at)}"`,
        `"${formatLookupDateTime(row.updated_at)}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `duplicate_leads_with_pending_approval_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export completed",
      description: `Exported ${duplicateData.length} duplicate records to CSV file.`,
    });
  };

  const clearFile = () => {
    setFile(null);
    setResults([]);
    setProcessedCount(0);
    setTotalCount(0);
    setFoundDuplicateGroups(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Duplicate Lookup (Phone + Name Exact Matching)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Upload a CSV file with lead names and phone numbers. 
              The system will find leads with 2+ entries where at least one has 'Pending Approval' status using strict matching:
              <br />
              • <strong>Phone number MUST match exactly</strong>: "(219) 931-7893"
              <br />
              • <strong>AND either exact name match</strong>: "Gregory L Wilbert" 
              <br />
              • <strong>OR exact first name match</strong>: "Gregory" matches "Gregory Smith", "Gregory Johnson", etc.
              <br /><br />
              <strong>Example:</strong> Input "Gregory L Wilbert (219) 931-7893" finds duplicates only with same phone AND name starting with "Gregory"
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="csv-file">Select CSV File</Label>
            <div className="flex items-center gap-2">
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                ref={fileInputRef}
                className="flex-1"
              />
              {file && (
                <Button variant="outline" onClick={clearFile}>
                  Clear
                </Button>
              )}
            </div>
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleProcess}
              disabled={!file || loading}
              className="flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {loading ? 'Processing...' : 'Process CSV'}
            </Button>

            {results.length > 0 && (
              <Button
                onClick={exportToCSV}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export Results ({results.length})
              </Button>
            )}
          </div>

          {loading && processedCount > 0 && (
            <div className="text-sm text-muted-foreground">
              {processedCount < totalCount ? (
                <>Step {processedCount} of 3: Batch querying database...</>
              ) : (
                <>Processing complete! Analyzing {totalCount} leads for duplicates...</>
              )}
              {foundDuplicateGroups > 0 && ` Found ${foundDuplicateGroups} duplicate groups.`}
            </div>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Results: {foundDuplicateGroups} leads with duplicates ({results.length} total entries)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-1 border-r">Submission ID</th>
                      <th className="text-left p-1 border-r">Insured Name</th>
                      <th className="text-left p-1 border-r">Phone</th>
                      <th className="text-left p-1 border-r">Lead Vendor</th>
                      <th className="text-left p-1 border-r">Status</th>
                      <th className="text-left p-1 border-r">Call Result</th>
                      <th className="text-left p-1 border-r">Agent</th>
                      <th className="text-left p-1 border-r">Buffer Agent</th>
                      <th className="text-left p-1 border-r">Licensed Agent</th>
                      <th className="text-left p-1 border-r">Carrier</th>
                      <th className="text-left p-1 border-r">Product Type</th>
                      <th className="text-left p-1 border-r">Monthly Premium</th>
                      <th className="text-left p-1 border-r">Face Amount</th>
                      <th className="text-left p-1 border-r">Draft Date</th>
                      <th className="text-left p-1 border-r">Date</th>
                      <th className="text-left p-1 border-r">Policy Number</th>
                      <th className="text-left p-1 border-r">From Callback</th>
                      <th className="text-left p-1">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 50).map((result, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-1 border-r text-xs">{result.submission_id}</td>
                        <td className="p-1 border-r font-medium">{result.insured_name}</td>
                        <td className="p-1 border-r">{result.client_phone_number}</td>
                        <td className="p-1 border-r">{result.lead_vendor}</td>
                        <td className="p-1 border-r">
                          <span className={`px-1 py-0.5 rounded text-xs ${
                            result.status === 'Pending Approval'
                              ? 'bg-yellow-100 text-yellow-800'
                              : result.status === 'Submitted'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {result.status}
                          </span>
                        </td>
                        <td className="p-1 border-r">{result.call_result}</td>
                        <td className="p-1 border-r">{result.agent}</td>
                        <td className="p-1 border-r">{result.buffer_agent}</td>
                        <td className="p-1 border-r">{result.licensed_agent_account}</td>
                        <td className="p-1 border-r">{result.carrier}</td>
                        <td className="p-1 border-r">{result.product_type}</td>
                        <td className="p-1 border-r">${result.monthly_premium}</td>
                        <td className="p-1 border-r">${result.face_amount?.toLocaleString()}</td>
                        <td className="p-1 border-r">{formatLookupDate(result.draft_date)}</td>
                        <td className="p-1 border-r">{formatLookupDate(result.date)}</td>
                        <td className="p-1 border-r">{result.policy_number}</td>
                        <td className="p-1 border-r">{result.from_callback ? 'Yes' : 'No'}</td>
                        <td className="p-1 max-w-32 truncate" title={result.notes}>{result.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {results.length > 50 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Showing first 50 results. Export to CSV to see all {results.length} entries.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BulkLookup;
