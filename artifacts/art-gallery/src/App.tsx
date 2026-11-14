import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation, useSearch } from "wouter";
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
import Sitemap from "@/pages/sitemap";
import Galleries from "@/pages/galleries";
import GalleryDetail from "@/pages/gallery-detail";
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
  // Every link starts the next page at the top, including links that only change the
  // query string (e.g. /art → /art?artCategory=Paintings). "#section" links scroll to that section instead.
  const search = useSearch();
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [location, search]);
  // A link to the page you're already on (logo, "Home" in the footer) doesn't change the
  // address, so the effect above can't see it: scroll up on the click itself.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // (No defaultPrevented check: the site's own <Link>s always prevent the default to route in-app.)
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin || a.hash) return;
      if (a.pathname === window.location.pathname && a.search === window.location.search) {
        window.scrollTo(0, 0);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1">
        <Suspense fallback={<div className="min-h-[50vh]" />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/art" component={ArtCollection} />
          <Route path="/art/:id" component={ArtworkDetail} />
          <Route path="/gallery" component={Galleries} />
          <Route path="/gallery/:slug" component={GalleryDetail} />
          <Route path="/artists" component={Artists} />
          <Route path="/artists/:id" component={ArtistProfile} />
          <Route path="/specialty" component={SpecialtyArt} />
          <Route path="/shop" component={Shop} />
          <Route path="/cart" component={Cart} />
          <Route path="/about" component={About} />
          <Route path="/contact">{() => <Redirect to="/about#contact" />}</Route>
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route path="/sitemap" component={Sitemap} />
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
