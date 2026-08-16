import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Loader2, CheckCircle, Clock, MessageCircle, ExternalLink, ShieldOff, LogOut,
  Image as ImageIcon, XCircle, Check, X, Plus, Trash2, Package, Pencil,
  Users, Eye, EyeOff, ChevronRight, User, DollarSign, TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/money";

type EnquiryItem = { artworkId: number; title: string; artistName: string; imageUrl?: string };

type Enquiry = {
  id: number; clerkUserId: string; userEmail: string; userName: string;
  items: EnquiryItem[]; message: string | null;
  status: "pending" | "contacted" | "completed"; createdAt: string;
};

type PendingArtwork = {
  id: number; title: string; imageUrl: string; artType: string; year: number;
  shortDescription: string; status: string; artistName: string;
  expectedPrice: number | null; displayPrice: number | null;
};

type ShopItemData = {
  id: number; name: string; description: string; type: string; imageUrl: string;
  isAddon: boolean; compatibleArtCategories: string[]; stock: number; status: string; price: number;
};

type AdminArtist = {
  id: number; name: string; country: string; birthYear: number; gender: string;
  style: string; photoUrl: string; shortBio: string; biography: string; influences: string;
  awards: string; exhibitions: string; contactEmail: string; websiteUrl: string;
  isVerified: string; portfolioDisabled: boolean; clerkUserId: string | null;
  defaultCommissionRate: number;
  riskScore: number; riskFlags: string[];
  phone: string; phone2: string;
};

type AdminPortfolioItem = { url: string; label?: string };

type AdminPortfolio = { description: string; imageUrls: string[]; adminItems: AdminPortfolioItem[] };

type GalleryCommission = {
  id: number; artworkId: number | null; artworkTitle: string;
  salePrice: number; commissionRate: number; commissionAmount: number;
  artistEarning: number; currency: string; status: string;
  notes: string | null; createdAt: string;
};

const EMPTY_COMMISSION_FORM = { artworkTitle: "", artworkId: "", salePrice: "", commissionRate: "30", notes: "" };

const SHOP_TYPES = ["Stationary", "Frames", "Hanging Support"] as const;

type Tab = "enquiries" | "artworks" | "artists" | "shop" | "details" | "orders" | "galleries";

type AdminGallery = {
  id: number; name: string; email: string; phone: string;
  city: string; country: string; websiteUrl: string; logoUrl: string;
  status: string; createdAt: string;
};

type MergeRequest = {
  id: number;
  artistId: number | null;
  submittedName: string;
  submittedEmail: string;
  submittedPhone: string;
  message: string;
  status: string;
  createdAt: string;
  matchedArtistName: string | null;
};

type ShopItemType = {
  id: number; name: string; basePrice: number;
  fixedSizeSupport: boolean; sizeSupportedFrom: string | null; sizeSupportedTo: string | null;
};
type ArtSubcategory = { id: number; artCategoryId: number; name: string; displayOrder: number };
type CompatRow = {
  id: number; artCategoryId: number; artSubcategoryId: number | null;
  shopItemTypeId: number; categoryName: string | null; subcategoryName: string | null; shopItemTypeName: string | null;
};

const EMPTY_ARTIST_FORM: Record<string, string> = {
  name: "", style: "", country: "Pakistan", birthYear: "", gender: "",
  shortBio: "", biography: "", influences: "", awards: "", exhibitions: "",
  contactEmail: "", websiteUrl: "", photoUrl: "", isVerified: "pending",
  phone: "", phone2: "",
};

