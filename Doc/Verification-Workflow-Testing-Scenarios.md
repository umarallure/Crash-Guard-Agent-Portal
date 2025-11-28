# Verification Workflow Testing Scenarios

This document outlines detailed testing scenarios for both Buffer-to-Licensed Agent and Direct Licensed Agent workflows in the Crash Guard Automation Portal. Each scenario includes expected actions, status transitions, and UI/notification outcomes.

---

## 1. Buffer-to-Licensed Agent Workflow

### Scenario 1: Start Verification as Buffer Agent
- **Action:** Buffer agent starts a verification session.
- **Expected:**
  - Session status is set to `in_progress`.
  - Buffer agent panel displays all verification fields.
  - Progress bar and timer are visible.

### Scenario 2: Buffer Agent - Call Dropped
- **Action:** Buffer agent clicks "Call Dropped".
- **Expected:**
  - Session status changes to `call_dropped`.
  - Alert and toast shown: "Call with client dropped. Need to reconnect."
  - Dashboard displays session as "Call Dropped" in red.
  - Any agent can claim the dropped call.

### Scenario 3: Buffer Agent - Call Done
- **Action:** Buffer agent clicks "Call Done".
- **Expected:**
  - Session status changes to `buffer_done`.
  - Buffer agent is freed from the call (can take new calls).
  - No notification sent.
  - Dashboard shows session as "Buffer Done" (if implemented).

### Scenario 4: Buffer Agent - Transfer to Licensed Agent
- **Action:** Buffer agent clicks "Transfer to LA".
- **Expected:**
  - Session status changes to `transferred`.
  - Toast shown: "Verification Complete. Lead is now ready for Licensed Agent review."
  - Dashboard displays session as "Transferred".
  - Licensed agent can claim the transfer.

### Scenario 5: Claim Dropped Call from Dashboard
- **Action:** Any agent clicks "Claim Dropped Call" on dashboard.
- **Expected:**
  - Session is assigned to the claiming agent.
  - Status changes to `in_progress`.
  - Verification panel opens for the new agent.

---

## 2. Direct Licensed Agent Workflow

### Scenario 1: Start Verification as Licensed Agent
- **Action:** Licensed agent starts a direct verification session.
- **Expected:**
  - Session status is set to `in_progress`.
  - Licensed agent panel displays all verification fields.
  - Progress bar and timer are visible.

### Scenario 2: Licensed Agent - Call Dropped
- **Action:** Licensed agent clicks "Call Dropped".
- **Expected:**
  - Session status changes to `call_dropped`.
  - Alert and toast shown: "Call with client dropped. Need to reconnect."
  - Dashboard displays session as "Call Dropped" in red.
  - Any licensed agent can claim the dropped call.

### Scenario 3: Licensed Agent - Call Done
- **Action:** Licensed agent clicks "Call Done".
- **Expected:**
  - Session status changes to `la_done`.
  - Licensed agent is freed from the call.
  - No notification sent.
  - Dashboard shows session as "LA Done" (if implemented).

### Scenario 4: Licensed Agent - Transfer to Other Licensed Agent
- **Action:** Licensed agent clicks "Transfer to Other Licensed Agent".
- **Expected:**
  - Session status changes to `ready_for_transfer`.
  - Toast shown: "Session is now available for other licensed agents to claim."
  - Dashboard displays session as "Ready for Transfer".
  - Other licensed agents can claim the transfer.

### Scenario 5: Claim Dropped Call from Dashboard
- **Action:** Any licensed agent clicks "Claim Dropped Call" on dashboard.
- **Expected:**
  - Session is assigned to the claiming agent.
  - Status changes to `in_progress`.
  - Verification panel opens for the new agent.

---

## 3. General UI/Notification Checks
- Progress bar updates in real time.
- Status badges and colors reflect current session status.
- All toast and alert messages display as described.
- Dashboard claim buttons work for dropped and transferred calls.
- Session assignment and status transitions are tracked in the database.

---

## 5. Audit & Tracking
- All status changes should be auditable in the database (check session status history if available).
- UI should reflect the latest session state after each action.

