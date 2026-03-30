import { useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { MessageSquare, ExternalLink, X, Loader2, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const SLACK_URL = import.meta.env.VITE_SLACK_WORKSPACE_URL || 'https://app.slack.com';

const SlackWorkspace = () => {
  const { user } = useAuth();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const slackWindowRef = useRef<Window | null>(null);

  // ─── Sidecar popup logic ───────────────────────────────────────────────────
  const openSlackPopup = () => {
    // If window is already open, just focus it — don't open a duplicate
    if (slackWindowRef.current && !slackWindowRef.current.closed) {
      slackWindowRef.current.focus();
      return;
    }

    const width  = 400;
    const height = window.screen.height;
    const left   = window.screen.width - width;
    const top    = 0;

    // Classic features string — Chrome opens this as a popup window, not a tab
    const features = [
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      'scrollbars=yes',
      'resizable=yes',
    ].join(',');

    const win = window.open(SLACK_URL, 'SlackSidecar', features);
    slackWindowRef.current = win;
  };

  // ─── Sliding iframe panel logic ────────────────────────────────────────────
  const openPanel = () => {
    setIsLoading(true);
    setIsPanelOpen(true);
    setTimeout(() => setIsLoading(false), 8000);
  };

  const closePanel = () => setIsPanelOpen(false);

  const isPopupOpen = slackWindowRef.current && !slackWindowRef.current.closed;

  return (
    <>
      {/* ── Launcher page ───────────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] p-6 bg-background">
        <div className="w-full max-w-md space-y-6 text-center">

          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-[#4A154B] flex items-center justify-center shadow-lg">
              <MessageSquare className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Slack</h1>
              <p className="text-sm text-muted-foreground mt-1">Open your team workspace</p>
            </div>
          </div>

          <Card className="border-2">
            <CardContent className="pt-6 pb-6 space-y-3">

              {/* Option 1 — Popup window (sidecar) */}
              <Button
                className="w-full h-12 text-base bg-[#4A154B] hover:bg-[#3d1040] text-white"
                onClick={openSlackPopup}
              >
                <MessageSquare className="mr-2 h-5 w-5" />
                {isPopupOpen ? 'Focus Slack Window' : 'Open Slack Side Panel'}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or embed in portal</span>
                </div>
              </div>

              {/* Option 2 — Sliding iframe panel */}
              <Button variant="outline" className="w-full" onClick={openPanel}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Open Slack Panel (embedded)
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
              </div>

              {/* Option 3 — New tab */}
              <Button variant="ghost" className="w-full" onClick={() => window.open(SLACK_URL, '_blank')}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in New Tab
              </Button>

            </CardContent>
          </Card>

          <div className="border-t pt-4 text-xs text-muted-foreground">
            Logged in as: {user?.email}
          </div>
        </div>
      </div>

      {/* ── Sliding iframe panel ─────────────────────────────────────────── */}
      <div
        className={`fixed top-0 right-0 h-full z-50 flex transition-all duration-300 ease-in-out ${
          isPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: '540px' }}
      >
        {/* Collapse tab */}
        <button
          onClick={closePanel}
          className="absolute -left-8 top-1/2 -translate-y-1/2 bg-[#4A154B] text-white rounded-l-lg p-2 shadow-lg hover:bg-[#3d1040] transition-colors"
          title="Close Slack panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="w-full h-full bg-white shadow-2xl border-l flex flex-col">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-[#4A154B]">
            <div className="flex items-center gap-2 text-white">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm font-semibold">Slack</span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-white/80 hover:text-white hover:bg-white/10">
                <a href={SLACK_URL} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  New tab
                </a>
              </Button>
              <button onClick={closePanel} className="text-white/80 hover:text-white p-1 rounded transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* iframe */}
          <div className="flex-1 relative">
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                <Loader2 className="h-8 w-8 animate-spin text-[#4A154B] mb-3" />
                <p className="text-sm text-muted-foreground">Loading Slack...</p>
              </div>
            )}
            <iframe
              src={SLACK_URL}
              title="Slack"
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
              allow="microphone; camera; autoplay; clipboard-read; clipboard-write"
              onLoad={() => setIsLoading(false)}
            />
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isPanelOpen && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={closePanel} />
      )}
    </>
  );
};

export default SlackWorkspace;
