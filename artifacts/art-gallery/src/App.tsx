import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { applyPageMeta, SITE_NAME } from "@/lib/seo";
import { AuthProvider } from "@/lib/auth";
import { PortalGuard } from "@/lib/portal";
import { SignInPage, SignUpPage } from "@/pages/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import SpecialtyArt from "@/pages/specialty-art";
import Shop from "@/pages/shop";
const Admin = lazy(() => import("@/pages/admin"));
const ArtistPortal = lazy(() => import("@/pages/artist-portal"));
const ArtistPortalRegister = lazy(() => import("@/pages/artist-portal-register"));
const ArtistPortalSubmit = lazy(() => import("@/pages/artist-portal-submit"));
const GalleryPortalPage = lazy(() => import("@/pages/gallery-portal-page"));
import Portals from "@/pages/portals";
const CollectorPortal = lazy(() => import("@/pages/collector-portal"));
const StaffConsole = lazy(() => import("@/pages/staff"));
import MuseumPage from "@/pages/museum";
const AccountPage = lazy(() => import("@/pages/account"));
import { TopNav } from "@/components/top-nav";
import { SiteFooter } from "@/components/site-footer";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Private areas (consoles, portals, cart) are kept out of search results. */
const PRIVATE = /^\/(admin|staff|account|cart|museum|portals|collector|artist-portal|gallery-portal|sign-in|sign-up)(\/|$)/;

function Router() {
  const [location] = useLocation();
  useEffect(() => {
    if (PRIVATE.test(location)) applyPageMeta({ title: SITE_NAME, noindex: true });
  }, [location]);
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1">
        <Suspense fallback={<div className="min-h-[50vh]" />}>
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
          <Route path="/contact">{() => <Redirect to="/about#contact" />}</Route>
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route path="/admin/login">{() => <Redirect to="/admin" />}</Route>
          <Route path="/admin" component={Admin} />
          <Route path="/staff" component={StaffConsole} />
          <Route path="/museum" component={MuseumPage} />
          <Route path="/account" component={AccountPage} />
          <Route path="/portals" component={Portals} />
          <Route path="/collector">{() => <PortalGuard><CollectorPortal /></PortalGuard>}</Route>
          <Route path="/artist-portal/register">{() => <PortalGuard><ArtistPortalRegister /></PortalGuard>}</Route>
          <Route path="/artist-portal/submit">{() => <PortalGuard><ArtistPortalSubmit /></PortalGuard>}</Route>
          <Route path="/artist-portal">{() => <PortalGuard><ArtistPortal /></PortalGuard>}</Route>
          <Route path="/gallery-portal">{() => <PortalGuard><GalleryPortalPage /></PortalGuard>}</Route>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={NotFound} />
        </Switch>
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <Providers />
    </WouterRouter>
  );
}

export default App;
