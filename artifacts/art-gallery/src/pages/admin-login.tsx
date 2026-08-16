import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        setLocation("/admin");
      } else {
        const data = await res.json();
        toast({
          title: "Access Denied",
          description: data.error ?? "Invalid credentials.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Could not reach server.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-20">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-none bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <Lock size={24} className="text-primary" />
          </div>
          <p className="text-xs uppercase tracking-widest text-secondary mb-2">Restricted Access</p>
          <h1 className="font-display text-4xl text-primary mb-3">Gallery Admin</h1>
          <div className="w-16 h-px bg-secondary mx-auto mb-4" />
          <p className="text-foreground/50 italic text-sm">Enter your administrator credentials</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border p-8 space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full bg-background border border-border text-foreground px-4 py-3 text-sm focus:outline-none focus:border-primary/60 transition-colors"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-foreground/60 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-background border border-border text-foreground px-4 py-3 text-sm focus:outline-none focus:border-primary/60 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground font-display tracking-widest uppercase py-4 hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-3"
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" /> Verifying…</>
            ) : (
              "Enter Admin Panel"
            )}
          </button>
        </form>

        <p className="text-center mt-6 text-xs text-foreground/30 uppercase tracking-widest">
          Maktaba Al-Fann · Gallery Management
        </p>
      </div>
    </div>
  );
}
