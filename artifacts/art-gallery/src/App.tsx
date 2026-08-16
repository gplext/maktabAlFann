import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import ArtCollection from "@/pages/art-collection";
import ArtworkDetail from "@/pages/artwork-detail";
import Artists from "@/pages/artists";
import ArtistProfile from "@/pages/artist-profile";
import Cart from "@/pages/cart";
import About from "@/pages/about";
import SpecialtyArt from "@/pages/specialty-art";
import Shop from "@/pages/shop";
import Admin from "@/pages/admin";
import AdminLogin from "@/pages/admin-login";
import ArtistPortal from "@/pages/artist-portal";
import ArtistPortalRegister from "@/pages/artist-portal-register";
import ArtistPortalSubmit from "@/pages/artist-portal-submit";
import GalleryPortalPage from "@/pages/gallery-portal-page";
import Portals from "@/pages/portals";
import CollectorPortal from "@/pages/collector-portal";
import { TopNav } from "@/components/top-nav";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#7B2435",
    colorForeground: "#3D3127",
    colorMutedForeground: "#7A6E65",
    colorDanger: "#B91C1C",
    colorBackground: "#F5F0E8",
    colorInput: "#EDE8E0",
    colorInputForeground: "#3D3127",
    colorNeutral: "#DAD3C8",
    fontFamily: "'Cinzel', serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#F5F0E8] border border-[#DAD3C8] w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#7B2435] font-display tracking-wide",
    headerSubtitle: "text-[#7A6E65]",
    socialButtonsBlockButtonText: "text-[#3D3127]",
    formFieldLabel: "text-[#3D3127] text-sm uppercase tracking-widest",
    footerActionLink: "text-[#7B2435] hover:text-[#B8860B]",
    footerActionText: "text-[#7A6E65]",
    dividerText: "text-[#7A6E65]",
    identityPreviewEditButton: "text-[#7B2435]",
    formFieldSuccessText: "text-green-700",
    alertText: "text-[#3D3127]",
    logoBox: "mb-2",
    logoImage: "w-16 h-16 mx-auto",
    socialButtonsBlockButton: "border border-[#DAD3C8] bg-[#EDE8E0] hover:bg-[#E5DED5]",
    formButtonPrimary: "bg-[#7B2435] hover:bg-[#6B1E2E] text-[#F5F0E8] uppercase tracking-widest font-display",
    formFieldInput: "bg-[#EDE8E0] border-[#DAD3C8] text-[#3D3127]",
    footerAction: "bg-[#F5F0E8]",
    dividerLine: "bg-[#DAD3C8]",
    alert: "bg-[#EDE8E0] border-[#DAD3C8]",
    otpCodeFieldInput: "bg-[#EDE8E0] border-[#DAD3C8] text-[#3D3127]",
    formFieldRow: "mb-4",
    main: "bg-[#F5F0E8]",
  },
};

function SignInPage() {
  const after = new URLSearchParams(window.location.search).get("after");
  const redirectProps = after
    ? { forceRedirectUrl: `${basePath}${after}` }
    : { fallbackRedirectUrl: basePath || "/" };
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-primary tracking-widest mb-2">Maktaba Al-Fann</h1>
          <div className="w-16 h-px bg-secondary mx-auto mb-4" />
          <p className="text-foreground/60 italic text-sm">Sign in to enquire about our collection</p>
        </div>
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} {...redirectProps} />
      </div>
    </div>
  );
}

function SignUpPage() {
  const after = new URLSearchParams(window.location.search).get("after");
  const redirectProps = after
    ? { forceRedirectUrl: `${basePath}${after}` }
    : { fallbackRedirectUrl: basePath || "/" };
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-primary tracking-widest mb-2">Maktaba Al-Fann</h1>
          <div className="w-16 h-px bg-secondary mx-auto mb-4" />
          <p className="text-foreground/60 italic text-sm">Create an account to begin your collection journey</p>
        </div>
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} {...redirectProps} />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function Router() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/art" component={ArtCollection} />
          <Route path="/art/:id" component={ArtworkDetail} />
          <Route path="/artists" component={Artists} />
          <Route path="/artists/:id" component={ArtistProfile} />
          <Route path="/specialty" component={SpecialtyArt} />
          <Route path="/shop" component={Shop} />
          <Route path="/cart" component={Cart} />
          <Route path="/about" component={About} />
          <Route path="/admin/login" component={AdminLogin} />
          <Route path="/admin" component={Admin} />
          <Route path="/portals" component={Portals} />
          <Route path="/collector" component={CollectorPortal} />
          <Route path="/artist-portal/register" component={ArtistPortalRegister} />
          <Route path="/artist-portal/submit" component={ArtistPortalSubmit} />
          <Route path="/artist-portal" component={ArtistPortal} />
          <Route path="/gallery-portal" component={GalleryPortalPage} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl || undefined}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}

      localization={{
        signIn: {
          start: {
            title: "Welcome Back",
            subtitle: "Sign in to access your collection",
          },
        },
        signUp: {
          start: {
            title: "Begin Your Journey",
            subtitle: "Create an account to enquire about our artworks",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