export default function Admin() {
  const [tab, setTab] = useState<Tab>("enquiries");
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [pendingArtworks, setPendingArtworks] = useState<PendingArtwork[]>([]);
  const [approvedArtworks, setApprovedArtworks] = useState<PendingArtwork[]>([]);
  const [rejectedArtworks, setRejectedArtworks] = useState<PendingArtwork[]>([]);
  const [artworkSubTab, setArtworkSubTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [artistSubTab, setArtistSubTab] = useState<"list" | "merge-requests">("list");
  const [shopItems, setShopItems] = useState<ShopItemData[]>([]);
  const [allArtists, setAllArtists] = useState<AdminArtist[]>([]);
  const [artworkTypes, setArtworkTypes] = useState<{ id: number; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [artistSearch, setArtistSearch] = useState("");
  const [artistSort, setArtistSort] = useState<"name" | "risk">("name");
  const [selectedArtistId, setSelectedArtistId] = useState<number | null>(null);
  const [artistRightMode, setArtistRightMode] = useState<"view" | "edit" | "add">("view");
  const [artistForm, setArtistForm] = useState<Record<string, string>>(EMPTY_ARTIST_FORM);
  const [artistSaving, setArtistSaving] = useState(false);
  const [artistPortfolio, setArtistPortfolio] = useState<AdminPortfolio>({ description: "", imageUrls: [], adminItems: [] });
  const [artistPortfolioLoading, setArtistPortfolioLoading] = useState(false);
  const [portfolioSaving, setPortfolioSaving] = useState(false);
  const [newAdminItemUrl, setNewAdminItemUrl] = useState("");
  const [newAdminItemLabel, setNewAdminItemLabel] = useState("");

  const [commissions, setCommissions] = useState<GalleryCommission[]>([]);
  const [commissionsLoading, setCommissionsLoading] = useState(false);
  const [commissionForm, setCommissionForm] = useState<Record<string, string>>(EMPTY_COMMISSION_FORM);
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [showCommissionForm, setShowCommissionForm] = useState(false);
  const [commissionRateInput, setCommissionRateInput] = useState("30");
  const [commissionRateSaving, setCommissionRateSaving] = useState(false);

  const [shopForm, setShopForm] = useState<Omit<ShopItemData, "id">>({
    name: "", description: "", type: "Stationary", imageUrl: "", isAddon: false,
    compatibleArtCategories: [], stock: 0, status: "active", price: 0,
  });
  const [editingShopId, setEditingShopId] = useState<number | null>(null);
  const [shopSaving, setShopSaving] = useState(false);

  // ── Orders tab ─────────────────────────────────────────────────────────────
  type AdminOrderLineItem = { id: number; artworkId: number | null; shopItemId: number | null; title: string; imageUrl: string; unitPrice: number; quantity: number };
  type AdminOrder = { id: number; sessionId: string; clerkUserId: string | null; status: string; totalAmount: number; contactName: string | null; contactPhone: string | null; contactEmail: string | null; createdAt: string; updatedAt: string; items: AdminOrderLineItem[] };
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderStatusSaving, setOrderStatusSaving] = useState<number | null>(null);
  const [orderDeleting, setOrderDeleting] = useState<number | null>(null);

  // ── Galleries tab ──────────────────────────────────────────────────────────
  const [galleries, setGalleries] = useState<AdminGallery[]>([]);
  const [galleriesLoading, setGalleriesLoading] = useState(false);
  const [galleryActionSaving, setGalleryActionSaving] = useState<number | null>(null);
  const [gallerySubTab, setGallerySubTab] = useState<"pending" | "approved" | "rejected">("pending");

  const loadAdminOrders = useCallback(async () => {
    setOrdersLoading(true);
    const res = await fetch("/api/admin/orders", { credentials: "include" });
    if (res.ok) setAdminOrders(await res.json());
    setOrdersLoading(false);
  }, []);

  const loadGalleries = useCallback(async () => {
    setGalleriesLoading(true);
    const res = await fetch("/api/admin/galleries", { credentials: "include" });
    if (res.ok) setGalleries(await res.json());
    setGalleriesLoading(false);
  }, []);

  useEffect(() => { loadAdminOrders(); loadGalleries(); }, [loadAdminOrders, loadGalleries]);
  const pendingOrdersCount = adminOrders.filter((o) => o.status === "pending_purchase").length;

  // ── Merge Requests (sub-tab inside Artists) ────────────────────────────────
  const [mergeRequests, setMergeRequests] = useState<MergeRequest[]>([]);
  const [mergeStatusSaving, setMergeStatusSaving] = useState<number | null>(null);
  const [mergePasswords, setMergePasswords] = useState<Record<number, string>>({});
  const [mergePasswordSaving, setMergePasswordSaving] = useState<number | null>(null);
  const [mergeDeleteSaving, setMergeDeleteSaving] = useState<number | null>(null);

  const loadMergeRequests = useCallback(async () => {
    const res = await fetch("/api/admin/merge-requests", { credentials: "include" });
    if (res.ok) setMergeRequests(await res.json());
  }, []);
  useEffect(() => { loadMergeRequests(); }, [loadMergeRequests]);

  const pendingMergeCount = mergeRequests.filter((r) => r.status === "pending").length;

  const updateMergeRequest = async (id: number, status: string) => {
    setMergeStatusSaving(id);
    const res = await fetch(`/api/admin/merge-requests/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.status === 401) { onSessionExpired(); }
    else if (res.ok) {
      setMergeRequests((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
      toast({ title: `Request marked as ${status}.` });
    } else { toast({ title: "Error", variant: "destructive" }); }
    setMergeStatusSaving(null);
  };

  // ── Add Details tab ────────────────────────────────────────────────────────
  const [artCategories, setArtCategories] = useState<{ id: number; name: string }[]>([]);
  const [shopItemTypes, setShopItemTypes] = useState<ShopItemType[]>([]);
  const [artSubcategories, setArtSubcategories] = useState<ArtSubcategory[]>([]);
  const [compatRows, setCompatRows] = useState<CompatRow[]>([]);

  // shop item type form
  const EMPTY_SIT: Omit<ShopItemType, "id"> = { name: "", basePrice: 0, fixedSizeSupport: false, sizeSupportedFrom: "", sizeSupportedTo: "" };
  const [sitForm, setSitForm] = useState<Omit<ShopItemType, "id">>(EMPTY_SIT);
  const [editingSitId, setEditingSitId] = useState<number | null>(null);
  const [sitSaving, setSitSaving] = useState(false);

  // subcategory form
  const [selectedCategoryForSub, setSelectedCategoryForSub] = useState<number | "">("");
  const [newSubName, setNewSubName] = useState("");
  const [subSaving, setSubSaving] = useState(false);

  // compatibility form
  const [compatCatId, setCompatCatId]   = useState<number | "">("");
  const [compatSubId, setCompatSubId]   = useState<number | "">("");  // "" = All
  const [compatTypeId, setCompatTypeId] = useState<number | "">("");
  const [compatSaving, setCompatSaving] = useState(false);

  const loadData = useCallback(async () => {
    const meRes = await fetch("/api/admin/me", { credentials: "include" });
    const me = await meRes.json();
    if (!me.isAdmin) { setIsAdmin(false); setIsLoading(false); return; }
    setIsAdmin(true);
    const [enqRes, artRes, artApprovedRes, artRejectedRes, shopRes, artistsRes, typesRes, catsRes, sitRes, compatRes] = await Promise.all([
      fetch("/api/enquiries", { credentials: "include" }),
      fetch("/api/admin/artworks/pending", { credentials: "include" }),
      fetch("/api/admin/artworks/approved", { credentials: "include" }),
      fetch("/api/admin/artworks/rejected", { credentials: "include" }),
      fetch("/api/admin/shop/items", { credentials: "include" }),
      fetch("/api/admin/artists", { credentials: "include" }),
      fetch("/api/lookup/artwork-types"),
      fetch("/api/lookup/art-categories"),
      fetch("/api/admin/shop-item-types", { credentials: "include" }),
      fetch("/api/admin/subcategory-compatibility", { credentials: "include" }),
    ]);
    if (enqRes.ok) setEnquiries(await enqRes.json());
    if (artRes.ok) setPendingArtworks(await artRes.json());
    if (artApprovedRes.ok) setApprovedArtworks(await artApprovedRes.json());
    if (artRejectedRes.ok) setRejectedArtworks(await artRejectedRes.json());
    if (shopRes.ok) setShopItems(await shopRes.json());
    if (artistsRes.ok) setAllArtists(await artistsRes.json());
    if (typesRes.ok) setArtworkTypes(await typesRes.json());
    if (catsRes.ok) setArtCategories(await catsRes.json());
    if (sitRes.ok) setShopItemTypes(await sitRes.json());
    if (compatRes.ok) setCompatRows(await compatRes.json());
    const subsRes = await fetch("/api/lookup/art-subcategories");
    if (subsRes.ok) setArtSubcategories(await subsRes.json());
    setIsLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveCommissionRate = async () => {
    if (!selectedArtistId) return;
    const rate = Number(commissionRateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast({ title: "Rate must be 0–100.", variant: "destructive" }); return;
    }
    setCommissionRateSaving(true);
    const res = await fetch(`/api/admin/artists/${selectedArtistId}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultCommissionRate: rate }),
    });
    if (res.ok) {
      const updated: AdminArtist = await res.json();
      setAllArtists((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast({ title: `Commission rate set to ${rate}%.` });
    } else {
      toast({ title: "Error", description: "Could not save rate.", variant: "destructive" });
    }
    setCommissionRateSaving(false);
  };

  const selectArtist = async (id: number) => {
    setSelectedArtistId(id);
    setArtistRightMode("view");
    setShowCommissionForm(false);
    const artist = allArtists.find((a) => a.id === id);
    const rate = String(artist?.defaultCommissionRate ?? 30);
    setCommissionRateInput(rate);
    setCommissionForm({ ...EMPTY_COMMISSION_FORM, commissionRate: rate });

    setArtistPortfolioLoading(true);
    setCommissionsLoading(true);

    const [portfolioRes, commissionsRes] = await Promise.all([
      fetch(`/api/artists/${id}/portfolio`, { credentials: "include" }),
      fetch(`/api/admin/gallery-commission/artist/${id}`, { credentials: "include" }),
    ]);

    if (portfolioRes.ok) {
      const data = await portfolioRes.json();
      setArtistPortfolio({
        description: data.description ?? "",
        imageUrls: data.imageUrls ?? [],
        adminItems: data.adminItems ?? [],
      });
    }
    if (commissionsRes.ok) {
      setCommissions(await commissionsRes.json());
    } else {
      setCommissions([]);
    }

    setArtistPortfolioLoading(false);
    setCommissionsLoading(false);
  };

  const startAddArtist = () => {
    setSelectedArtistId(null);
    setArtistForm({ ...EMPTY_ARTIST_FORM });
    setArtistRightMode("add");
  };

  const startEditArtist = (artist: AdminArtist) => {
    setArtistForm({
      name: artist.name, style: artist.style, country: artist.country,
      birthYear: String(artist.birthYear), gender: artist.gender,
      shortBio: artist.shortBio, biography: artist.biography, influences: artist.influences,
      awards: artist.awards, exhibitions: artist.exhibitions, contactEmail: artist.contactEmail,
      websiteUrl: artist.websiteUrl, photoUrl: artist.photoUrl, isVerified: artist.isVerified,
      phone: artist.phone ?? "", phone2: artist.phone2 ?? "",
    });
    setArtistRightMode("edit");
  };

  const saveArtist = async () => {
    if (!artistForm.name || !artistForm.style || !artistForm.shortBio) {
      toast({ title: "Name, style, and short bio are required.", variant: "destructive" });
      return;
    }
    setArtistSaving(true);
    const isNew = artistRightMode === "add";
    const url = isNew ? "/api/admin/artists" : `/api/admin/artists/${selectedArtistId}`;
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...artistForm, birthYear: Number(artistForm.birthYear) || new Date().getFullYear() }),
    });
    if (res.status === 401) { onSessionExpired(); }
    else if (res.ok) {
      const saved: AdminArtist = await res.json();
      if (isNew) {
        setAllArtists((prev) => [...prev, saved]);
        setSelectedArtistId(saved.id);
        toast({ title: "Artist created." });
      } else {
        setAllArtists((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
        toast({ title: "Artist updated." });
      }
      setArtistRightMode("view");
      if (isNew) await selectArtist(saved.id);
    } else {
      toast({ title: "Error", description: "Could not save artist.", variant: "destructive" });
    }
    setArtistSaving(false);
  };

  const deleteArtist = async (id: number) => {
    if (!confirm("Delete this artist? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/artists/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setAllArtists((prev) => prev.filter((a) => a.id !== id));
      setSelectedArtistId(null);
      toast({ title: "Artist deleted." });
    }
  };

  const reviewArtist = async (id: number, action: "approve" | "reject") => {
    const res = await fetch(`/api/admin/artists/${id}/${action}`, {
      method: "PATCH", credentials: "include",
    });
    if (res.ok) {
      const updated: AdminArtist = await res.json();
      setAllArtists((prev) => prev.map((a) => (a.id === updated.id ? { ...a, isVerified: updated.isVerified } : a)));
      toast({ title: action === "approve" ? "Artist approved — now visible publicly." : "Artist rejected." });
    }
  };

  const togglePortfolioDisabled = async (artist: AdminArtist) => {
    const res = await fetch(`/api/admin/artists/${artist.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioDisabled: !artist.portfolioDisabled }),
    });
    if (res.ok) {
      const updated: AdminArtist = await res.json();
      setAllArtists((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast({ title: updated.portfolioDisabled ? "Portfolio hidden from public." : "Portfolio visible to public." });
    }
  };

  const addAdminPortfolioItem = () => {
    if (!newAdminItemUrl.trim()) return;
    setArtistPortfolio((p) => ({
      ...p,
      adminItems: [...p.adminItems, { url: newAdminItemUrl.trim(), label: newAdminItemLabel.trim() || undefined }],
    }));
    setNewAdminItemUrl("");
    setNewAdminItemLabel("");
  };

  const removeAdminPortfolioItem = (idx: number) => {
    setArtistPortfolio((p) => ({ ...p, adminItems: p.adminItems.filter((_, i) => i !== idx) }));
  };

  const savePortfolio = async () => {
    if (!selectedArtistId) return;
    setPortfolioSaving(true);
    const res = await fetch(`/api/admin/artists/${selectedArtistId}/portfolio`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(artistPortfolio),
    });
    if (res.ok) {
      toast({ title: "Portfolio saved." });
    } else {
      toast({ title: "Error", description: "Could not save portfolio.", variant: "destructive" });
    }
    setPortfolioSaving(false);
  };

  const saveCommission = async () => {
    if (!selectedArtistId || !commissionForm.salePrice || !commissionForm.artworkTitle) {
      toast({ title: "Artwork title and sale price are required.", variant: "destructive" });
      return;
    }
    setCommissionSaving(true);
    const res = await fetch("/api/admin/gallery-commission", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artistId: selectedArtistId,
        artworkId: commissionForm.artworkId ? Number(commissionForm.artworkId) : null,
        artworkTitle: commissionForm.artworkTitle,
        salePrice: Number(commissionForm.salePrice),
        commissionRate: Number(commissionForm.commissionRate),
        notes: commissionForm.notes || null,
      }),
    });
    if (res.ok) {
      const saved: GalleryCommission = await res.json();
      setCommissions((prev) => [saved, ...prev]);
      setCommissionForm(EMPTY_COMMISSION_FORM);
      setShowCommissionForm(false);
      toast({ title: "Sale recorded." });
    } else {
      toast({ title: "Error", description: "Could not record sale.", variant: "destructive" });
    }
    setCommissionSaving(false);
  };

  const updateCommissionStatus = async (id: number, status: string) => {
    const res = await fetch(`/api/admin/gallery-commission/${id}/status`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated: GalleryCommission = await res.json();
      setCommissions((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast({ title: "Status updated." });
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setLocation("/admin/login");
  };

  const onSessionExpired = () => {
    toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
    setIsAdmin(false);
  };

  // Periodically verify the admin session is still alive (catches server restarts)
  useEffect(() => {
    if (!isAdmin) return;
    const iv = setInterval(async () => {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (!data.isAdmin) onSessionExpired();
      }
    }, 30_000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const updateEnquiry = async (id: number, status: string) => {
    const res = await fetch(`/api/enquiries/${id}/status`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEnquiries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      toast({ title: "Status updated." });
    }
  };

  const reviewArtwork = async (id: number, action: "approve" | "reject") => {
    const res = await fetch(`/api/admin/artworks/${id}/${action}`, { method: "PATCH", credentials: "include" });
    if (res.ok) {
      const artwork = pendingArtworks.find((a) => a.id === id) ?? approvedArtworks.find((a) => a.id === id) ?? rejectedArtworks.find((a) => a.id === id);
      if (artwork) {
        const updated = { ...artwork, status: action === "approve" ? "approved" : "rejected" };
        setPendingArtworks((prev) => prev.filter((a) => a.id !== id));
        setApprovedArtworks((prev) => {
          const filtered = prev.filter((a) => a.id !== id);
          return action === "approve" ? [updated, ...filtered] : filtered;
        });
        setRejectedArtworks((prev) => {
          const filtered = prev.filter((a) => a.id !== id);
          return action === "reject" ? [updated, ...filtered] : filtered;
        });
      }
      toast({ title: action === "approve" ? "Artwork approved ✓" : "Artwork rejected." });
    }
  };

  const updateArtworkPrice = (id: number, displayPrice: number | null) => {
    const patch = (list: PendingArtwork[]) => list.map((a) => a.id === id ? { ...a, displayPrice } : a);
    setPendingArtworks(patch);
    setApprovedArtworks(patch);
    setRejectedArtworks(patch);
  };

  const resetShopForm = () => {
    setShopForm({ name: "", description: "", type: "Stationary", imageUrl: "", isAddon: false, compatibleArtCategories: [], stock: 0, status: "active", price: 0 });
    setEditingShopId(null);
  };

  const startEditShopItem = (item: ShopItemData) => {
    setShopForm({ name: item.name, description: item.description, type: item.type, imageUrl: item.imageUrl, isAddon: item.isAddon, compatibleArtCategories: item.compatibleArtCategories, stock: item.stock, status: item.status, price: item.price });
    setEditingShopId(item.id);
  };

  const toggleArtCategory = (cat: string) => {
    setShopForm((f) => ({ ...f, compatibleArtCategories: f.compatibleArtCategories.includes(cat) ? f.compatibleArtCategories.filter((c) => c !== cat) : [...f.compatibleArtCategories, cat] }));
  };

  const saveShopItem = async () => {
    if (!shopForm.name) return;
    setShopSaving(true);
    const url = editingShopId ? `/api/admin/shop/items/${editingShopId}` : "/api/admin/shop/items";
    const method = editingShopId ? "PUT" : "POST";
    const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shopForm) });
    if (res.ok) {
      const saved: ShopItemData = await res.json();
      if (editingShopId) { setShopItems((prev) => prev.map((i) => (i.id === editingShopId ? saved : i))); toast({ title: "Item updated." }); }
      else { setShopItems((prev) => [...prev, saved]); toast({ title: "Item created." }); }
      resetShopForm();
    } else { toast({ title: "Error", description: "Could not save shop item.", variant: "destructive" }); }
    setShopSaving(false);
  };

  const deleteShopItem = async (id: number) => {
    const res = await fetch(`/api/admin/shop/items/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { setShopItems((prev) => prev.filter((i) => i.id !== id)); if (editingShopId === id) resetShopForm(); toast({ title: "Item deleted." }); }
  };

  if (isLoading) return <div className="flex justify-center items-center min-h-screen bg-background"><Loader2 className="animate-spin text-primary w-12 h-12" /></div>;

  if (isAdmin === false) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center px-4 bg-background">
      <ShieldOff size={48} className="text-primary/40" />
      <h2 className="font-display text-3xl text-primary">Admin Access Required</h2>
      <p className="text-foreground/60 max-w-md">This panel is restricted to gallery administrators.</p>
      <Link href="/admin/login" className="font-display uppercase tracking-widest border border-primary text-primary px-8 py-3 hover:bg-primary hover:text-primary-foreground transition-colors">Sign In as Admin</Link>
    </div>
  );

  const pendingEnq = enquiries.filter((e) => e.status === "pending");
  const contacted  = enquiries.filter((e) => e.status === "contacted");
  const completed  = enquiries.filter((e) => e.status === "completed");
  const selectedArtist = allArtists.find((a) => a.id === selectedArtistId) ?? null;
  const filteredArtists = allArtists
    .filter((a) => a.name.toLowerCase().includes(artistSearch.toLowerCase()) || a.style.toLowerCase().includes(artistSearch.toLowerCase()))
    .sort((a, b) => artistSort === "risk" ? (b.riskScore ?? 0) - (a.riskScore ?? 0) : a.name.localeCompare(b.name));

  const setAF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setArtistForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="pt-32 pb-24 px-6 md:px-12 min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl">

        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-secondary mb-3">Gallery Management</p>
            <h1 className="text-5xl font-display text-primary mb-3">Admin Panel</h1>
            <div className="w-24 h-px bg-secondary" />
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-sm uppercase tracking-widest text-foreground/50 hover:text-destructive transition-colors self-start md:self-end">
            <LogOut size={16} /> Sign Out
          </button>
        </header>

        <div className="flex gap-1 mb-10 border-b border-border overflow-x-auto">
          {([
            { key: "enquiries", label: "Enquiries",          badge: pendingEnq.length },
            { key: "artworks",  label: "Artwork Submissions", badge: pendingArtworks.length },
            { key: "artists",   label: "Artists",             badge: pendingMergeCount },
            { key: "galleries", label: "Galleries",           badge: galleries.filter((g) => g.status === "pending").length },
            { key: "shop",      label: "Shop Items",          badge: 0 },
            { key: "details",   label: "Add Details",         badge: 0 },
            { key: "orders",    label: "Orders",              badge: pendingOrdersCount },
          ] as { key: Tab; label: string; badge: number }[]).map(({ key, label, badge }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-6 py-3 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors border-b-2 -mb-px whitespace-nowrap ${tab === key ? "border-primary text-primary" : "border-transparent text-foreground/50 hover:text-foreground"}`}>
              {label}
              {badge > 0 && <span className="bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 min-w-[18px] text-center">{badge}</span>}
            </button>
          ))}
        </div>

        {tab === "enquiries" && (
          <>
            <div className="grid grid-cols-3 gap-6 mb-10">
              {[
                { label: "Pending",   value: pendingEnq.length, color: "text-amber-700" },
                { label: "Contacted", value: contacted.length,  color: "text-accent" },
                { label: "Completed", value: completed.length,  color: "text-foreground/40" },
              ].map((s) => (
                <div key={s.label} className="bg-card border border-border p-6 text-center">
                  <p className={`text-4xl font-display mb-1 ${s.color}`}>{s.value}</p>
                  <p className="text-xs uppercase tracking-widest text-foreground/60">{s.label}</p>
                </div>
              ))}
            </div>
            {enquiries.length === 0 ? (
              <div className="text-center py-24 border border-border bg-card"><p className="font-display text-2xl text-foreground/40">No enquiries yet.</p></div>
            ) : (
              <div className="space-y-6">
                {enquiries.map((enq) => (
                  <div key={enq.id} className="bg-card border border-border p-8">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <StatusBadge status={enq.status} />
                          <span className="text-xs text-foreground/40 uppercase tracking-widest">#{enq.id} · {new Date(enq.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
                        </div>
                        <h3 className="font-display text-xl text-primary">{enq.userName || enq.userEmail}</h3>
                        <p className="text-sm text-foreground/60">{enq.userEmail}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 flex-wrap">
                        {enq.status !== "pending"   && <button onClick={() => updateEnquiry(enq.id, "pending")}   className="text-xs px-3 py-1.5 border border-border text-foreground/60 hover:text-foreground uppercase tracking-widest transition-colors">Pending</button>}
                        {enq.status !== "contacted" && <button onClick={() => updateEnquiry(enq.id, "contacted")} className="text-xs px-3 py-1.5 border border-accent/40 text-accent hover:bg-accent/10 uppercase tracking-widest transition-colors">Contacted</button>}
                        {enq.status !== "completed" && <button onClick={() => updateEnquiry(enq.id, "completed")} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-widest transition-colors">Complete</button>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                      {(enq.items as EnquiryItem[]).map((item) => (
                        <Link key={item.artworkId} href={`/art/${item.artworkId}`}
                          className="flex items-center gap-3 bg-background border border-border p-3 hover:border-primary/40 transition-colors group">
                          {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-12 h-12 object-cover flex-shrink-0" />}
                          <div className="min-w-0">
                            <p className="font-display text-sm text-foreground truncate group-hover:text-primary transition-colors">{item.title}</p>
                            <p className="text-xs text-foreground/50 truncate">by {item.artistName}</p>
                          </div>
                          <ExternalLink size={12} className="ml-auto flex-shrink-0 text-foreground/30 group-hover:text-primary transition-colors" />
                        </Link>
                      ))}
                    </div>
                    {enq.message && (
                      <div className="flex gap-3 bg-background border border-border p-4">
                        <MessageCircle size={16} className="text-secondary mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-foreground/80 italic">"{enq.message}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "artworks" && (
          <>
            <div className="flex gap-1 mb-8 border-b border-border">
              {([
                { key: "pending",  label: "Pending",  count: pendingArtworks.length,  color: "text-amber-700" },
                { key: "approved", label: "Approved", count: approvedArtworks.length, color: "text-emerald-700" },
                { key: "rejected", label: "Rejected", count: rejectedArtworks.length, color: "text-rose-700" },
              ] as { key: "pending" | "approved" | "rejected"; label: string; count: number; color: string }[]).map(({ key, label, count, color }) => (
                <button key={key} onClick={() => setArtworkSubTab(key)}
                  className={`px-5 py-2.5 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors border-b-2 -mb-px ${artworkSubTab === key ? "border-primary text-primary" : "border-transparent text-foreground/50 hover:text-foreground"}`}>
                  {label}
                  {count > 0 && <span className={`text-[10px] font-mono ${color}`}>{count}</span>}
                </button>
              ))}
            </div>

            {artworkSubTab === "pending" && (
              pendingArtworks.length === 0 ? (
                <div className="text-center py-24 border border-border bg-card">
                  <CheckCircle size={40} className="mx-auto mb-4 text-emerald-500/40" />
                  <p className="font-display text-2xl text-foreground/40">No submissions awaiting review.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pendingArtworks.map((art) => (
                    <ArtworkReviewCard key={art.id} art={art} onReview={reviewArtwork} onPriceUpdate={updateArtworkPrice} showActions />
                  ))}
                </div>
              )
            )}

            {artworkSubTab === "approved" && (
              approvedArtworks.length === 0 ? (
                <div className="text-center py-24 border border-border bg-card">
                  <p className="font-display text-2xl text-foreground/40">No approved artworks yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {approvedArtworks.map((art) => (
                    <ArtworkReviewCard key={art.id} art={art} onReview={reviewArtwork} onPriceUpdate={updateArtworkPrice} showActions={false} />
                  ))}
                </div>
              )
            )}

            {artworkSubTab === "rejected" && (
              rejectedArtworks.length === 0 ? (
                <div className="text-center py-24 border border-border bg-card">
                  <p className="font-display text-2xl text-foreground/40">No rejected artworks.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {rejectedArtworks.map((art) => (
                    <ArtworkReviewCard key={art.id} art={art} onReview={reviewArtwork} onPriceUpdate={updateArtworkPrice} showActions={false} />
                  ))}
                </div>
              )
            )}
          </>
        )}

        {tab === "artists" && (
          <div className="space-y-6">
            {/* Artists sub-tab nav */}
            <div className="flex gap-1 border-b border-border -mt-2 mb-2">
              {([
                { key: "list", label: "Artists" },
                { key: "merge-requests", label: "Merge Requests", badge: pendingMergeCount },
              ] as { key: "list" | "merge-requests"; label: string; badge?: number }[]).map(({ key, label, badge }) => (
                <button key={key} onClick={() => setArtistSubTab(key)}
                  className={`px-5 py-2.5 text-xs uppercase tracking-widest flex items-center gap-2 transition-colors border-b-2 -mb-px ${artistSubTab === key ? "border-primary text-primary" : "border-transparent text-foreground/50 hover:text-foreground"}`}>
                  {label}
                  {!!badge && badge > 0 && <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 min-w-[18px] text-center">{badge}</span>}
                </button>
              ))}
            </div>

            {artistSubTab === "list" && (<>
            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                placeholder="Search artists…"
                value={artistSearch}
                onChange={(e) => setArtistSearch(e.target.value)}
                className="bg-background border border-border px-4 py-2.5 text-sm text-foreground w-full max-w-xs focus:outline-none focus:border-primary/60 placeholder:text-foreground/30"
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-foreground/40">Sort:</span>
                <button
                  onClick={() => setArtistSort("name")}
                  className={`text-[10px] uppercase tracking-widest px-3 py-1.5 border transition-colors ${artistSort === "name" ? "border-primary text-primary bg-primary/5" : "border-border text-foreground/40 hover:text-foreground"}`}>
                  Name
                </button>
                <button
                  onClick={() => setArtistSort("risk")}
                  className={`text-[10px] uppercase tracking-widest px-3 py-1.5 border transition-colors ${artistSort === "risk" ? "border-destructive/60 text-destructive bg-destructive/5" : "border-border text-foreground/40 hover:text-foreground"}`}>
                  Risk ↓
                </button>
              </div>
              <button onClick={startAddArtist}
                className="flex items-center gap-2 bg-primary text-primary-foreground text-xs uppercase tracking-widest px-5 py-2.5 hover:bg-primary/90 transition-colors flex-shrink-0">
                <Plus size={13} />Add Artist
              </button>
            </div>

            <div className="grid grid-cols-5 border border-border bg-card min-h-[600px]">
              <div className="col-span-2 border-r border-border overflow-y-auto max-h-[700px]">
                {filteredArtists.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center px-4">
                    <Users size={32} className="text-foreground/20 mb-3" />
                    <p className="text-sm text-foreground/40 italic">No artists found.</p>
                  </div>
                ) : filteredArtists.map((artist) => (
                  <button
                    key={artist.id}
                    onClick={() => selectArtist(artist.id)}
                    className={`w-full flex items-center gap-3 p-4 border-b border-border/50 text-left transition-colors hover:bg-background/60 ${selectedArtistId === artist.id ? "bg-primary/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                  >
                    <div className="w-10 h-10 flex-shrink-0 bg-background border border-border overflow-hidden">
                      {artist.photoUrl ? <img src={artist.photoUrl} alt={artist.name} className="w-full h-full object-cover" /> : <User size={16} className="m-auto text-foreground/20 mt-2.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-sm text-primary truncate">{artist.name}</p>
                      <p className="text-[10px] text-foreground/50 uppercase tracking-widest truncate">{artist.style}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {artist.isVerified === "approved" && <span className="text-[9px] text-emerald-700 uppercase tracking-widest">✓ Approved</span>}
                      {artist.isVerified === "pending" && <span className="text-[9px] text-amber-600 uppercase tracking-widest">● Pending</span>}
                      {artist.isVerified === "flagged" && <span className="text-[9px] text-rose-600 uppercase tracking-widest">⚑ Flagged</span>}
                      {artist.isVerified === "rejected" && <span className="text-[9px] text-destructive uppercase tracking-widest">✕ Rejected</span>}
                      {(artist.riskScore ?? 0) > 0 && <span className={`text-[9px] uppercase tracking-widest font-mono ${(artist.riskScore ?? 0) >= 40 ? "text-rose-600" : "text-foreground/30"}`}>risk {artist.riskScore}</span>}
                      {artist.portfolioDisabled && <span className="text-[9px] text-foreground/30 uppercase">Portfolio Off</span>}
                    </div>
                    <ChevronRight size={12} className="text-foreground/30 flex-shrink-0" />
                  </button>
                ))}
              </div>

              <div className="col-span-3 overflow-y-auto max-h-[700px]">
                {artistRightMode === "add" || (artistRightMode === "edit" && selectedArtist) ? (
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-display text-lg text-primary">{artistRightMode === "add" ? "New Artist" : `Edit — ${selectedArtist?.name}`}</h3>
                      <button onClick={() => { setArtistRightMode("view"); if (!selectedArtistId) setSelectedArtistId(null); }}
                        className="text-xs text-foreground/40 hover:text-foreground uppercase tracking-widest">Cancel</button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { k: "name",         l: "Full Name *",      req: true },
                        { k: "style",        l: "Artistic Style *", req: true },
                        { k: "country",      l: "Country" },
                        { k: "birthYear",    l: "Year of Birth",    type: "number" },
                        { k: "gender",       l: "Gender" },
                        { k: "contactEmail", l: "Contact Email",    type: "email" },
                        { k: "phone",        l: "Phone 1",          type: "tel" },
                        { k: "phone2",       l: "Phone 2",          type: "tel" },
                        { k: "websiteUrl",   l: "Website" },
                        { k: "photoUrl",     l: "Photo URL" },
                        { k: "influences",   l: "Influences" },
                      ] as { k: string; l: string; req?: boolean; type?: string }[]).map(({ k, l, req, type }) => (
                        <div key={k} className={`flex flex-col gap-1 ${k === "influences" ? "col-span-2" : ""}`}>
                          <label className="text-[10px] uppercase tracking-widest text-foreground/60">{l}</label>
                          <input type={type ?? "text"} required={req} value={artistForm[k] ?? ""} onChange={setAF(k)}
                            className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
                        </div>
                      ))}
                    </div>

                    {([
                      { k: "shortBio",    l: "Short Bio *",    req: true, rows: 2 },
                      { k: "biography",   l: "Full Biography", rows: 4 },
                      { k: "awards",      l: "Awards",         rows: 2 },
                      { k: "exhibitions", l: "Exhibitions",    rows: 2 },
                    ] as { k: string; l: string; req?: boolean; rows: number }[]).map(({ k, l, req, rows }) => (
                      <div key={k} className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-widest text-foreground/60">{l}</label>
                        <textarea required={req} value={artistForm[k] ?? ""} onChange={setAF(k)} rows={rows}
                          className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none" />
                      </div>
                    ))}

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-widest text-foreground/60">Verification Status</label>
                      <select value={artistForm.isVerified} onChange={setAF("isVerified")}
                        className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60">
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>

                    <button onClick={saveArtist} disabled={artistSaving}
                      className="flex items-center gap-2 bg-primary text-primary-foreground text-xs uppercase tracking-widest px-6 py-2.5 hover:bg-primary/90 transition-colors disabled:opacity-50">
                      {artistSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {artistRightMode === "add" ? "Create Artist" : "Save Changes"}
                    </button>
                  </div>
                ) : selectedArtist ? (
                  <div className="p-6 space-y-6">
                    <div className="flex items-start gap-4 border-b border-border pb-5">
                      <div className="w-20 h-20 flex-shrink-0 bg-background border border-border overflow-hidden">
                        {selectedArtist.photoUrl ? <img src={selectedArtist.photoUrl} alt={selectedArtist.name} className="w-full h-full object-cover" /> : <User size={24} className="m-auto text-foreground/20 mt-6" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-display text-xl text-primary">{selectedArtist.name}</h3>
                            <p className="text-xs uppercase tracking-widest text-foreground/50 mt-0.5">{selectedArtist.style} · {selectedArtist.country} · {selectedArtist.birthYear}</p>
                            {selectedArtist.isVerified === "approved" && <span className="text-[10px] text-emerald-700 uppercase tracking-widest"><CheckCircle size={10} className="inline mr-1" />Approved</span>}
                          {selectedArtist.isVerified === "pending" && <span className="text-[10px] text-amber-600 uppercase tracking-widest">● Pending Review</span>}
                          {selectedArtist.isVerified === "flagged" && <span className="text-[10px] text-rose-600 uppercase tracking-widest">⚑ Flagged — Pending Review</span>}
                          {selectedArtist.isVerified === "rejected" && <span className="text-[10px] text-destructive uppercase tracking-widest">✕ Rejected</span>}
                          {/* Risk score + flag chips */}
                          {(selectedArtist.riskScore ?? 0) > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              <span className={`text-[9px] uppercase tracking-widest font-mono px-2 py-0.5 border ${(selectedArtist.riskScore ?? 0) >= 40 ? "border-rose-300 text-rose-600 bg-rose-50" : "border-amber-200 text-amber-600 bg-amber-50"}`}>
                                Risk {selectedArtist.riskScore}/100
                              </span>
                              {(selectedArtist.riskFlags ?? []).map((f: string) => (
                                <span key={f} className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-border text-foreground/50 bg-background">
                                  {f.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                          )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {(selectedArtist.isVerified === "pending" || selectedArtist.isVerified === "flagged") && (
                              <>
                                <button onClick={() => reviewArtist(selectedArtist.id, "approve")}
                                  className="flex items-center gap-1 text-[10px] uppercase tracking-widest bg-emerald-700 text-white px-3 py-1.5 hover:bg-emerald-800 transition-colors">
                                  <Check size={11} />Approve
                                </button>
                                <button onClick={() => reviewArtist(selectedArtist.id, "reject")}
                                  className="flex items-center gap-1 text-[10px] uppercase tracking-widest border border-destructive/60 text-destructive px-3 py-1.5 hover:bg-destructive/10 transition-colors">
                                  <X size={11} />Reject
                                </button>
                              </>
                            )}
                            <button onClick={() => startEditArtist(selectedArtist)}
                              className="flex items-center gap-1 text-[10px] uppercase tracking-widest border border-border px-3 py-1.5 text-foreground/60 hover:text-foreground hover:border-primary/40 transition-colors">
                              <Pencil size={11} />Edit
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {selectedArtist.shortBio && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-foreground/40 mb-2">Short Bio</p>
                        <p className="text-sm text-foreground/80 italic">{selectedArtist.shortBio}</p>
                      </div>
                    )}

                    {selectedArtist.biography && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-foreground/40 mb-2">Biography</p>
                        <p className="text-sm text-foreground/70 leading-relaxed line-clamp-4">{selectedArtist.biography}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      {selectedArtist.influences && <div><p className="text-[10px] uppercase tracking-widest text-foreground/40 mb-1">Influences</p><p className="text-xs text-foreground/70 italic line-clamp-3">{selectedArtist.influences}</p></div>}
                      {selectedArtist.awards && <div><p className="text-[10px] uppercase tracking-widest text-foreground/40 mb-1">Awards</p><p className="text-xs text-foreground/70 line-clamp-3">{selectedArtist.awards}</p></div>}
                    </div>

                    {selectedArtist.exhibitions && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-foreground/40 mb-1">Exhibitions</p>
                        <p className="text-xs text-foreground/70 line-clamp-3">{selectedArtist.exhibitions}</p>
                      </div>
                    )}

                    <div className="border border-border bg-background/50">
                      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                        <h4 className="text-xs uppercase tracking-widest text-foreground/60">Portfolio Management</h4>
                        <button onClick={() => { selectArtist(selectedArtist.id); }}
                          className="text-[10px] text-foreground/40 hover:text-foreground uppercase tracking-widest">Reload</button>
                      </div>

                      {artistPortfolioLoading ? (
                        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary w-6 h-6" /></div>
                      ) : (
                        <div className="p-4 space-y-4">
                          <div>
                            <label className="block text-[10px] uppercase tracking-widest text-foreground/50 mb-1.5">Portfolio Description</label>
                            <textarea value={artistPortfolio.description} onChange={(e) => setArtistPortfolio((p) => ({ ...p, description: e.target.value }))} rows={2}
                              placeholder="Brief description of this artist's portfolio section…"
                              className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none placeholder:text-foreground/30" />
                          </div>

                          {artistPortfolio.imageUrls.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-2">Artist's Portfolio ({artistPortfolio.imageUrls.length} images)</p>
                              <div className="grid grid-cols-4 gap-2">
                                {artistPortfolio.imageUrls.slice(0, 8).map((url, i) => (
                                  <div key={i} className="aspect-square overflow-hidden bg-background border border-border">
                                    <img src={url} alt={`Portfolio ${i+1}`} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "https://picsum.photos/seed/err/80/80"; }} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-2">
                              Special Portfolio — Not for Sale ({artistPortfolio.adminItems.length} items)
                            </p>
                            {artistPortfolio.adminItems.length > 0 && (
                              <div className="grid grid-cols-3 gap-2 mb-3">
                                {artistPortfolio.adminItems.map((item, idx) => (
                                  <div key={idx} className="relative group/adm">
                                    <div className="aspect-square overflow-hidden bg-background border border-secondary/30">
                                      <img src={item.url} alt={item.label ?? `Admin item ${idx+1}`} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "https://picsum.photos/seed/err/80/80"; }} />
                                    </div>
                                    {item.label && <p className="text-[9px] truncate text-foreground/50 mt-0.5">{item.label}</p>}
                                    <button onClick={() => removeAdminPortfolioItem(idx)}
                                      className="absolute top-1 right-1 w-5 h-5 bg-destructive text-white flex items-center justify-center opacity-0 group-hover/adm:opacity-100 transition-opacity">
                                      <Trash2 size={10} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="space-y-2">
                              <input type="url" value={newAdminItemUrl} onChange={(e) => setNewAdminItemUrl(e.target.value)}
                                placeholder="Image URL…"
                                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-secondary/60 placeholder:text-foreground/30" />
                              <div className="flex gap-2">
                                <input type="text" value={newAdminItemLabel} onChange={(e) => setNewAdminItemLabel(e.target.value)}
                                  placeholder="Label (optional)…"
                                  className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-secondary/60 placeholder:text-foreground/30" />
                                <button onClick={addAdminPortfolioItem}
                                  className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-secondary-foreground text-[10px] uppercase tracking-widest hover:opacity-90 transition-opacity flex-shrink-0">
                                  <Plus size={12} />Add
                                </button>
                              </div>
                            </div>
                          </div>

                          <button onClick={savePortfolio} disabled={portfolioSaving}
                            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-[10px] uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50">
                            {portfolioSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                            Save Portfolio
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Default commission rate */}
                    <div className="border border-secondary/30 bg-background/50 p-4">
                      <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-3">Default Gallery Commission Rate</p>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center border border-border bg-background overflow-hidden">
                          <input
                            type="number" min={0} max={100} step={1}
                            value={commissionRateInput}
                            onChange={(e) => setCommissionRateInput(e.target.value)}
                            className="w-20 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none text-center font-display"
                          />
                          <span className="px-2 text-sm text-foreground/50 border-l border-border bg-card/50">%</span>
                        </div>
                        <button
                          onClick={saveCommissionRate} disabled={commissionRateSaving}
                          className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-secondary-foreground text-[10px] uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50 flex-shrink-0">
                          {commissionRateSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Save Rate
                        </button>
                        <p className="text-[10px] text-foreground/40 italic">This rate pre-fills new sale records and is shown to the artist on their Earnings page.</p>
                      </div>
                    </div>

                    <div className="border border-border bg-background/50">
                      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DollarSign size={13} className="text-secondary" />
                          <h4 className="text-xs uppercase tracking-widest text-foreground/60">Sales & Commissions</h4>
                        </div>
                        <button onClick={() => setShowCommissionForm((v) => !v)}
                          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-secondary hover:opacity-80 transition-opacity">
                          <Plus size={11} />{showCommissionForm ? "Cancel" : "Record Sale"}
                        </button>
                      </div>

                      {showCommissionForm && (
                        <div className="p-4 border-b border-border space-y-3 bg-card/60">
                          <p className="text-[10px] uppercase tracking-widest text-foreground/40">Record a completed sale</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 flex flex-col gap-1">
                              <label className="text-[10px] uppercase tracking-widest text-foreground/50">Artwork Title *</label>
                              <input type="text" value={commissionForm.artworkTitle}
                                onChange={(e) => setCommissionForm((f) => ({ ...f, artworkTitle: e.target.value }))}
                                placeholder="e.g. Lahore at Dusk"
                                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-secondary/60 placeholder:text-foreground/30" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] uppercase tracking-widest text-foreground/50">Artwork ID (opt.)</label>
                              <input type="number" value={commissionForm.artworkId}
                                onChange={(e) => setCommissionForm((f) => ({ ...f, artworkId: e.target.value }))}
                                placeholder="e.g. 42"
                                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-secondary/60 placeholder:text-foreground/30" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] uppercase tracking-widest text-foreground/50">Sale Price (PKR) *</label>
                              <input type="number" min={0} value={commissionForm.salePrice}
                                onChange={(e) => setCommissionForm((f) => ({ ...f, salePrice: e.target.value }))}
                                placeholder="e.g. 15000"
                                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-secondary/60 placeholder:text-foreground/30" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] uppercase tracking-widest text-foreground/50">Commission % (default 30)</label>
                              <input type="number" min={0} max={100} value={commissionForm.commissionRate}
                                onChange={(e) => setCommissionForm((f) => ({ ...f, commissionRate: e.target.value }))}
                                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-secondary/60" />
                            </div>
                            {commissionForm.salePrice && (
                              <div className="col-span-2 bg-background border border-secondary/20 px-3 py-2 flex items-center justify-between">
                                <span className="text-[10px] uppercase tracking-widest text-foreground/50">Artist Receives</span>
                                <span className="font-display text-sm text-secondary">
                                  {formatMoney(Math.round(Number(commissionForm.salePrice) * (1 - Number(commissionForm.commissionRate) / 100)))}
                                </span>
                              </div>
                            )}
                            <div className="col-span-2 flex flex-col gap-1">
                              <label className="text-[10px] uppercase tracking-widest text-foreground/50">Notes</label>
                              <textarea value={commissionForm.notes}
                                onChange={(e) => setCommissionForm((f) => ({ ...f, notes: e.target.value }))}
                                rows={2} placeholder="Any additional context…"
                                className="w-full bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-secondary/60 resize-none placeholder:text-foreground/30" />
                            </div>
                          </div>
                          <button onClick={saveCommission} disabled={commissionSaving}
                            className="flex items-center gap-2 px-5 py-2 bg-secondary text-secondary-foreground text-[10px] uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50">
                            {commissionSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                            Save Record
                          </button>
                        </div>
                      )}

                      {commissionsLoading ? (
                        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-secondary/60 w-5 h-5" /></div>
                      ) : commissions.length === 0 ? (
                        <div className="py-6 text-center">
                          <TrendingUp size={20} className="mx-auto mb-2 text-foreground/15" />
                          <p className="text-[10px] uppercase tracking-widest text-foreground/30">No sales recorded yet</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border/50">
                          {commissions.map((c) => (
                            <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                              <DollarSign size={13} className="text-secondary/60 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-display text-xs text-primary truncate">{c.artworkTitle}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                  <span className="text-[9px] text-foreground/50 uppercase tracking-widest">Sale: {formatMoney(c.salePrice, { currency: c.currency })}</span>
                                  <span className="text-[9px] text-secondary uppercase tracking-widest">Artist: {formatMoney(c.artistEarning, { currency: c.currency })}</span>
                                  <span className="text-[9px] text-foreground/40">{c.commissionRate}% commission</span>
                                </div>
                                {c.notes && <p className="text-[9px] text-foreground/40 italic mt-0.5 truncate">{c.notes}</p>}
                              </div>
                              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${
                                  c.status === "paid" ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                                  : c.status === "pending" ? "text-amber-700 border-amber-200 bg-amber-50"
                                  : "text-foreground/40 border-border"
                                }`}>{c.status}</span>
                                {c.status !== "paid" && (
                                  <button onClick={() => updateCommissionStatus(c.id, "paid")}
                                    className="text-[9px] uppercase tracking-widest text-emerald-700 hover:underline">
                                    Mark Paid
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border border-border bg-card p-4 space-y-3">
                      <p className="text-[10px] uppercase tracking-widest text-foreground/40 mb-3">Actions</p>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-foreground font-display">Portfolio Visibility</p>
                          <p className="text-[10px] text-foreground/50">{selectedArtist.portfolioDisabled ? "Hidden from public profile" : "Visible on public profile"}</p>
                        </div>
                        <button onClick={() => togglePortfolioDisabled(selectedArtist)}
                          className={`flex items-center gap-2 text-[10px] uppercase tracking-widest px-4 py-2 border transition-colors ${selectedArtist.portfolioDisabled ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : "border-foreground/20 text-foreground/50 hover:text-foreground hover:border-foreground/40"}`}>
                          {selectedArtist.portfolioDisabled ? <><Eye size={12} />Enable</> : <><EyeOff size={12} />Disable</>}
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <div>
                          <p className="text-xs text-destructive font-display">Delete Artist</p>
                          <p className="text-[10px] text-foreground/50">Permanently removes this artist and their profile</p>
                        </div>
                        <button onClick={() => deleteArtist(selectedArtist.id)}
                          className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors">
                          <Trash2 size={12} />Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-24 text-center px-8">
                    <Users size={36} className="text-foreground/20 mb-4" />
                    <p className="font-display text-lg text-foreground/40 mb-2">Select an artist</p>
                    <p className="text-sm text-foreground/30 italic">Click any artist from the list to view details, manage portfolio, and take actions.</p>
                  </div>
                )}
              </div>
            </div>
            </>)}

            {artistSubTab === "merge-requests" && (
              <div>
                <div className="grid grid-cols-3 gap-6 mb-10">
                  {[
                    { label: "Pending",   value: mergeRequests.filter((r) => r.status === "pending").length,   color: "text-amber-700" },
                    { label: "Contacted", value: mergeRequests.filter((r) => r.status === "contacted").length, color: "text-accent" },
                    { label: "Completed", value: mergeRequests.filter((r) => r.status === "completed").length, color: "text-emerald-700" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="border border-border p-6">
                      <p className="text-[10px] uppercase tracking-widest text-foreground/50 mb-1">{label}</p>
                      <p className={`font-display text-3xl ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {mergeRequests.length === 0 ? (
                  <p className="text-sm text-foreground/40 italic text-center py-20">No merge requests yet.</p>
                ) : (
                  <div className="space-y-4">
                    {mergeRequests.map((req) => {
                      const statusMap: Record<string, { label: string; cls: string }> = {
                        pending:   { label: "Pending",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
                        contacted: { label: "Contacted", cls: "bg-accent/10 text-accent border-accent/20" },
                        completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                        rejected:  { label: "Rejected",  cls: "bg-rose-50 text-rose-600 border-rose-200" },
                      };
                      const s = statusMap[req.status] ?? statusMap.pending;
                      return (
                        <div key={req.id} className="border border-border bg-card p-5 space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-display text-lg text-primary">{req.submittedName}</p>
                              {req.matchedArtistName && (
                                <p className="text-[10px] uppercase tracking-widest text-foreground/40 mt-0.5">
                                  Matched record: <span className="text-foreground/70">{req.matchedArtistName}</span>
                                </p>
                              )}
                            </div>
                            <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${s.cls} whitespace-nowrap`}>{s.label}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-foreground/40 mb-0.5">Email</p>
                              <p className="text-foreground/80">{req.submittedEmail || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-foreground/40 mb-0.5">Phone</p>
                              <p className="text-foreground/80">{req.submittedPhone || "—"}</p>
                            </div>
                          </div>
                          <div className="bg-background border border-border px-4 py-3">
                            <p className="text-[10px] uppercase tracking-widest text-foreground/40 mb-1">Message</p>
                            <p className="text-sm text-foreground/80 italic leading-relaxed">{req.message}</p>
                          </div>
                          <p className="text-[10px] text-foreground/30 uppercase tracking-widest">
                            Submitted {new Date(req.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          <div className="flex justify-end">
                            <button
                              disabled={mergeDeleteSaving === req.id}
                              onClick={async () => {
                                if (!confirm("Delete this merge request? This cannot be undone.")) return;
                                setMergeDeleteSaving(req.id);
                                const res = await fetch(`/api/admin/merge-requests/${req.id}`, {
                                  method: "DELETE", credentials: "include",
                                });
                                if (res.status === 401) { onSessionExpired(); }
                                else if (res.ok) {
                                  setMergeRequests((prev) => prev.filter((r) => r.id !== req.id));
                                  toast({ title: "Merge request deleted." });
                                } else {
                                  toast({ title: "Error", description: "Could not delete request.", variant: "destructive" });
                                }
                                setMergeDeleteSaving(null);
                              }}
                              className="flex items-center gap-1.5 text-xs uppercase tracking-widest px-3 py-1.5 border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40">
                              {mergeDeleteSaving === req.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                              Delete
                            </button>
                          </div>
                          {req.status !== "rejected" && req.status !== "completed" && (
                            <div className="space-y-3">
                              <div className="flex gap-2 flex-wrap">
                                {req.status === "pending" && (
                                  <button disabled={mergeStatusSaving === req.id} onClick={() => updateMergeRequest(req.id, "contacted")}
                                    className="flex items-center gap-1.5 text-xs uppercase tracking-widest px-4 py-2 border border-accent text-accent hover:bg-accent/5 transition-colors disabled:opacity-40">
                                    {mergeStatusSaving === req.id ? <Loader2 size={11} className="animate-spin" /> : <MessageCircle size={12} />}
                                    Mark Contacted
                                  </button>
                                )}
                                <button disabled={mergeStatusSaving === req.id} onClick={() => updateMergeRequest(req.id, "rejected")}
                                  className="flex items-center gap-1.5 text-xs uppercase tracking-widest px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40">
                                  {mergeStatusSaving === req.id ? <Loader2 size={11} className="animate-spin" /> : <X size={12} />}
                                  Reject
                                </button>
                              </div>
                              <div className="border border-border bg-background p-4 space-y-2">
                                <p className="text-[10px] uppercase tracking-widest text-foreground/40">Set Login Password for Artist</p>
                                <p className="text-xs text-foreground/50">Creates a Clerk account for <span className="text-foreground/70">{req.submittedEmail || "this artist"}</span> and links it to their gallery record.</p>
                                <div className="flex gap-2">
                                  <input
                                    type="password"
                                    placeholder="Enter password (min 8 chars)…"
                                    value={mergePasswords[req.id] ?? ""}
                                    onChange={(e) => setMergePasswords((prev) => ({ ...prev, [req.id]: e.target.value }))}
                                    className="flex-1 bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 placeholder:text-foreground/30"
                                  />
                                  <button
                                    disabled={mergePasswordSaving === req.id || (mergePasswords[req.id] ?? "").length < 8}
                                    onClick={async () => {
                                      const pw = (mergePasswords[req.id] ?? "").trim();
                                      if (!pw) return;
                                      setMergePasswordSaving(req.id);
                                      const res = await fetch(`/api/admin/merge-requests/${req.id}/set-password`, {
                                        method: "POST", credentials: "include",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ password: pw }),
                                      });
                                      if (res.status === 401) { onSessionExpired(); }
                                      else if (res.ok) {
                                        setMergeRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: "completed" } : r));
                                        setMergePasswords((prev) => { const n = { ...prev }; delete n[req.id]; return n; });
                                        toast({ title: "Account created & linked.", description: `${req.submittedEmail} can now sign in.` });
                                      } else {
                                        const body = await res.json().catch(() => ({}));
                                        toast({ title: "Error", description: body.error ?? "Could not create account.", variant: "destructive" });
                                      }
                                      setMergePasswordSaving(null);
                                    }}
                                    className="flex items-center gap-1.5 text-xs uppercase tracking-widest px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40">
                                    {mergePasswordSaving === req.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />}
                                    OK
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "shop" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
            <div className="lg:col-span-2">
              <div className="bg-card border border-border p-6 sticky top-32">
                <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                  <Package size={16} className="text-secondary" />
                  <h2 className="font-display text-lg text-primary">{editingShopId ? "Edit Item" : "New Shop Item"}</h2>
                  {editingShopId && <button onClick={resetShopForm} className="ml-auto text-xs text-foreground/40 hover:text-foreground uppercase tracking-widest">Cancel</button>}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Name *</label>
                    <input type="text" value={shopForm.name} onChange={(e) => setShopForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Gilded Walnut Frame"
                      className="w-full bg-background border border-border py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-secondary placeholder:text-foreground/30" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Type *</label>
                    <select value={shopForm.type} onChange={(e) => {
                      const t = e.target.value;
                      // Frames and Hanging Support are always add-ons; auto-check isAddon
                      const forceAddon = t === "Frames" || t === "Hanging Support";
                      setShopForm((f) => ({ ...f, type: t, isAddon: forceAddon ? true : f.isAddon }));
                    }}
                      className="w-full bg-background border border-border py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-secondary">
                      {SHOP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Description</label>
                    <textarea value={shopForm.description} onChange={(e) => setShopForm((f) => ({ ...f, description: e.target.value }))} rows={2}
                      className="w-full bg-background border border-border py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-secondary resize-none placeholder:text-foreground/30" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Image URL</label>
                    <input type="url" value={shopForm.imageUrl} onChange={(e) => setShopForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…"
                      className="w-full bg-background border border-border py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-secondary placeholder:text-foreground/30" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Price (PKR)</label>
                      <input type="number" min={0} value={shopForm.price} onChange={(e) => setShopForm((f) => ({ ...f, price: Number(e.target.value) }))}
                        className="w-full bg-background border border-border py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-secondary" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Stock</label>
                      <input type="number" min={0} value={shopForm.stock} onChange={(e) => setShopForm((f) => ({ ...f, stock: Number(e.target.value) }))}
                        className="w-full bg-background border border-border py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-secondary" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Status</label>
                    <select value={shopForm.status} onChange={(e) => setShopForm((f) => ({ ...f, status: e.target.value }))}
                      className="w-full bg-background border border-border py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-secondary">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3 py-1">
                    <input type="checkbox" id="isAddon" checked={shopForm.isAddon} onChange={(e) => setShopForm((f) => ({ ...f, isAddon: e.target.checked }))} className="w-4 h-4" />
                    <label htmlFor="isAddon" className="text-xs uppercase tracking-widest text-foreground/70 cursor-pointer">Is Add-on</label>
                  </div>
                  {shopForm.isAddon && (
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-2">Compatible Artwork Types</label>
                      <p className="text-[10px] text-foreground/40 italic mb-2">Leave none selected to match all artwork types.</p>
                      <div className="flex flex-wrap gap-2">
                        {artworkTypes.map((t) => {
                          const sel = shopForm.compatibleArtCategories.includes(t.name);
                          return (
                            <button key={t.id} type="button" onClick={() => toggleArtCategory(t.name)}
                              className={`px-3 py-1.5 text-[10px] uppercase tracking-widest border transition-colors ${sel ? "bg-secondary text-secondary-foreground border-secondary" : "border-border text-foreground/50 hover:border-secondary/60"}`}>
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <button onClick={saveShopItem} disabled={shopSaving || !shopForm.name}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {shopSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {editingShopId ? "Update Item" : "Create Item"}
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              {shopItems.length === 0 ? (
                <div className="text-center py-24 border border-border bg-card">
                  <Package size={36} className="mx-auto mb-4 text-foreground/20" />
                  <p className="font-display text-xl text-foreground/40">No shop items yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {shopItems.map((item) => (
                    <div key={item.id} className={`flex gap-4 bg-card border p-4 items-center transition-colors ${editingShopId === item.id ? "border-secondary/60" : "border-border"}`}>
                      <div className="w-16 h-16 flex-shrink-0 bg-background border border-border overflow-hidden">
                        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" /> : <Package size={18} className="m-auto text-foreground/20 mt-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-display text-sm text-primary truncate">{item.name}</p>
                          <span className="text-[9px] uppercase tracking-widest border border-secondary/40 text-secondary px-1.5 py-0.5 flex-shrink-0">{item.type}</span>
                          {item.isAddon && <span className="text-[9px] uppercase tracking-widest bg-secondary/20 text-secondary px-1.5 py-0.5 flex-shrink-0">Add-on</span>}
                          <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 flex-shrink-0 ${item.status === "active" ? "text-emerald-600 bg-emerald-50 border border-emerald-200" : "text-foreground/40 bg-foreground/5 border border-foreground/10"}`}>{item.status}</span>
                        </div>
                        {item.description && <p className="text-xs text-foreground/50 mt-0.5 italic line-clamp-1">{item.description}</p>}
                        {item.price > 0 && <p className="text-xs text-secondary font-display mt-0.5">{formatMoney(item.price)}</p>}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => startEditShopItem(item)} className="text-foreground/40 hover:text-primary transition-colors p-1" title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => deleteShopItem(item.id)} className="text-foreground/40 hover:text-destructive transition-colors p-1" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "details" && (
          <div className="space-y-14">

            {/* ── Section 1: Shop Item Types ─────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs uppercase tracking-widest text-secondary mb-1">Configuration</p>
                  <h2 className="font-display text-2xl text-primary">Shop Item Types</h2>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
                <div className="lg:col-span-2">
                  <div className="bg-card border border-border p-6 sticky top-32">
                    <div className="flex items-center gap-3 mb-5 border-b border-border pb-4">
                      <Package size={15} className="text-secondary" />
                      <h3 className="font-display text-base text-primary">{editingSitId ? "Edit Type" : "New Type"}</h3>
                      {editingSitId && (
                        <button onClick={() => { setSitForm(EMPTY_SIT); setEditingSitId(null); }}
                          className="ml-auto text-xs text-foreground/40 hover:text-foreground uppercase tracking-widest">Cancel</button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Name *</label>
                        <input type="text" value={sitForm.name} onChange={(e) => setSitForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="e.g. Frames"
                          className="w-full bg-background border border-border py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-secondary" />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Base Price (PKR)</label>
                        <input type="number" min={0} value={sitForm.basePrice} onChange={(e) => setSitForm((f) => ({ ...f, basePrice: Number(e.target.value) }))}
                          className="w-full bg-background border border-border py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-secondary" />
                      </div>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" id="fixedSize" checked={sitForm.fixedSizeSupport}
                          onChange={(e) => setSitForm((f) => ({ ...f, fixedSizeSupport: e.target.checked }))}
                          className="accent-secondary w-4 h-4" />
                        <label htmlFor="fixedSize" className="text-xs uppercase tracking-widest text-foreground/60">Fixed Size Support</label>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Size From</label>
                          <input type="text" value={sitForm.sizeSupportedFrom ?? ""} onChange={(e) => setSitForm((f) => ({ ...f, sizeSupportedFrom: e.target.value }))}
                            placeholder="e.g. 30×40 cm"
                            className="w-full bg-background border border-border py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-secondary" />
                        </div>
                        <div>
                          <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Size To</label>
                          <input type="text" value={sitForm.sizeSupportedTo ?? ""} onChange={(e) => setSitForm((f) => ({ ...f, sizeSupportedTo: e.target.value }))}
                            placeholder="e.g. 100×150 cm"
                            className="w-full bg-background border border-border py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-secondary" />
                        </div>
                      </div>
                      <button disabled={sitSaving || !sitForm.name.trim()}
                        onClick={async () => {
                          setSitSaving(true);
                          const url = editingSitId ? `/api/admin/shop-item-types/${editingSitId}` : "/api/admin/shop-item-types";
                          const method = editingSitId ? "PATCH" : "POST";
                          const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sitForm) });
                          if (res.ok) {
                            const row: ShopItemType = await res.json();
                            setShopItemTypes((prev) => editingSitId ? prev.map((t) => t.id === editingSitId ? row : t) : [...prev, row]);
                            setSitForm(EMPTY_SIT); setEditingSitId(null);
                            toast({ title: editingSitId ? "Type updated." : "Type created." });
                          } else { toast({ title: "Error", variant: "destructive" }); }
                          setSitSaving(false);
                        }}
                        className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary/90 transition-colors">
                        {sitSaving ? <Loader2 size={14} className="animate-spin" /> : editingSitId ? "Save Changes" : <><Plus size={14} /> Add Type</>}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-3">
                  {shopItemTypes.length === 0 ? (
                    <div className="text-center py-16 border border-dashed border-border">
                      <Package size={32} className="mx-auto mb-3 text-foreground/20" />
                      <p className="text-foreground/40 text-sm">No shop item types yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shopItemTypes.map((t) => (
                        <div key={t.id} className="flex items-start gap-4 bg-card border border-border p-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="font-display text-sm text-primary">{t.name}</p>
                              <span className="text-[10px] uppercase tracking-widest border border-secondary/40 text-secondary px-1.5 py-0.5">Rs. {t.basePrice}</span>
                              {t.fixedSizeSupport && <span className="text-[10px] uppercase tracking-widest bg-secondary/10 text-secondary px-1.5 py-0.5">Fixed Size</span>}
                            </div>
                            {(t.sizeSupportedFrom || t.sizeSupportedTo) && (
                              <p className="text-xs text-foreground/50">{t.sizeSupportedFrom} → {t.sizeSupportedTo}</p>
                            )}
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button onClick={() => { setSitForm({ name: t.name, basePrice: t.basePrice, fixedSizeSupport: t.fixedSizeSupport, sizeSupportedFrom: t.sizeSupportedFrom ?? "", sizeSupportedTo: t.sizeSupportedTo ?? "" }); setEditingSitId(t.id); }}
                              className="text-foreground/40 hover:text-primary transition-colors p-1"><Pencil size={14} /></button>
                            <button onClick={async () => {
                              await fetch(`/api/admin/shop-item-types/${t.id}`, { method: "DELETE", credentials: "include" });
                              setShopItemTypes((prev) => prev.filter((x) => x.id !== t.id));
                              toast({ title: "Type deleted." });
                            }} className="text-foreground/40 hover:text-destructive transition-colors p-1"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="border-t border-border" />

            {/* ── Section 2: Art Subcategories ───────────────────────────── */}
            <section>
              <div className="mb-6">
                <p className="text-xs uppercase tracking-widest text-secondary mb-1">Configuration</p>
                <h2 className="font-display text-2xl text-primary">Art Subcategories</h2>
                <p className="text-sm text-foreground/50 mt-1">Add sub-types under each artwork category (e.g. Paintings → Stretched Canvas)</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
                <div className="lg:col-span-2">
                  <div className="bg-card border border-border p-6 sticky top-32">
                    <h3 className="font-display text-base text-primary mb-5 border-b border-border pb-4">Add Subcategory</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Category *</label>
                        <select value={selectedCategoryForSub} onChange={(e) => setSelectedCategoryForSub(e.target.value === "" ? "" : Number(e.target.value))}
                          className="w-full bg-background border border-border py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-secondary">
                          <option value="">— select —</option>
                          {artCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Subcategory Name *</label>
                        <input type="text" value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
                          placeholder="e.g. Stretched Canvas"
                          className="w-full bg-background border border-border py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-secondary" />
                      </div>
                      <button disabled={subSaving || !selectedCategoryForSub || !newSubName.trim()}
                        onClick={async () => {
                          setSubSaving(true);
                          const res = await fetch("/api/admin/art-subcategories", {
                            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ artCategoryId: selectedCategoryForSub, name: newSubName.trim() }),
                          });
                          if (res.ok) {
                            const row: ArtSubcategory = await res.json();
                            setArtSubcategories((prev) => [...prev, row]);
                            setNewSubName("");
                            toast({ title: "Subcategory added." });
                          } else { toast({ title: "Error", variant: "destructive" }); }
                          setSubSaving(false);
                        }}
                        className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary/90 transition-colors">
                        {subSaving ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add Subcategory</>}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-3 space-y-4">
                  {artCategories.length === 0 && <p className="text-foreground/40 text-sm">No categories available.</p>}
                  {artCategories.map((cat) => {
                    const subs = artSubcategories.filter((s) => s.artCategoryId === cat.id);
                    return (
                      <div key={cat.id} className="bg-card border border-border p-4">
                        <p className="font-display text-sm text-primary mb-3">{cat.name}</p>
                        {subs.length === 0 ? (
                          <p className="text-xs text-foreground/30 italic">No subcategories yet.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {subs.map((sub) => (
                              <div key={sub.id} className="flex items-center gap-1.5 border border-secondary/30 bg-secondary/5 px-2.5 py-1.5 text-xs text-foreground/70">
                                {sub.name}
                                <button onClick={async () => {
                                  await fetch(`/api/admin/art-subcategories/${sub.id}`, { method: "DELETE", credentials: "include" });
                                  setArtSubcategories((prev) => prev.filter((s) => s.id !== sub.id));
                                  toast({ title: "Subcategory removed." });
                                }} className="text-foreground/30 hover:text-destructive transition-colors"><X size={11} /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="border-t border-border" />

            {/* ── Section 3: Compatibility Matrix ────────────────────────── */}
            <section>
              <div className="mb-6">
                <p className="text-xs uppercase tracking-widest text-secondary mb-1">Relationships</p>
                <h2 className="font-display text-2xl text-primary">Category → Shop Type Compatibility</h2>
                <p className="text-sm text-foreground/50 mt-1">Define which shop item types apply when an artwork belongs to a specific category or subcategory.</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
                <div className="lg:col-span-2">
                  <div className="bg-card border border-border p-6 sticky top-32">
                    <h3 className="font-display text-base text-primary mb-5 border-b border-border pb-4">Add Link</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Category *</label>
                        <select value={compatCatId} onChange={(e) => { setCompatCatId(e.target.value === "" ? "" : Number(e.target.value)); setCompatSubId(""); }}
                          className="w-full bg-background border border-border py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-secondary">
                          <option value="">— select —</option>
                          {artCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Subcategory</label>
                        <select value={compatSubId} onChange={(e) => setCompatSubId(e.target.value === "" ? "" : Number(e.target.value))}
                          className="w-full bg-background border border-border py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
                          disabled={!compatCatId}>
                          <option value="">All (no specific subcategory)</option>
                          {artSubcategories.filter((s) => s.artCategoryId === Number(compatCatId)).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-1.5">Shop Item Type *</label>
                        <select value={compatTypeId} onChange={(e) => setCompatTypeId(e.target.value === "" ? "" : Number(e.target.value))}
                          className="w-full bg-background border border-border py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-secondary">
                          <option value="">— select —</option>
                          {shopItemTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <button disabled={compatSaving || !compatCatId || !compatTypeId}
                        onClick={async () => {
                          setCompatSaving(true);
                          const res = await fetch("/api/admin/subcategory-compatibility", {
                            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ artCategoryId: compatCatId, artSubcategoryId: compatSubId || null, shopItemTypeId: compatTypeId }),
                          });
                          if (res.ok) {
                            const row: CompatRow = await res.json();
                            const cat = artCategories.find((c) => c.id === row.artCategoryId);
                            const sub = artSubcategories.find((s) => s.id === row.artSubcategoryId);
                            const sit = shopItemTypes.find((t) => t.id === row.shopItemTypeId);
                            setCompatRows((prev) => [...prev, { ...row, categoryName: cat?.name ?? null, subcategoryName: sub?.name ?? null, shopItemTypeName: sit?.name ?? null }]);
                            setCompatCatId(""); setCompatSubId(""); setCompatTypeId("");
                            toast({ title: "Link added." });
                          } else { toast({ title: "Error", variant: "destructive" }); }
                          setCompatSaving(false);
                        }}
                        className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary/90 transition-colors">
                        {compatSaving ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add Link</>}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-3">
                  {compatRows.length === 0 ? (
                    <div className="text-center py-16 border border-dashed border-border">
                      <p className="text-foreground/40 text-sm">No compatibility links yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {compatRows.map((row) => (
                        <div key={row.id} className="flex items-center gap-3 bg-card border border-border p-4">
                          <div className="flex-1 flex items-center gap-2 flex-wrap text-sm">
                            <span className="font-display text-primary">{row.categoryName ?? `Cat #${row.artCategoryId}`}</span>
                            <ChevronRight size={13} className="text-foreground/30" />
                            <span className="text-foreground/60">{row.subcategoryName ?? <span className="italic text-foreground/35">All subcategories</span>}</span>
                            <ChevronRight size={13} className="text-foreground/30" />
                            <span className="text-xs uppercase tracking-widest border border-secondary/40 text-secondary px-1.5 py-0.5">{row.shopItemTypeName ?? `Type #${row.shopItemTypeId}`}</span>
                          </div>
                          <button onClick={async () => {
                            await fetch(`/api/admin/subcategory-compatibility/${row.id}`, { method: "DELETE", credentials: "include" });
                            setCompatRows((prev) => prev.filter((r) => r.id !== row.id));
                            toast({ title: "Link removed." });
                          }} className="text-foreground/30 hover:text-destructive transition-colors flex-shrink-0 p-1"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

          </div>
        )}

        {tab === "galleries" && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-xs uppercase tracking-widest text-secondary mb-1">Gallery Management</p>
                <h2 className="font-display text-2xl text-primary">Gallery Applications</h2>
              </div>
              <button onClick={loadGalleries} className="text-xs uppercase tracking-widest text-foreground/40 hover:text-foreground transition-colors">
                Refresh
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 mb-6 border-b border-border">
              {(["pending", "approved", "rejected"] as const).map((s) => {
                const count = galleries.filter((g) => g.status === s).length;
                return (
                  <button key={s} onClick={() => setGallerySubTab(s)}
                    className={`px-5 py-2.5 text-xs uppercase tracking-widest flex items-center gap-2 border-b-2 -mb-px transition-colors ${gallerySubTab === s ? "border-primary text-primary" : "border-transparent text-foreground/40 hover:text-foreground"}`}>
                    {s}
                    {count > 0 && <span className="bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 min-w-[18px] text-center">{count}</span>}
                  </button>
                );
              })}
            </div>

            {galleriesLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary/40 w-8 h-8" /></div>
            ) : (() => {
              const filtered = galleries.filter((g) => g.status === gallerySubTab);
              if (filtered.length === 0) {
                return (
                  <div className="text-center py-20 border border-dashed border-border">
                    <p className="text-foreground/40 font-display text-lg">No {gallerySubTab} applications.</p>
                  </div>
                );
              }
              return (
                <div className="space-y-4">
                  {filtered.map((g) => (
                    <div key={g.id} className="bg-card border border-border p-6 flex gap-5 items-start">
                      {g.logoUrl ? (
                        <img src={g.logoUrl} alt={g.name} className="w-16 h-16 object-cover border border-border flex-shrink-0" />
                      ) : (
                        <div className="w-16 h-16 bg-foreground/5 border border-border flex items-center justify-center flex-shrink-0">
                          <span className="text-foreground/20 font-display text-xl">{g.name[0]}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-primary text-lg">{g.name}</p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/50">
                          {g.email && <span>{g.email}</span>}
                          {g.phone && <span>{g.phone}</span>}
                          {g.city && <span>{g.city}, {g.country}</span>}
                          {g.websiteUrl && <a href={g.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{g.websiteUrl}</a>}
                        </div>
                        <p className="text-[10px] text-foreground/30 mt-1 uppercase tracking-widest">
                          Applied {new Date(g.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      {gallerySubTab === "pending" && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            disabled={galleryActionSaving === g.id}
                            onClick={async () => {
                              setGalleryActionSaving(g.id);
                              const res = await fetch(`/api/admin/galleries/${g.id}/reject`, { method: "PATCH", credentials: "include" });
                              if (res.ok) { setGalleries((prev) => prev.map((x) => x.id === g.id ? { ...x, status: "rejected" } : x)); toast({ title: "Gallery rejected." }); }
                              setGalleryActionSaving(null);
                            }}
                            className="flex items-center gap-1.5 text-xs uppercase tracking-widest border border-rose-200 text-rose-600 hover:bg-rose-50 px-4 py-2 transition-colors disabled:opacity-40">
                            <X size={13} /> Reject
                          </button>
                          <button
                            disabled={galleryActionSaving === g.id}
                            onClick={async () => {
                              setGalleryActionSaving(g.id);
                              const res = await fetch(`/api/admin/galleries/${g.id}/approve`, { method: "PATCH", credentials: "include" });
                              if (res.ok) { setGalleries((prev) => prev.map((x) => x.id === g.id ? { ...x, status: "approved" } : x)); toast({ title: "Gallery approved — they can now log in." }); }
                              setGalleryActionSaving(null);
                            }}
                            className="flex items-center gap-1.5 text-xs uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 transition-colors disabled:opacity-40">
                            {galleryActionSaving === g.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
                          </button>
                        </div>
                      )}
                      {gallerySubTab !== "pending" && (
                        <span className={`text-[10px] uppercase tracking-widest px-3 py-1 border flex-shrink-0 ${g.status === "approved" ? "text-emerald-700 border-emerald-200 bg-emerald-50" : "text-rose-600 border-rose-200 bg-rose-50"}`}>
                          {g.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {tab === "orders" && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-xs uppercase tracking-widest text-secondary mb-1">Gallery Management</p>
                <h2 className="font-display text-2xl text-primary">Orders</h2>
              </div>
              <button onClick={loadAdminOrders} className="text-xs uppercase tracking-widest text-foreground/40 hover:text-foreground transition-colors">
                Refresh
              </button>
            </div>
            {ordersLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary/40 w-8 h-8" /></div>
            ) : adminOrders.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-border">
                <p className="text-foreground/40 font-display text-lg">No orders yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {adminOrders.map((o) => {
                  const statusMeta: Record<string, { label: string; cls: string }> = {
                    pending_purchase: { label: "Pending Payment", cls: "text-amber-700 bg-amber-50 border-amber-200" },
                    paid:             { label: "Paid",            cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                    shipped:          { label: "Shipped",         cls: "text-blue-700 bg-blue-50 border-blue-200" },
                    delivered:        { label: "Delivered",       cls: "text-foreground/60 bg-foreground/5 border-foreground/10" },
                  };
                  const meta = statusMeta[o.status] ?? statusMeta["pending_purchase"]!;
                  const nextStatuses = ["pending_purchase", "paid", "shipped", "delivered"].filter((s) => s !== o.status);
                  return (
                    <div key={o.id} className="bg-card border border-border p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-border">
                        <div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="font-display text-lg text-primary">Order #{o.id + 10000}</p>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs border uppercase tracking-widest ${meta.cls}`}>{meta.label}</span>
                          </div>
                          <div className="flex gap-4 mt-1 text-xs text-foreground/40">
                            <span>Placed {new Date(o.createdAt).toLocaleDateString("en-AE", { year: "numeric", month: "short", day: "numeric" })}</span>
                            {o.clerkUserId && <span>User: {o.clerkUserId.slice(0, 12)}…</span>}
                          </div>
                          {(o.contactName || o.contactPhone || o.contactEmail) && (
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-foreground/60">
                              {o.contactName  && <span className="font-medium text-foreground/80">{o.contactName}</span>}
                              {o.contactPhone && <span>📞 {o.contactPhone}</span>}
                              {o.contactEmail && <a href={`mailto:${o.contactEmail}`} className="hover:text-primary transition-colors">{o.contactEmail}</a>}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-display text-secondary text-xl">{formatMoney(o.totalAmount)}</span>
                        </div>
                      </div>

                      {/* Line items */}
                      <div className="space-y-3 mb-5">
                        {o.items.map((li) => (
                          <div key={li.id} className="flex items-center gap-4">
                            {li.imageUrl && (
                              <div className="w-12 h-12 overflow-hidden bg-background flex-shrink-0 border border-border">
                                <img src={li.imageUrl} alt={li.title} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-display text-primary truncate">{li.title}</p>
                              <p className="text-xs text-foreground/50">{formatMoney(li.unitPrice)} × {li.quantity}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Status updater + remove */}
                      <div className="flex items-center gap-3 pt-4 border-t border-border flex-wrap">
                        <span className="text-xs uppercase tracking-widest text-foreground/40">Update status:</span>
                        {nextStatuses.map((s) => {
                          const sm = statusMeta[s]!;
                          return (
                            <button key={s} disabled={orderStatusSaving === o.id || orderDeleting === o.id}
                              onClick={async () => {
                                setOrderStatusSaving(o.id);
                                const res = await fetch(`/api/admin/orders/${o.id}/status`, {
                                  method: "PATCH", credentials: "include",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: s }),
                                });
                                if (res.ok) {
                                  setAdminOrders((prev) => prev.map((x) => x.id === o.id ? { ...x, status: s } : x));
                                  toast({ title: `Order #${o.id + 10000} marked as ${sm.label}.` });
                                } else { toast({ title: "Error", variant: "destructive" }); }
                                setOrderStatusSaving(null);
                              }}
                              className={`px-3 py-1.5 text-xs uppercase tracking-widest border transition-colors hover:opacity-80 disabled:opacity-40 ${sm.cls}`}>
                              {orderStatusSaving === o.id ? <Loader2 size={11} className="animate-spin inline" /> : sm.label}
                            </button>
                          );
                        })}
                        <button
                          disabled={orderDeleting === o.id || orderStatusSaving === o.id}
                          onClick={async () => {
                            if (!confirm(`Delete Order #${o.id + 10000}? This cannot be undone.`)) return;
                            setOrderDeleting(o.id);
                            const res = await fetch(`/api/admin/orders/${o.id}`, {
                              method: "DELETE", credentials: "include",
                            });
                            if (res.ok) {
                              setAdminOrders((prev) => prev.filter((x) => x.id !== o.id));
                              toast({ title: `Order #${o.id + 10000} removed.` });
                            } else { toast({ title: "Error", variant: "destructive" }); }
                            setOrderDeleting(null);
                          }}
                          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-widest border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40">
                          {orderDeleting === o.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}


      </div>
    </div>
  );
}

function ArtworkReviewCard({
  art,
  onReview,
  onPriceUpdate,
  showActions,
}: {
  art: PendingArtwork;
  onReview: (id: number, action: "approve" | "reject") => void;
  onPriceUpdate: (id: number, displayPrice: number | null) => void;
  showActions: boolean;
}) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(art.displayPrice != null ? String(art.displayPrice) : "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const savePrice = async () => {
    setSaving(true);
    const displayPrice = priceInput ? Number(priceInput) : null;
    const res = await fetch(`/api/admin/artworks/${art.id}/price`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayPrice }),
    });
    if (res.ok) {
      onPriceUpdate(art.id, displayPrice);
      setEditingPrice(false);
      toast({ title: displayPrice ? `Display price set to ${formatMoney(displayPrice)}` : "Display price cleared." });
    } else {
      toast({ title: "Error", description: "Could not update price.", variant: "destructive" });
    }
    setSaving(false);
  };

  const statusStyles: Record<string, string> = {
    pending:  "text-amber-700 bg-amber-50 border-amber-200",
    approved: "text-emerald-700 bg-emerald-50 border-emerald-200",
    rejected: "text-rose-700 bg-rose-50 border-rose-200",
  };
  const statusIcons: Record<string, React.ReactNode> = {
    pending:  <Clock size={11} />,
    approved: <Check size={11} />,
    rejected: <X size={11} />,
  };
  return (
    <div className="bg-card border border-border">
      <div className="aspect-square overflow-hidden bg-background relative">
        {art.imageUrl
          ? <img src={art.imageUrl} alt={art.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={40} className="text-foreground/20" /></div>}
        <div className="absolute top-3 left-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs border uppercase tracking-widest ${statusStyles[art.status] ?? statusStyles["pending"]}`}>
            {statusIcons[art.status]} {art.status}
          </span>
        </div>
        {art.displayPrice != null && (
          <div className="absolute bottom-3 right-3 bg-background/90 border border-secondary/40 px-2 py-1">
            <span className="font-display text-sm text-secondary">{formatMoney(art.displayPrice)}</span>
          </div>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-display text-lg text-primary mb-1 truncate">{art.title}</h3>
        <p className="text-xs text-foreground/50 uppercase tracking-widest mb-1">by {art.artistName} · {art.artType} · {art.year}</p>
        <p className="text-sm text-foreground/60 line-clamp-2 mb-4 italic">{art.shortDescription}</p>

        {/* Price section */}
        <div className="mb-4 border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-widest text-foreground/50">Display Price</p>
            <button onClick={() => { setEditingPrice((v) => !v); setPriceInput(art.displayPrice != null ? String(art.displayPrice) : ""); }}
              className="text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground transition-colors">
              {editingPrice ? "Cancel" : <><Pencil size={10} className="inline mr-1" />Edit</>}
            </button>
          </div>
          {editingPrice ? (
            <div className="flex gap-2">
              <div className="flex items-center border border-border bg-background overflow-hidden flex-1">
                <span className="px-2 text-xs text-foreground/40 border-r border-border bg-card/50">Rs.</span>
                <input
                  type="number" min={0} value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") savePrice(); }}
                  placeholder="e.g. 20000"
                  className="flex-1 bg-transparent px-2 py-1.5 text-sm text-foreground focus:outline-none"
                />
              </div>
              <button onClick={savePrice} disabled={saving}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-[10px] uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 flex-shrink-0">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              </button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              {art.displayPrice != null ? (
                <span className="font-display text-base text-secondary">{formatMoney(art.displayPrice)}</span>
              ) : (
                <span className="text-xs text-foreground/30 italic">Not set</span>
              )}
              {art.expectedPrice != null && (
                <span className="text-[10px] text-foreground/30">(artist expects {formatMoney(art.expectedPrice)})</span>
              )}
            </div>
          )}
        </div>

        {showActions && (
          <div className="flex gap-2">
            <button onClick={() => onReview(art.id, "reject")} className="flex-1 flex items-center justify-center gap-1.5 text-xs uppercase tracking-widest border border-rose-200 text-rose-600 hover:bg-rose-50 py-2 transition-colors"><X size={13} /> Reject</button>
            <button onClick={() => onReview(art.id, "approve")} className="flex-1 flex items-center justify-center gap-1.5 text-xs uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 py-2 transition-colors"><Check size={13} /> Approve</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    pending:   { icon: <Clock size={12} />,        label: "Pending",   cls: "text-amber-700 bg-amber-50 border-amber-200" },
    contacted: { icon: <MessageCircle size={12} />, label: "Contacted", cls: "text-accent bg-accent/10 border-accent/20" },
    completed: { icon: <CheckCircle size={12} />,   label: "Completed", cls: "text-foreground/40 bg-foreground/5 border-foreground/10" },
  };
  const { icon, label, cls } = map[status] ?? map["pending"]!;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs border uppercase tracking-widest ${cls}`}>{icon}{label}</span>;
}
