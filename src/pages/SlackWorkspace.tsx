import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, MessageSquare, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const SLACK_URL = import.meta.env.VITE_SLACK_WORKSPACE_URL || 'https://app.slack.com';

const SetupGuide = () => (
  <div className="flex items-start justify-center min-h-[calc(100vh-3.5rem)] p-6 bg-background overflow-y-auto">
    <div className="w-full max-w-2xl space-y-4">

      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-amber-800 dark:text-amber-400 text-base">One-time browser setup required</CardTitle>
          </div>
          <CardDescription className="text-amber-700 dark:text-amber-500">
            Slack blocks embedding in other apps by default. Follow the steps below to enable it — only needs to be done once per machine.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0 text-xs font-bold">1</Badge>
            <CardTitle className="text-base">Install the Requestly extension</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Requestly modifies browser response headers in real-time, allowing Slack to load inside this page.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href="https://chromewebstore.google.com/detail/requestly/mdnleldcmiljblolnjhpnblkcekpdkpa" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-3 w-3" />
                Chrome / Edge
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="https://addons.mozilla.org/en-US/firefox/addon/requestly/" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-3 w-3" />
                Firefox
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0 text-xs font-bold">2</Badge>
            <CardTitle className="text-base">Create a "Modify Headers" rule</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Open the Requestly dashboard and create a new rule with these exact settings:</p>
          <div className="rounded-md bg-muted p-4 space-y-2 text-sm font-mono">
            <div><span className="text-muted-foreground">Rule Type:</span> <span className="font-semibold">Modify Headers</span></div>
            <div><span className="text-muted-foreground">URL condition:</span> <span className="font-semibold">Contains → app.slack.com</span></div>
            <div className="pt-1 border-t">
              <div className="text-muted-foreground mb-1">Response Headers:</div>
              <div className="pl-2">Remove → <span className="font-semibold text-destructive">X-Frame-Options</span></div>
              <div className="pl-2">Remove → <span className="font-semibold text-destructive">Content-Security-Policy</span></div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Save the rule and make sure it is enabled (green toggle).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0 text-xs font-bold">3</Badge>
            <CardTitle className="text-base">Log into Slack in a separate tab first</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Browsers block third-party cookies inside iframes. To avoid a login loop, open Slack in a normal tab and sign in first.
            Once you're logged in there, come back here and refresh — the iframe will pick up your session automatically.
          </p>
          <Button asChild size="sm" variant="outline">
            <a href={SLACK_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-3 w-3" />
              Open Slack to log in
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0 text-xs font-bold">4</Badge>
            <CardTitle className="text-base">Refresh this page</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            After installing the extension and logging in, refresh this page. Slack will load fully embedded.
          </p>
          <Button size="sm" onClick={() => window.location.reload()}>
            Refresh now
          </Button>
        </CardContent>
      </Card>

      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <CardTitle className="text-sm text-green-800 dark:text-green-400">For teams (50+ users)</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Use <strong>Chrome Enterprise Policies</strong> to force-install Requestly and push the header rule automatically to all managed devices — so agents never have to set this up manually.
          </p>
        </CardContent>
      </Card>

    </div>
  </div>
);

const SlackWorkspace = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) {
        setIsBlocked(true);
        setIsLoading(false);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [isLoading]);

  if (isBlocked) {
    return <SetupGuide />;
  }

  return (
    <div className="relative h-full w-full bg-background">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Loading Slack...</p>
        </div>
      )}

      <div className="h-full w-full flex flex-col">
        <div className="flex-1 relative">
          <iframe
            src={SLACK_URL}
            title="Slack Workspace"
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
            allow="microphone; camera; autoplay; clipboard-read; clipboard-write; display-capture"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setIsBlocked(true);
            }}
          />
        </div>

        <div className="border-t bg-muted/30 px-4 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3 w-3" />
              <span>Slack Integration</span>
            </div>
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="h-5 text-xs px-1">
                <a href={SLACK_URL} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Open in new tab
                </a>
              </Button>
              <span>Logged in as: {user?.email}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlackWorkspace;
