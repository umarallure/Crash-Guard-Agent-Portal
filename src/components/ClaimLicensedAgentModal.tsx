import React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Agent {
  user_id: string;
  display_name: string;
}

interface ClaimLicensedAgentModalProps {
  open: boolean;
  loading: boolean;
  licensedAgents: Agent[];
  fetchingAgents: boolean;
  claimLicensedAgent: string;
  isRetentionCall: boolean;
  onLicensedAgentChange: (id: string) => void;
  onRetentionCallChange: (value: boolean) => void;
  onCancel: () => void;
  onClaim: () => void;
}

export const ClaimLicensedAgentModal: React.FC<ClaimLicensedAgentModalProps> = ({
  open,
  loading,
  licensedAgents,
  fetchingAgents,
  claimLicensedAgent,
  isRetentionCall,
  onLicensedAgentChange,
  onRetentionCallChange,
  onCancel,
  onClaim,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm dark:bg-black/70">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-lg dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:shadow-black/50">
        <h2 className="mb-4 text-xl font-bold tracking-tight text-slate-950 dark:text-zinc-50">Claim as Licensed Agent</h2>
        <div className="mb-4">
          <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-zinc-200">Select Licensed Agent</label>
          {fetchingAgents ? (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
              <span className="text-sm text-muted-foreground">Loading agents...</span>
            </div>
          ) : (
            <select
              value={claimLicensedAgent}
              onChange={e => onLicensedAgentChange(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-orange-400 dark:focus:ring-orange-400/20"
            >
              <option value="">Select Licensed Agent</option>
              {licensedAgents.map(agent => (
                <option key={agent.user_id} value={agent.user_id}>{agent.display_name}</option>
              ))}
            </select>
          )}
          {licensedAgents.length === 0 && !fetchingAgents && (
            <p className="mt-2 text-sm text-muted-foreground">No licensed agents available. Please ensure licensed agents are registered in the system.</p>
          )}
        </div>
        
        {/* Retention Call Toggle */}
        <div className="mt-4 flex items-center justify-between space-x-2 border-t border-slate-200 pt-4 dark:border-white/10">
          <div className="space-y-0.5">
            <Label htmlFor="licensed-claim-retention" className="text-base text-slate-900 dark:text-zinc-100">
              Mark as Retention Call
            </Label>
            <p className="text-sm text-muted-foreground">
              This claim will be tracked as a retention team call
            </p>
          </div>
          <Switch
            id="licensed-claim-retention"
            checked={isRetentionCall}
            onCheckedChange={onRetentionCallChange}
          />
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onCancel} disabled={loading} className="dark:border-white/15 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10">Cancel</Button>
          <Button onClick={onClaim} disabled={loading || !claimLicensedAgent} className="dark:bg-orange-600 dark:text-white dark:hover:bg-orange-500">
            {loading ? 'Claiming...' : 'Claim & Reconnect'}
          </Button>
        </div>
      </div>
    </div>
  );
};
