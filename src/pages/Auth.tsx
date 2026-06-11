import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getPortalRoleFlags, isCenterUser, isRestrictedUser } from '@/lib/userPermissions';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { LayeredText } from '@/components/ui/layered-text';

const heroLines = [
  { top: ' ', bottom: 'LEADS' },
  { top: 'LEADS', bottom: 'CALLS' },
  { top: 'CALLS', bottom: 'DEALS' },
  { top: 'DEALS', bottom: 'CLOSING' },
  { top: 'CLOSING', bottom: 'PAYOUTS' },
  { top: 'PAYOUTS', bottom: 'COMMISSION' },
  { top: 'COMMISSION', bottom: ' ' },
];

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signOut, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const ensureAgentRoleOrSignOut = useCallback(async (userId: string): Promise<boolean> => {
    const allowedRoles = new Set(["agent", "admin", "super_admin"]);
    const client = (await import('@/integrations/supabase/client')).supabase;
    const untypedClient = client as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: { role?: string | null } | null; error: unknown }>;
          };
        };
      };
    };

    const { data: appUser, error: appUserError } = await untypedClient
      .from('app_users')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    const roleFromAppUsers = appUserError ? null : (appUser?.role as string | null | undefined);
    const hasAllowedRoleInAppUsers = roleFromAppUsers ? allowedRoles.has(roleFromAppUsers) : false;

    if (hasAllowedRoleInAppUsers) {
      return true;
    }

    const { data: userRole, error: userRoleError } = await client
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .in('role', Array.from(allowedRoles))
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (appUserError || userRoleError || !userRole) {
      await signOut();
      toast({
        title: 'Access denied',
        description: 'To login, please contact an admin!',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  }, [signOut, toast]);

  useEffect(() => {
    const checkUserRedirect = async () => {
      if (user) {
        const canAccess = await ensureAgentRoleOrSignOut(user.id);
        if (!canAccess) return;
        const roleFlags = await getPortalRoleFlags(user.id);
        const isCenter = await isCenterUser(user.id);
        if (isCenter) {
          navigate('/center-lead-portal');
        } else if (isRestrictedUser(user.id)) {
          navigate('/daily-deal-flow');
        } else if (roleFlags.isAdmin) {
          navigate('/scoreboard-dashboard');
        } else if (roleFlags.canAccessTaskManagement) {
          navigate('/task-management');
        } else {
          navigate('/closer-portal');
        }
      }
    };

    checkUserRedirect();
  }, [user, navigate, ensureAgentRoleOrSignOut]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error, user: signedInUser } = await signIn(email, password);
    if (!error && signedInUser) {
      const canAccess = await ensureAgentRoleOrSignOut(signedInUser.id);
      if (canAccess) {
        toast({
          title: 'Welcome back!',
          description: 'You have been signed in successfully.',
        });
      }
    }
    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen w-full bg-black text-white">
      {/* ── Left: sign-in form ─────────────────────────────────────────── */}
      <section className="flex w-full flex-col px-6 py-10 sm:px-10 lg:w-1/2 lg:px-16 xl:px-24">
        <header>
          <img src="/assets/logo.svg" alt="Accident Payments" className="h-8 w-auto" />
        </header>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Welcome back
              </h1>
              <p className="text-sm leading-relaxed text-white/55">
                Sign in with your email to access your workspace.
              </p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSignIn}>
              <div className="space-y-2">
                <label htmlFor="login-email" className="text-sm font-medium text-white/70">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@accidentpayments.com"
                  autoComplete="email"
                  required
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white placeholder:text-white/30 transition-colors focus:border-[#ae4010]/60 focus:bg-white/[0.06] focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="login-password" className="text-sm font-medium text-white/70">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 pr-12 text-sm text-white placeholder:text-white/30 transition-colors focus:border-[#ae4010]/60 focus:bg-white/[0.06] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/40 transition-colors hover:text-white/80"
                  >
                    {showPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ae4010] px-4 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#7c2c0a] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ boxShadow: '0 12px 28px rgba(174, 64, 16, 0.4)' }}
              >
                {isLoading && <Loader2 className="h-5 w-5 animate-spin text-white" />}
                <span>{isLoading ? 'Signing in…' : 'Sign in'}</span>
              </button>
            </form>

            <div className="mt-6 h-px w-full bg-white/10" />
            <p className="mt-4 text-center text-xs leading-relaxed text-white/45">
              By signing in, you agree to our{' '}
              <Link
                to="/terms"
                className="text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline"
              >
                Terms &amp; Conditions
              </Link>{' '}
              and our{' '}
              <Link
                to="/privacy-policy"
                className="text-white/70 underline-offset-2 transition-colors hover:text-white hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <p className="text-sm leading-relaxed text-white/55">
                <span className="font-medium text-white/80">Need access?</span> Contact your
                administrator to have your workspace provisioned.
              </p>
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-3 pt-8 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Accident Payments. All rights reserved.</span>
          <span className="flex items-center gap-4">
            <Link to="/privacy-policy" className="transition-colors hover:text-white/70">
              Privacy Policy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-white/70">
              Terms &amp; Conditions
            </Link>
          </span>
        </footer>
      </section>

      {/* ── Right: branded hero with tilted portal preview ─────────────── */}
      <section className="relative hidden p-3 lg:block lg:w-1/2">
        <div className="relative h-full w-full overflow-hidden rounded-[28px] ring-1 ring-white/10">
          {/* background image */}
          <img
            src="/assets/bg.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* darkening gradient for depth + legibility */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/30" />

          {/* pulsating "Agent Portal" tag (top-left) */}
          <div className="absolute left-5 top-5 z-20 flex items-center gap-2.5 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f7c480] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#f7c480]" />
            </span>
            Agent Portal
          </div>

          {/* "All Systems Operational" tag (bottom-right) */}
          <div className="absolute bottom-5 right-5 z-20 flex items-center gap-2.5 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            All Systems Operational
          </div>

          {/* centered layered-text hero */}
          <div className="absolute inset-0 flex items-center justify-center px-8 xl:px-12">
            <LayeredText
              lines={heroLines}
              className="text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.45)] animate-in fade-in duration-1000"
              fontSize="58px"
              fontSizeMd="36px"
              lineHeight={50}
              lineHeightMd={32}
              baseOffset={32}
              baseOffsetMd={20}
            />
          </div>
        </div>
      </section>
    </div>
  );
};

export default Auth;
