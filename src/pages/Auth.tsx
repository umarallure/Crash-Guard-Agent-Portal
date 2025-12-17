import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { isCenterUser } from '@/lib/userPermissions';
import { Loader2, ShieldCheck, Zap, BarChart3, Lock } from 'lucide-react';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const checkUserRedirect = async () => {
      if (user) {
        const isCenter = await isCenterUser(user.id);
        if (isCenter) {
          navigate('/center-lead-portal');
        } else {
          navigate('/dashboard');
        }
      }
    };

    checkUserRedirect();
  }, [user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await signIn(email, password);
    setIsLoading(false);
  };

  return (
    // Replaced 'bg-slate-950' with 'bg-background'
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-background">
      
      {/* --- Ambient Background Effects --- */}
      {/* NOTE: We keep specific colors (indigo/sky/purple) for the decorative blobs 
         to maintain the artistic mesh look, even if the theme changes. 
      */}
      <div className="absolute inset-0 w-full h-full bg-background">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-sky-500/20 blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute top-[20%] right-[20%] w-[30%] h-[30%] rounded-full bg-purple-500/10 blur-[100px]" />
      </div>
      
      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:24px_24px] opacity-10" />

      {/* --- Main Container --- */}
      <div className="relative z-10 w-full max-w-6xl px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-8 items-center">
          
          {/* --- Left Column: Brand & Value --- */}
          <div className="hidden lg:flex flex-col justify-center h-full space-y-8 pr-10">
            <div className="space-y-4">
              {/* Uses bg-primary/10 and text-primary */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium backdrop-blur-sm w-fit">
                <ShieldCheck className="w-3 h-3" />
                <span>Enterprise Grade Security</span>
              </div>
              <h1 className="text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
                Manage leads with <br />
                {/* Uses gradient from primary to sky */}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-sky-400">
                  precision & speed.
                </span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                Your command center for deal flow. Access real-time analytics, manage calls, and track performance in one secure workspace.
              </p>
            </div>

            {/* Feature Cards Grid - Using bg-card/40 and border-border */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-4 rounded-xl bg-card/40 border border-border backdrop-blur-sm hover:bg-card/60 transition-colors duration-300">
                <Zap className="w-6 h-6 text-yellow-400 mb-3" />
                <h3 className="text-foreground font-medium text-sm">Lightning Fast</h3>
                <p className="text-muted-foreground text-xs mt-1">Optimized for high-volume workflows without lag.</p>
              </div>
              <div className="p-4 rounded-xl bg-card/40 border border-border backdrop-blur-sm hover:bg-card/60 transition-colors duration-300">
                <BarChart3 className="w-6 h-6 text-sky-400 mb-3" />
                <h3 className="text-foreground font-medium text-sm">Real-time Data</h3>
                <p className="text-muted-foreground text-xs mt-1">Live dashboards and instant call result tracking.</p>
              </div>
            </div>
          </div>

          {/* --- Right Column: Login Form --- */}
          <div className="flex justify-center lg:justify-end">
            <Card className="w-full max-w-md border-border bg-card/60 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
              {/* Top Highlight Line - Uses primary */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-sky-500" />
              
              <CardHeader className="space-y-1 pb-6 pt-8">
                <CardTitle className="text-2xl font-bold text-center text-foreground">Welcome back</CardTitle>
                <CardDescription className="text-center text-muted-foreground">
                  Enter your credentials to access the portal
                </CardDescription>
              </CardHeader>

              <CardContent className="pb-8">
                <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email" className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                      Work Email
                    </Label>
                    <div className="relative group/input">
                      {/* Inputs use bg-background/50 and border-input */}
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                        className="bg-background/50 border-input text-foreground placeholder:text-muted-foreground/50 h-11 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password" className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                        Password
                      </Label>
                    </div>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        className="bg-background/50 border-input text-foreground h-11 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300"
                      />
                    </div>
                  </div>

                  {/* Button uses generic variant 'default' which maps to bg-primary automatically */}
                  <Button 
                    type="submit" 
                    className="w-full h-11 shadow-lg shadow-primary/20 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <span className="flex items-center gap-2">
                        Sign In <Lock className="w-4 h-4 opacity-70" />
                      </span>
                    )}
                  </Button>
                </form>

                <div className="mt-6 pt-6 border-t border-border/60 text-center">
                  <p className="text-xs text-muted-foreground">
                    Protected by reCAPTCHA and subject to the Privacy Policy and Terms of Service.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default Auth;