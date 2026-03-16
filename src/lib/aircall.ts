import { supabase } from "@/integrations/supabase/client";

interface AircallCall {
  id: number;
  sid: string;
  direct_link: string;
  direction: string;
  status: string;
  started_at: number;
  answered_at: number | null;
  ended_at: number | null;
  duration: number;
  voicemail: string | null;
  recording: string | null;
  raw_digits: string;
  user: {
    id: number;
    name: string;
    email: string;
  } | null;
  contact: unknown;
  number: {
    id: number;
    name: string;
    digits: string;
  } | null;
  comments: Array<{
    id: number;
    content: string;
    posted_at: number;
  }>;
  tags: Array<{
    id: number;
    name: string;
  }>;
}

interface AircallSearchResponse {
  meta: {
    total: number;
    before: number;
    after: number;
  };
  paginated: boolean;
  calls: AircallCall[];
}

export const searchAircallCalls = async (
  phoneNumber: string,
  fromTimestamp?: number,
  toTimestamp?: number
): Promise<AircallCall[]> => {
  try {
    // Clean phone number - remove non-digit characters except leading 1
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Add leading 1 if not present (for US numbers)
    if (!cleanNumber.startsWith('1') && cleanNumber.length === 10) {
      cleanNumber = '1' + cleanNumber;
    }

    // Get Aircall API key from environment
    const apiKey = import.meta.env.VITE_AIRCALL_API_KEY;
    const aircallApiId = import.meta.env.VITE_AIRCALL_API_ID;

    if (!apiKey || !aircallApiId) {
      console.error('Aircall API credentials not configured');
      return [];
    }

    // Calculate timestamp for date range (default to last 6 months if not provided)
    const from = fromTimestamp || (Math.floor(Date.now() / 1000) - (180 * 24 * 60 * 60));
    const to = toTimestamp || Math.floor(Date.now() / 1000);

    // Search calls using the phone number
    const response = await fetch(
      `https://api.aircall.io/v1/calls?phone_number=${cleanNumber}&from=${from}&to=${to}&order=desc&per_page=50`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(`${aircallApiId}:${apiKey}`)}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('Aircall API error:', response.statusText);
      return [];
    }

    const data: AircallSearchResponse = await response.json();
    
    // Filter calls to match phone number (same logic as Edge Function)
    const normalizedPhone = cleanNumber.slice(-10);
    const matchingCalls = (data.calls || []).filter(call => {
      // Check raw_digits
      const callRawDigits = call.raw_digits?.replace(/\D/g, '').slice(-10);
      if (callRawDigits === normalizedPhone) return true;
      
      // Check contact phone numbers
      if (call.contact && typeof call.contact === 'object') {
        const contact = call.contact as any;
        if (contact.phone_numbers) {
          for (const phone of contact.phone_numbers) {
            const phoneDigits = phone.value?.replace(/\D/g, '').slice(-10);
            if (phoneDigits === normalizedPhone) return true;
          }
        }
      }
      
      return false;
    });
    
    return matchingCalls;
  } catch (error) {
    console.error('Error searching Aircall calls:', error);
    return [];
  }
};

export const getAircallCallDetails = async (callId: number): Promise<AircallCall | null> => {
  try {
    const apiKey = import.meta.env.VITE_AIRCALL_API_KEY;
    const aircallApiId = import.meta.env.VITE_AIRCALL_API_ID;

    if (!apiKey || !aircallApiId) {
      console.error('Aircall API credentials not configured');
      return null;
    }

    const response = await fetch(
      `https://api.aircall.io/v1/calls/${callId}?fetch_contact=true&fetch_call_timeline=true`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(`${aircallApiId}:${apiKey}`)}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('Aircall API error:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data.call || null;
  } catch (error) {
    console.error('Error fetching Aircall call details:', error);
    return null;
  }
};

export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleString();
};
