import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, Chrome } from 'lucide-react';

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
  });
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');

  // Redirect if already authenticated (avoid state updates during render)
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(formData.email, formData.password);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Successfully signed in!');
      navigate('/');
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signUp(formData.email, formData.password, formData.fullName);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Account created successfully! You can now sign in.');
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const { error } = await signInWithGoogle();
    
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
    // Don't set loading to false here as user will be redirected
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-background">
      {/* Left hero pane (desktop) */}
      <div className="relative hidden lg:flex flex-col justify-between bg-gray-900 p-8 text-white">
        <div className="absolute inset-0 z-0">
          <img
            alt="Sales CRM hero"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuD55p0cPDVPEvDBDDjDjuQQvkzkjx3Q58jQ3u0TTKC2z9zOSt1htKrom1aqhchiN-6XEUZsJJdYY6rvdHcQH1zcp-UKLV24dRORSppjf3-G0SH1xKiZZd8nq8eEF3hloA3v1LE8TiizLJAy8cTYwq6rePe2xU3rHZM6qaDJG8WvVJ-WeArpBsSUjthVKbv3l0IMQaNZxe5JodZr1z9jdFCbLKkpFeTHfRP0jkZlMVq1GN9NAvg2nidvV4PQQUG2A17PY-PuqtHx0uS2"
            className="h-full w-full object-cover opacity-30"
          />
        </div>
        <div className="relative z-10 flex items-center gap-2">
          <img
            src="/lovable-uploads/5dc53a1f-9dd0-4780-84e9-823a8105b510.png"
            alt="Naviku Logo"
            className="h-10 w-auto"
          />
          <span className="text-xl font-bold">Naviku CRM</span>
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl font-black leading-tight tracking-tight">Empowering Your Sales Growth.</h1>
          <p className="mt-2 max-w-md text-base font-normal text-gray-300">
            Log in to manage your sales pipeline, track leads, and close deals faster.
          </p>
        </div>
      </div>

      {/* Right form pane */}
      <div className="flex w-full items-center justify-center bg-background p-6 sm:p-8">
        <div className="w-full max-w-md space-y-8">
          {/* Page Heading changes per tab */}
          {tab === 'signin' ? (
            <div className="flex flex-col gap-1">
              <p className="text-3xl font-black leading-tight tracking-[-0.033em]">Welcome back!</p>
              <p className="text-base text-muted-foreground">Sign in to continue to your dashboard.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-3xl font-black leading-tight tracking-[-0.033em]">Get Started with Naviku</p>
              <p className="text-base text-muted-foreground">Create your free account to unlock your sales potential.</p>
            </div>
          )}

          {/* Tabs control */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'signin' | 'signup')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            {/* Sign In */}
            <TabsContent value="signin" className="space-y-6">
              <form onSubmit={handleSignIn} className="space-y-4">
                <label className="flex flex-col">
                  <p className="pb-2 text-sm font-medium">Email Address</p>
                  <Input
                    id="signin-email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="you@example.com"
                    required
                    className="h-12"
                  />
                </label>

                <label className="flex flex-col">
                  <p className="pb-2 text-sm font-medium">Password</p>
                  <Input
                    id="signin-password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Enter your password"
                    required
                    className="h-12"
                  />
                </label>

                <div className="flex items-center justify-end">
                  <button type="button" className="text-sm underline text-primary">Forgot Password?</button>
                </div>

                <Button type="submit" className="w-full h-12" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Login'
                  )}
                </Button>
              </form>

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Don&apos;t have an account?{' '}
                  <button type="button" className="font-medium text-primary underline" onClick={() => setTab('signup')}>Sign Up</button>
                </p>
              </div>
            </TabsContent>

            {/* Sign Up */}
            <TabsContent value="signup" className="space-y-6">
              <form onSubmit={handleSignUp} className="space-y-4">
                <label className="flex flex-col">
                  <p className="pb-2 text-sm font-medium">Full Name</p>
                  <Input
                    id="signup-name"
                    name="fullName"
                    type="text"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    placeholder="Enter your full name"
                    className="h-12"
                  />
                </label>

                <label className="flex flex-col">
                  <p className="pb-2 text-sm font-medium">Work Email</p>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter your work email"
                    required
                    className="h-12"
                  />
                </label>

                <label className="flex flex-col">
                  <p className="pb-2 text-sm font-medium">Password</p>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Create a strong password"
                    required
                    className="h-12"
                  />
                </label>

                <Button type="submit" className="w-full h-12" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create My Account'
                  )}
                </Button>
              </form>

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <button type="button" className="font-medium text-primary underline" onClick={() => setTab('signin')}>Log in</button>
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* OAuth separator */}
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          {/* Google sign-in */}
          <Button
            variant="outline"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-12"
          >
            <Chrome className="mr-2 h-4 w-4" />
            Google
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Auth;