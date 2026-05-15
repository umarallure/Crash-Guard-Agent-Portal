import { ExternalLink, Landmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DEEL_URL = "https://www.deel.com";

const DeelPage = () => {
  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6 lg:p-8">
      <Card className="w-full max-w-md border-primary/20 shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
            <Landmark className="h-8 w-8 text-primary" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">Deel Payments</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Manage payments, contracts, and payroll through Deel.
            </p>
          </div>

          <Button asChild>
            <a href={DEEL_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open Deel
            </a>
          </Button>

          <p className="text-[11px] text-muted-foreground">deel.com</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeelPage;
