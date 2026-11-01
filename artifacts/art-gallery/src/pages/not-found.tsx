import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { usePageMeta, SITE_NAME } from "@/lib/seo";

export default function NotFound() {
  usePageMeta({ title: `Page not found | ${SITE_NAME}`, noindex: true });
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-foreground">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-foreground/60">
            Did you forget to add the page to the router?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
