import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN');
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const { submissionId, leadData, callResult } = await req.json();
    if (!SLACK_BOT_TOKEN) {
      throw new Error('SLACK_BOT_TOKEN not configured');
    }
    // Lead vendor to Slack channel mapping
    const leadVendorChannelMapping = {
      "Zupax Marketing": "#crash-guard-team-zupax-bpo",
      "Prime BPO":"#crash-guard-team-prime-bpo",
      "Brainiax BPO":"#crash-guard-team-brainiax-bpo",
      "KP Leads":"#crash-guard-team-kp-leads"
    };
    const qualifiedTitles = [
      "Qualified: Missing Information",
      "Qualified: Awaiting Police Report",
      "Qualified: Awaiting to be Signed"
    ];

    const isSubmittedApplication = callResult && callResult.application_submitted === true;
    const candidateStatus = callResult?.status || null;
    const hasCustomStatus = !!candidateStatus;
    const isQualifiedTitle = hasCustomStatus && qualifiedTitles.includes(candidateStatus as string);
    let slackMessage;
    let statusDisplay: string | null = null;
    let headerText: string | null = null;
    // Only send notifications for submitted applications
    if (isSubmittedApplication) {
      // Determine final status based on underwriting field
      const finalStatus = candidateStatus || (callResult.sent_to_underwriting === true ? "Underwriting" : "Submitted");
      statusDisplay = isQualifiedTitle
        ? finalStatus
        : (callResult.sent_to_underwriting === true ? "Sent to Underwriting" : finalStatus || 'Submitted');
      headerText = `✅ ${statusDisplay}`;
      
      // Build accident information section
      const accidentBlocks = [];
      if (callResult.accident_date || callResult.accident_location || callResult.injuries) {
        const accidentDetails = [];
        
        if (callResult.accident_date) {
          accidentDetails.push(`📅 *Date:* ${callResult.accident_date}`);
        }
        
        if (callResult.accident_location) {
          accidentDetails.push(`📍 *Location:* ${callResult.accident_location}`);
        }
        
        if (callResult.accident_scenario) {
          accidentDetails.push(`📝 *Scenario:* ${callResult.accident_scenario}`);
        }
        
        if (callResult.injuries) {
          accidentDetails.push(`🩹 *Injuries:* ${callResult.injuries}`);
        }
        
        if (callResult.medical_attention) {
          accidentDetails.push(`🏥 *Medical:* ${callResult.medical_attention}`);
        }
        
        if (callResult.police_attended !== null && callResult.police_attended !== undefined) {
          accidentDetails.push(`👮 *Police:* ${callResult.police_attended ? 'Yes' : 'No'}`);
        }
        
        if (callResult.insured !== null && callResult.insured !== undefined) {
          accidentDetails.push(`🛡️ *Insured:* ${callResult.insured ? 'Yes' : 'No'}`);
        }
        
        if (callResult.vehicle_registration) {
          accidentDetails.push(`🚗 *Vehicle Reg:* ${callResult.vehicle_registration}`);
        }
        
        if (callResult.insurance_company) {
          accidentDetails.push(`🏢 *Insurance:* ${callResult.insurance_company}`);
        }
        
        if (callResult.third_party_vehicle_registration) {
          accidentDetails.push(`🚙 *3rd Party Vehicle:* ${callResult.third_party_vehicle_registration}`);
        }
        
        if (callResult.other_party_admit_fault !== null && callResult.other_party_admit_fault !== undefined) {
          accidentDetails.push(`⚖️ *Other Party Fault:* ${callResult.other_party_admit_fault ? 'Yes' : 'No'}`);
        }
        
        if (callResult.passengers_count) {
          accidentDetails.push(`👥 *Passengers:* ${callResult.passengers_count}`);
        }
        
        if (callResult.prior_attorney_involved !== null && callResult.prior_attorney_involved !== undefined) {
          accidentDetails.push(`⚖️ *Attorney Involved:* ${callResult.prior_attorney_involved ? 'Yes' : 'No'}`);
        }
        
        if (callResult.prior_attorney_details) {
          accidentDetails.push(`📋 *Attorney Details:* ${callResult.prior_attorney_details}`);
        }
        
        if (accidentDetails.length > 0) {
          accidentBlocks.push({
            type: 'divider'
          });
          accidentBlocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*🚗 Accident Information:*\n${accidentDetails.join('\n')}`
            }
          });
        }
      }
      
      // Template for submitted applications
      slackMessage = {
        channel: '#crash-guard-submission-portal',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: headerText
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Customer:*\n${leadData.customer_full_name || 'N/A'}`
              }
            ]
          },
          
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Status:*\n${statusDisplay}`
              }
            ]
          },
          ...accidentBlocks,
          {
            type: 'divider'
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `🏢 *${callResult.lead_vendor || 'N/A'}* | 🔄 Buffer: *${callResult.buffer_agent || 'N/A'}* | 👤 Agent: *${callResult.agent_who_took_call || 'N/A'}*`
              }
            ]
          }
        ]
      };
    } else {
      // No notification for new leads, only log
      console.log('Skipping notification - only submitted applications trigger Slack messages');
    }
    // Only send Slack message if we have one (for submitted applications)
    let slackResult: any = {
      ok: false
    };
    if (slackMessage) {
      const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(slackMessage)
      });
      slackResult = await slackResponse.json();
      console.log('Slack API Response:', JSON.stringify(slackResult, null, 2));
      if (!slackResult.ok) {
        console.error(`Slack API error: ${slackResult.error}`);
        // If the main channel fails, try with a direct message instead
        if (slackResult.error === 'channel_not_found') {
          console.log('Channel not found, skipping main notification');
        // Don't throw error, just log and continue
        } else {
          throw new Error(`Slack API error: ${slackResult.error}`);
        }
      } else {
        console.log('Slack message sent successfully');
      }
    }
    // Debug logging to check the received data
    console.log('Debug - callResult data:', JSON.stringify(callResult, null, 2));
    console.log('Debug - isSubmittedApplication:', isSubmittedApplication);
    console.log('Debug - callResult.lead_vendor:', callResult?.lead_vendor);
    // Send additional notification to lead vendor specific channel if application is submitted
    if (isSubmittedApplication && callResult.lead_vendor) {
      const vendorChannel = leadVendorChannelMapping[callResult.lead_vendor as keyof typeof leadVendorChannelMapping];
      console.log(`Debug - Looking for vendor: "${callResult.lead_vendor}"`);
      console.log(`Debug - Found channel: ${vendorChannel}`);
      if (vendorChannel) {
        // Calculate status display for vendor message
        const vendorStatusDisplay = statusDisplay
          || (callResult.sent_to_underwriting === true ? "Sent to Underwriting" : (candidateStatus || 'Submitted'));
        const vendorHeaderText = `✅ ${vendorStatusDisplay}`;
        
        // Build accident information section for vendor
        const vendorAccidentBlocks = [];
        if (callResult.accident_date || callResult.accident_location || callResult.injuries) {
          const accidentDetails = [];
          
          if (callResult.accident_date) {
            accidentDetails.push(`📅 *Date:* ${callResult.accident_date}`);
          }
          
          if (callResult.accident_location) {
            accidentDetails.push(`📍 *Location:* ${callResult.accident_location}`);
          }
          
          if (callResult.accident_scenario) {
            accidentDetails.push(`📝 *Scenario:* ${callResult.accident_scenario}`);
          }
          
          if (callResult.injuries) {
            accidentDetails.push(`🩹 *Injuries:* ${callResult.injuries}`);
          }
          
          if (callResult.medical_attention) {
            accidentDetails.push(`🏥 *Medical:* ${callResult.medical_attention}`);
          }
          
          if (callResult.police_attended !== null && callResult.police_attended !== undefined) {
            accidentDetails.push(`👮 *Police:* ${callResult.police_attended ? 'Yes' : 'No'}`);
          }
          
          if (callResult.insured !== null && callResult.insured !== undefined) {
            accidentDetails.push(`🛡️ *Insured:* ${callResult.insured ? 'Yes' : 'No'}`);
          }
          
          if (callResult.vehicle_registration) {
            accidentDetails.push(`🚗 *Vehicle Reg:* ${callResult.vehicle_registration}`);
          }
          
          if (callResult.insurance_company) {
            accidentDetails.push(`🏢 *Insurance:* ${callResult.insurance_company}`);
          }
          
          if (callResult.third_party_vehicle_registration) {
            accidentDetails.push(`🚙 *3rd Party Vehicle:* ${callResult.third_party_vehicle_registration}`);
          }
          
          if (callResult.other_party_admit_fault !== null && callResult.other_party_admit_fault !== undefined) {
            accidentDetails.push(`⚖️ *Other Party Fault:* ${callResult.other_party_admit_fault ? 'Yes' : 'No'}`);
          }
          
          if (callResult.passengers_count) {
            accidentDetails.push(`👥 *Passengers:* ${callResult.passengers_count}`);
          }
          
          if (callResult.prior_attorney_involved !== null && callResult.prior_attorney_involved !== undefined) {
            accidentDetails.push(`⚖️ *Attorney Involved:* ${callResult.prior_attorney_involved ? 'Yes' : 'No'}`);
          }
          
          if (callResult.prior_attorney_details) {
            accidentDetails.push(`📋 *Attorney Details:* ${callResult.prior_attorney_details}`);
          }
          
          if (accidentDetails.length > 0) {
            vendorAccidentBlocks.push({
              type: 'divider'
            });
            vendorAccidentBlocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*🚗 Accident Information:*\n${accidentDetails.join('\n')}`
              }
            });
          }
        }
        
        const vendorSlackMessage = {
          channel: vendorChannel,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: vendorHeaderText
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Customer:*\n${leadData.customer_full_name || 'N/A'}`
                }
              ]
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Status:*\n${vendorStatusDisplay}`
                }
              ]
            },
            
            ...vendorAccidentBlocks
          ]
        };
        try {
          const vendorSlackResponse = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(vendorSlackMessage)
          });
          const vendorSlackResult: any = await vendorSlackResponse.json();
          console.log(`Vendor Slack API Response for ${vendorChannel}:`, JSON.stringify(vendorSlackResult, null, 2));
          if (vendorSlackResult.ok) {
            console.log(`Vendor notification sent to ${vendorChannel} successfully`);
          } else {
            console.error(`Failed to send vendor notification to ${vendorChannel}: ${vendorSlackResult.error}`);
            if (vendorSlackResult.error === 'channel_not_found') {
              console.log(`Channel ${vendorChannel} not found, vendor may need to create it or invite the bot`);
            }
          }
        } catch (vendorError) {
          console.error(`Error sending vendor notification to ${vendorChannel}:`, vendorError);
        }
      } else {
        console.log(`No channel mapping found for lead vendor: "${callResult.lead_vendor}"`);
      }
    } else {
      console.log('Debug - Vendor notification not sent because:');
      console.log(`  - isSubmittedApplication: ${isSubmittedApplication}`);
      console.log(`  - callResult.lead_vendor exists: ${!!callResult?.lead_vendor}`);
      console.log(`  - callResult.lead_vendor value: "${callResult?.lead_vendor}"`);
    }
    return new Response(JSON.stringify({
      success: true,
      messageTs: slackResult?.ts,
      mainChannelSuccess: slackResult?.ok || false,
      vendorNotificationAttempted: isSubmittedApplication && !!callResult?.lead_vendor,
      vendorChannel: isSubmittedApplication && callResult?.lead_vendor ? leadVendorChannelMapping[callResult.lead_vendor as keyof typeof leadVendorChannelMapping] : null
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error: any) {
    console.error('Error in slack-notification:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
