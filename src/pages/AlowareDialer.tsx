import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Phone, AlertCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const AlowareDialer = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialerUrl = 'https://talk.aloware.com/team-inboxes';

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== new URL(dialerUrl).origin) {
        return;
      }

      console.log('Message from Aloware dialer:', event.data);
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [dialerUrl]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-4 bg-background">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle>Configuration Error</CardTitle>
            </div>
            <CardDescription>Unable to load Aloware Dialer</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4 flex gap-2">
              <Button asChild variant="outline">
                <a href={dialerUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in New Tab
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-background">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Loading Aloware Dialer...</p>
        </div>
      )}

      <div className="h-full w-full flex flex-col">
        <div className="flex-1 relative">
          <iframe
            src={dialerUrl}
            title="Aloware Dialer"
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
            allow="microphone; camera; autoplay; clipboard-read; clipboard-write"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setError('Failed to load the hosted Aloware dialer in this page. If embedding is blocked by Aloware, open it in a new tab.');
            }}
          />
        </div>

        <div className="border-t bg-muted/30 px-4 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3" />
              <span>Aloware Dialer Integration</span>
            </div>
            <span>Logged in as: {user?.email}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlowareDialer;
