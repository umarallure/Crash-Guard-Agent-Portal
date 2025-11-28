# Crash Guard Automation Agents Portal

## Overview
The Crash Guard Automation Agents Portal is a web application designed to streamline insurance lead verification workflows for agents. It supports both Buffer-to-Licensed Agent and Direct Licensed Agent processes, integrates with Supabase for backend operations, and automates notifications and Google Sheets updates for lead management.

---

## Features

### 1. Verification Workflow
- **Buffer Agent Workflow**: Buffer agents initiate verification sessions, handle call drops, and transfer leads to licensed agents.
- **Licensed Agent Workflow**: Licensed agents can claim transferred leads, handle direct verifications, and process dropped calls.
- **Session Statuses**: Real-time status updates including `in_progress`, `call_dropped`, `buffer_done`, `transferred`, `ready_for_transfer`, `la_done`.
- **Claiming Mechanism**: Agents can claim dropped or transferred calls via dashboard modals.
- **Audit & Tracking**: All status changes are tracked and auditable in the database.

### 2. Dashboard & UI
- **Verification Dashboard**: Displays all active sessions, their statuses, and available actions (claim, transfer, etc.).
- **Modal Popups**: Separate modals for claiming dropped calls and licensed agent transfers for improved UX.
- **Progress Bar & Timer**: Real-time progress indicators for ongoing sessions.
- **Status Badges**: Color-coded badges for session states.
- **Quick Actions**: "New Callback" button for manual lead entry.

### 3. Notifications
- **Slack Integration**: Automated notifications for key events (claim, transfer, reconnect) with custom language.
- **Supabase Functions**: Serverless functions handle notification logic and payload formatting.

### 4. New Callback Feature
- **Manual Lead Entry**: Agents can create new leads from the dashboard.
- **Google Sheets Sync**: New callback entries are inserted at the top of the sheet, with all required and optional fields mapped.
- **Unique Submission IDs**: Callback entries use `CB{timestamp}{random}` format.
- **Seamless Workflow**: Callback leads are processed through the same call result form as regular leads.

### 5. Google Sheets Integration
- **Column Mapping**: Data is mapped to specific columns as per `GOOGLE_SHEETS_MAPPING.md`.
- **Notes Column**: Combines all optional information for callbacks.
- **Environment Variables**: Requires Google Sheets API key and Spreadsheet ID.

---

## File Structure
```
Agents-Portal/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── VerificationDashboard.tsx
│   │   ├── ClaimDroppedCallModal.tsx
│   │   ├── ClaimLicensedAgentModal.tsx
│   │   └── ...
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── NewCallback.tsx
│   │   ├── CallResultUpdate.tsx
│   │   └── ...
│   ├── integrations/
│   │   └── supabase/
│   └── lib/
├── supabase/
│   ├── functions/
│   │   ├── center-transfer-notification/index.ts
│   │   ├── create-new-callback-sheet/index.ts
│   │   └── ...
│   ├── migrations/
│   └── config.toml
├── package.json
├── README.md
└── ...
```

---

## Key Components & Files

### Frontend (React)
- `src/components/VerificationDashboard.tsx`: Main dashboard logic, session table, claim button, modal integration.
- `src/components/ClaimDroppedCallModal.tsx`: Modal for claiming dropped calls (workflow selector, agent dropdowns).
- `src/components/ClaimLicensedAgentModal.tsx`: Modal for licensed agent claims.
- `src/pages/NewCallback.tsx`: Manual lead entry form.
- `src/pages/CallResultUpdate.tsx`: Call result update form, supports callbacks.
- `src/pages/Dashboard.tsx`: Main dashboard, quick actions, navigation.

### Backend (Supabase Functions)
- `supabase/functions/center-transfer-notification/index.ts`: Handles Slack notifications for claim, transfer, and reconnect events.
- `supabase/functions/create-new-callback-sheet/index.ts`: Inserts new callback entries into Google Sheets.

### Configuration & Mapping
- `GOOGLE_SHEETS_MAPPING.md`: Details column mapping for Google Sheets integration.
- `NEW_CALLBACK_FEATURE.md`: Documentation for the callback workflow.

---

## Setup & Configuration

### 1. Environment Variables
Set in Supabase Project Settings:
- `GOOGLE_SHEETS_API_KEY`: Google Sheets API key
- `GOOGLE_SPREADSHEET_ID`: Google Spreadsheet ID

### 2. Google Sheets API
- Enable Google Sheets API in Google Cloud Console
- Create and restrict API key
- Ensure sheet columns match mapping in `GOOGLE_SHEETS_MAPPING.md`

### 3. Running Locally
- Install dependencies: `npm install`
- Start development server: `npm run dev`
- Supabase functions deploy via CLI or dashboard

---

## Workflow Summary

### Buffer-to-Licensed Agent
1. Buffer agent starts session (`in_progress`)
2. Can drop call (`call_dropped`), done (`buffer_done`), or transfer to LA (`transferred`)
3. Any agent can claim dropped call; licensed agent can claim transfer
4. Status and assignment update in real time; notifications sent as needed

### Direct Licensed Agent
1. Licensed agent starts session (`in_progress`)
2. Can drop call (`call_dropped`), done (`la_done`), or transfer to other LA (`ready_for_transfer`)
3. Other licensed agents can claim transfer or dropped call
4. Status and assignment update in real time; notifications sent as needed

### New Callback
1. Agent creates callback via dashboard
2. Lead saved to database and Google Sheets
3. Redirected to call result form for processing

---

## Testing Scenarios
See `Verification-Workflow-Testing-Scenarios.md` for detailed test cases covering:
- Buffer-to-Licensed Agent workflow
- Direct Licensed Agent workflow
- UI/notification checks
- Audit & tracking

---

## Audit & Tracking
- All session status changes are tracked in the database
- UI reflects latest session state after each action
- Google Sheets updated for new callbacks and call results

---

## Notes
- Callback entries are marked with "New Callback" status in Google Sheets
- Submission IDs for callbacks start with "CB" prefix
- All call result functionality works with callback entries
- Notification language is customizable via Supabase functions

---

## Contributors
- Project Owner: umarallure
- Main Technologies: React, Supabase, Deno, Slack API, Google Sheets API

---

## References
- [NEW_CALLBACK_FEATURE.md](NEW_CALLBACK_FEATURE.md)
- [GOOGLE_SHEETS_MAPPING.md](GOOGLE_SHEETS_MAPPING.md)
- [Verification-Workflow-Testing-Scenarios.md](Verification-Workflow-Testing-Scenarios.md)

---

## License
This project is proprietary and intended for internal use by Crash Guard Automation Portal agents and administrators.
