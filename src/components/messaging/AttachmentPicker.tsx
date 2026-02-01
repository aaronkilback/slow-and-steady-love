import { useRef } from "react";
import { Image, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Attachment {
  id: string;
  file: File;
  preview: string;
  type: "image" | "video" | "document";
  name: string;
  size: number;
}

interface AttachmentPickerProps {
  onAdd: (attachments: Attachment[]) => void;
  disabled?: boolean;
}

export function AttachmentPicker({ onAdd, disabled }: AttachmentPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: file.type.startsWith("image/") || file.type.startsWith("video/")
        ? URL.createObjectURL(file)
        : "",
      type: file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "document",
      name: file.name,
      size: file.size,
    }));

    onAdd(newAttachments);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        className="h-10 w-10 text-muted-foreground hover:text-foreground"
      >
        <Paperclip className="h-5 w-5" />
      </Button>
    </>
  );
}

interface AttachmentPreviewBarProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreviewBar({ attachments, onRemove }: AttachmentPreviewBarProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex gap-2 px-4 py-2 border-t border-border bg-card/30 overflow-x-auto">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="relative flex-shrink-0">
          {attachment.type === "image" ? (
            <div className="h-16 w-16 rounded-lg overflow-hidden border border-border">
              <img src={attachment.preview} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-16 w-20 rounded-lg border border-border bg-secondary p-2 flex flex-col justify-end">
              <p className="text-[9px] truncate">{attachment.name}</p>
            </div>
          )}
          <button
            onClick={() => onRemove(attachment.id)}
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-white flex items-center justify-center"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
