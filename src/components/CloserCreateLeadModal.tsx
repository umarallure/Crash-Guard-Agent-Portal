import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCenters } from '@/hooks/useCenters';
import { US_STATES } from '@/lib/us-states';
import { LEAD_TAG_OPTIONS } from '@/lib/leadTags';

export type AttachSourceLead = {
  id: string;
  submission_id: string;
  customer_full_name?: string | null;
  lead_vendor?: string | null;
  tag?: string | null;
  accident_date?: string | null;
  accident_location?: string | null;
  accident_scenario?: string | null;
  injuries?: string | null;
  medical_attention?: string | null;
  police_attended?: boolean | null;
  insured?: boolean | null;
  vehicle_registration?: string | null;
  insurance_company?: string | null;
  third_party_vehicle_registration?: string | null;
  other_party_admit_fault?: boolean | null;
  passengers_count?: number | null;
};

type CloserCreateLeadModalProps = {
  open: boolean;
  onClose: () => void;
  onLeadCreated: (created: { id: string; submission_id: string }) => void;
  mode: 'standalone' | 'attach';
  sourceLead?: AttachSourceLead;
};

type TriState = '' | 'YES' | 'NO';

type LeadFormData = {
  customer_full_name: string;
  phone_number: string;
  email: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  date_of_birth: string;
  age: string;
  lead_vendor: string;
  accident_date: string;
  accident_location: string;
  accident_scenario: string;
  injuries: string;
  medical_attention: string;
  police_attended: TriState;
  insured: TriState;
  other_party_admit_fault: TriState;
  vehicle_registration: string;
  insurance_company: string;
  third_party_vehicle_registration: string;
  passengers_count: string;
  additional_notes: string;
  tag: string;
  linked_relationship: string;
};

const NO_TAG_VALUE = '__NO_TAG__';

const emptyFormData: LeadFormData = {
  customer_full_name: '',
  phone_number: '',
  email: '',
  street_address: '',
  city: '',
  state: '',
  zip_code: '',
  date_of_birth: '',
  age: '',
  lead_vendor: '',
  accident_date: '',
  accident_location: '',
  accident_scenario: '',
  injuries: '',
  medical_attention: '',
  police_attended: '',
  insured: '',
  other_party_admit_fault: '',
  vehicle_registration: '',
  insurance_company: '',
  third_party_vehicle_registration: '',
  passengers_count: '',
  additional_notes: '',
  tag: '',
  linked_relationship: 'passenger',
};

const boolToTriState = (value: boolean | null | undefined): TriState => {
  if (value === true) return 'YES';
  if (value === false) return 'NO';
  return '';
};

const triStateToBool = (value: TriState): boolean | null => {
  if (value === 'YES') return true;
  if (value === 'NO') return false;
  return null;
};

const generateSubmissionId = () => {
  const randomNumber = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
  return `CGM${randomNumber}`; // Crash Guard Manual — distinguishes portal-created leads from publisher submissions
};

