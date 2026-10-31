import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
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
import SpecialtyArt from "@/pages/specialty-art";
import Shop from "@/pages/shop";
import Admin from "@/pages/admin";
import ArtistPortal from "@/pages/artist-portal";
import ArtistPortalRegister from "@/pages/artist-portal-register";
import ArtistPortalSubmit from "@/pages/artist-portal-submit";
import GalleryPortalPage from "@/pages/gallery-portal-page";
import Portals from "@/pages/portals";
import CollectorPortal from "@/pages/collector-portal";
import StaffConsole from "@/pages/staff";
import MuseumPage from "@/pages/museum";
import AccountPage from "@/pages/account";
import { TopNav } from "@/components/top-nav";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
      </main>
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
