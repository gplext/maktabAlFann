import { useState, useRef } from "react";
import { Upload, ImageIcon, Loader2, CheckCircle } from "lucide-react";

type UploadState = "idle" | "uploading" | "done" | "error";

interface Props {
  onUploadComplete: (objectPath: string) => void;
  label?: string;
  className?: string;
}

export function ImageUploader({ onUploadComplete, label = "Upload Image", className = "" }: Props) {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Only image files are allowed.");
      setState("error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg("Image must be under 20 MB.");
      setState("error");
      return;
    }

    setPreview(URL.createObjectURL(file));
    setState("uploading");
    setProgress(0);
    setErrorMsg("");

    try {
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await metaRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Upload error"));
        xhr.send(file);
      });

      setProgress(100);
      setState("done");
      onUploadComplete(objectPath);
    } catch (err) {
      setErrorMsg((err as Error).message ?? "Upload failed");
      setState("error");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-widest text-foreground/50 mb-3 flex items-center gap-2">
        <ImageIcon size={13} /> {label}
      </p>

      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => state !== "uploading" && inputRef.current?.click()}
        className={`relative border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 py-10 px-6 text-center
          ${state === "uploading" ? "border-primary/40 cursor-wait" : "border-border hover:border-primary/50"}
          ${state === "done" ? "border-emerald-300" : ""}
          ${state === "error" ? "border-rose-300" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onFileChange}
          disabled={state === "uploading"}
        />

        {state === "idle" && !preview && (
          <>
            <Upload size={28} className="text-foreground/30" />
            <div>
              <p className="text-sm text-foreground/60">Drag & drop or click to browse</p>
              <p className="text-xs text-foreground/30 mt-1">JPG, PNG, WebP · max 20 MB</p>
            </div>
          </>
        )}

        {preview && state !== "idle" && (
          <div className="flex flex-col items-center gap-4 w-full">
            <img src={preview} alt="Preview" className="max-h-48 max-w-full object-contain border border-border" />
            {state === "uploading" && (
              <div className="w-full max-w-xs">
                <div className="flex items-center gap-2 mb-1.5">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span className="text-xs text-foreground/60 uppercase tracking-widest">Uploading {progress}%</span>
                </div>
                <div className="h-1 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            {state === "done" && (
              <p className="text-xs text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle size={13} /> Uploaded successfully · click to replace
              </p>
            )}
            {state === "error" && (
              <p className="text-xs text-rose-600 uppercase tracking-widest">{errorMsg} · click to retry</p>
            )}
          </div>
        )}

        {state === "error" && !preview && (
          <p className="text-xs text-rose-600">{errorMsg}</p>
        )}
      </div>
    </div>
  );
}