export const CloserCreateLeadModal = ({ open, onClose, onLeadCreated, mode, sourceLead }: CloserCreateLeadModalProps) => {
  const { toast } = useToast();
  const { leadVendors } = useCenters();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<LeadFormData>(emptyFormData);

  const isAttach = mode === 'attach' && Boolean(sourceLead);

  useEffect(() => {
    if (!open) return;

    if (isAttach && sourceLead) {
      setFormData({
        ...emptyFormData,
        lead_vendor: sourceLead.lead_vendor || '',
        tag: sourceLead.tag || '',
        accident_date: sourceLead.accident_date || '',
        accident_location: sourceLead.accident_location || '',
        accident_scenario: sourceLead.accident_scenario || '',
        injuries: sourceLead.injuries || '',
        medical_attention: sourceLead.medical_attention || '',
        police_attended: boolToTriState(sourceLead.police_attended),
        insured: boolToTriState(sourceLead.insured),
        other_party_admit_fault: boolToTriState(sourceLead.other_party_admit_fault),
        vehicle_registration: sourceLead.vehicle_registration || '',
        insurance_company: sourceLead.insurance_company || '',
        third_party_vehicle_registration: sourceLead.third_party_vehicle_registration || '',
        passengers_count: sourceLead.passengers_count != null ? String(sourceLead.passengers_count) : '',
      });
    } else {
      setFormData(emptyFormData);
    }
  }, [open, isAttach, sourceLead?.id]);

  const vendorOptions = (() => {
    const options = [...leadVendors];
    const sourceVendor = (sourceLead?.lead_vendor || '').trim();
    if (sourceVendor && !options.includes(sourceVendor)) {
      options.push(sourceVendor);
      options.sort((a, b) => a.localeCompare(b));
    }
    return options;
  })();

  const handleInputChange = (field: keyof LeadFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.customer_full_name.trim()) {
      toast({ title: 'Validation Error', description: 'Customer name is required.', variant: 'destructive' });
      return;
    }

    if (!formData.phone_number.trim()) {
      toast({ title: 'Validation Error', description: 'Phone number is required.', variant: 'destructive' });
      return;
    }

    if (!formData.lead_vendor) {
      toast({ title: 'Validation Error', description: 'Lead vendor is required.', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const submissionId = generateSubmissionId();

      const leadData = {
        submission_id: submissionId,
        submission_date: new Date().toISOString(),
        status: 'pending_disposition',
        customer_full_name: formData.customer_full_name.trim(),
        phone_number: formData.phone_number.trim(),
        email: formData.email.trim() || null,
        street_address: formData.street_address.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state || null,
        zip_code: formData.zip_code.trim() || null,
        date_of_birth: formData.date_of_birth || null,
        age: formData.age ? parseInt(formData.age) : null,
        lead_vendor: formData.lead_vendor,
        tag: formData.tag || null,
        accident_date: formData.accident_date || null,
        accident_location: formData.accident_location.trim() || null,
        accident_scenario: formData.accident_scenario.trim() || null,
        injuries: formData.injuries.trim() || null,
        medical_attention: formData.medical_attention.trim() || null,
        police_attended: triStateToBool(formData.police_attended),
        insured: triStateToBool(formData.insured),
        other_party_admit_fault: triStateToBool(formData.other_party_admit_fault),
        vehicle_registration: formData.vehicle_registration.trim() || null,
        insurance_company: formData.insurance_company.trim() || null,
        third_party_vehicle_registration: formData.third_party_vehicle_registration.trim() || null,
        passengers_count: formData.passengers_count ? parseInt(formData.passengers_count) : null,
        additional_notes: formData.additional_notes.trim() || null,
        is_callback: false,
        buffer_agent: '',
        agent: '',
        user_id: null,
        ...(isAttach && sourceLead
          ? {
              linked_lead_id: sourceLead.id,
              linked_relationship: formData.linked_relationship || 'passenger',
            }
          : {}),
      };

      const { data, error } = await supabase
        .from('leads')
        .insert([leadData])
        .select('id, submission_id')
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: isAttach
          ? `Linked lead created! Submission ID: ${submissionId}`
          : `Lead created successfully! Submission ID: ${submissionId}`,
      });

      onLeadCreated({ id: data.id, submission_id: data.submission_id || submissionId });
      handleClose();
    } catch (error: any) {
      console.error('Error creating lead:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create lead. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData(emptyFormData);
    onClose();
  };

  const renderTriStateSelect = (field: 'police_attended' | 'insured' | 'other_party_admit_fault', label: string) => (
    <div className="space-y-2">
      <Label htmlFor={field}>{label}</Label>
      <Select
        value={formData[field] || undefined}
        onValueChange={(value) => handleInputChange(field, value as TriState)}
      >
        <SelectTrigger id={field}>
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="YES">Yes</SelectItem>
          <SelectItem value="NO">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isAttach ? 'Attach New Lead' : 'Add New Lead'}</DialogTitle>
          <DialogDescription>
            Fill in the lead information. Fields marked with * are required.
            {isAttach && sourceLead ? (
              <>
                <br />
                <span className="text-sm text-muted-foreground">
                  Linking to: <span className="font-semibold">{sourceLead.customer_full_name || 'Unknown Lead'}</span>{' '}
                  (<span className="font-mono text-xs">{sourceLead.submission_id}</span>)
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4">
            {isAttach ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="linked_relationship">Relationship to original lead</Label>
                  <Select
                    value={formData.linked_relationship}
                    onValueChange={(value) => handleInputChange('linked_relationship', value)}
                  >
                    <SelectTrigger id="linked_relationship">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passenger">Passenger</SelectItem>
                      <SelectItem value="driver">Driver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            <Tabs defaultValue="contact" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="contact">Contact</TabsTrigger>
                <TabsTrigger value="accident">Accident</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              {/* Contact Tab */}
              <TabsContent value="contact" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer_full_name">Customer Full Name *</Label>
                    <Input
                      id="customer_full_name"
                      value={formData.customer_full_name}
                      onChange={(e) => handleInputChange('customer_full_name', e.target.value)}
                      placeholder="John Doe"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone_number">Phone Number *</Label>
                    <Input
                      id="phone_number"
                      value={formData.phone_number}
                      onChange={(e) => handleInputChange('phone_number', e.target.value)}
                      placeholder="(555) 123-4567"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="customer@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead_vendor">Lead Vendor *</Label>
                    <Select value={formData.lead_vendor} onValueChange={(value) => handleInputChange('lead_vendor', value)}>
                      <SelectTrigger id="lead_vendor">
                        <SelectValue placeholder="Select lead vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorOptions.map(vendor => (
                          <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date_of_birth">Date of Birth</Label>
                    <Input
                      id="date_of_birth"
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="age">Age</Label>
                    <Input
                      id="age"
                      type="number"
                      value={formData.age}
                      onChange={(e) => handleInputChange('age', e.target.value)}
                      placeholder="35"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="street_address">Street Address</Label>
                  <Input
                    id="street_address"
                    value={formData.street_address}
                    onChange={(e) => handleInputChange('street_address', e.target.value)}
                    placeholder="123 Main Street"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="Los Angeles"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Select value={formData.state} onValueChange={(value) => handleInputChange('state', value)}>
                      <SelectTrigger id="state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(state => (
                          <SelectItem key={state.code} value={state.code}>{state.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip_code">Zip Code</Label>
                    <Input
                      id="zip_code"
                      value={formData.zip_code}
                      onChange={(e) => handleInputChange('zip_code', e.target.value)}
                      placeholder="90001"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Accident Tab */}
              <TabsContent value="accident" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="accident_date">Accident Date</Label>
                    <Input
                      id="accident_date"
                      type="date"
                      value={formData.accident_date}
                      onChange={(e) => handleInputChange('accident_date', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accident_location">Accident Location</Label>
                    <Input
                      id="accident_location"
                      value={formData.accident_location}
                      onChange={(e) => handleInputChange('accident_location', e.target.value)}
                      placeholder="Intersection of Main St and 1st Ave"
                    />
                  </div>
                  {renderTriStateSelect('police_attended', 'Police Attended')}
                  {renderTriStateSelect('insured', 'Insured')}
                  {renderTriStateSelect('other_party_admit_fault', 'Other Party Admitted Fault')}
                  <div className="space-y-2">
                    <Label htmlFor="passengers_count">Passengers Count</Label>
                    <Input
                      id="passengers_count"
                      type="number"
                      value={formData.passengers_count}
                      onChange={(e) => handleInputChange('passengers_count', e.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicle_registration">Vehicle Registration</Label>
                    <Input
                      id="vehicle_registration"
                      value={formData.vehicle_registration}
                      onChange={(e) => handleInputChange('vehicle_registration', e.target.value)}
                      placeholder="ABC1234"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insurance_company">Insurance Company</Label>
                    <Input
                      id="insurance_company"
                      value={formData.insurance_company}
                      onChange={(e) => handleInputChange('insurance_company', e.target.value)}
                      placeholder="State Farm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="third_party_vehicle_registration">Third Party Vehicle Registration</Label>
                    <Input
                      id="third_party_vehicle_registration"
                      value={formData.third_party_vehicle_registration}
                      onChange={(e) => handleInputChange('third_party_vehicle_registration', e.target.value)}
                      placeholder="XYZ5678"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accident_scenario">Accident Scenario</Label>
                  <Textarea
                    id="accident_scenario"
                    value={formData.accident_scenario}
                    onChange={(e) => handleInputChange('accident_scenario', e.target.value)}
                    placeholder="Describe how the accident happened..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="injuries">Injuries</Label>
                  <Textarea
                    id="injuries"
                    value={formData.injuries}
                    onChange={(e) => handleInputChange('injuries', e.target.value)}
                    placeholder="Neck pain, back pain, etc."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="medical_attention">Medical Attention</Label>
                  <Textarea
                    id="medical_attention"
                    value={formData.medical_attention}
                    onChange={(e) => handleInputChange('medical_attention', e.target.value)}
                    placeholder="ER visit, chiropractor, etc."
                    rows={2}
                  />
                </div>
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tag">Tag</Label>
                    <Select
                      value={formData.tag || NO_TAG_VALUE}
                      onValueChange={(value) => handleInputChange('tag', value === NO_TAG_VALUE ? '' : value)}
                    >
                      <SelectTrigger id="tag">
                        <SelectValue placeholder="No tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_TAG_VALUE}>No tag</SelectItem>
                        {LEAD_TAG_OPTIONS.map(tag => (
                          <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="additional_notes">Additional Notes</Label>
                  <Textarea
                    id="additional_notes"
                    value={formData.additional_notes}
                    onChange={(e) => handleInputChange('additional_notes', e.target.value)}
                    placeholder="Any additional information..."
                    rows={4}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : isAttach ? 'Create & Link Lead' : 'Create Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
