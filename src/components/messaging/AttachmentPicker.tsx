import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Image, 
  FileText, 
  Video, 
  X, 
  Plus, 
  Camera,
  Paperclip
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface Attachment {
  id: string;
  file: File;
  preview: string;
  type: "image" | "video" | "document";
  name: string;
  size: number;
}

interface AttachmentPickerProps {
  attachments: Attachment[];
  onAdd: (attachments: Attachment[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export function AttachmentPicker({ 
  attachments, 
  onAdd, 
  onRemove,
  disabled 
}: AttachmentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (files: FileList | null, type: "image" | "video" | "document") => {
    if (!files) return;

    const newAttachments: Attachment[] = [];
    
    Array.from(files).forEach((file) => {
      const fileType = file.type.startsWith("image/") 
        ? "image" 
        : file.type.startsWith("video/") 
          ? "video" 
          : "document";

      const attachment: Attachment = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview: fileType === "image" || fileType === "video" 
          ? URL.createObjectURL(file) 
          : "",
        type: fileType,
        name: file.name,
        size: file.size,
      };
      
      newAttachments.push(attachment);
    });

    onAdd(newAttachments);
    setIsOpen(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case "image":
        return <Image className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Hidden inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files, "image")}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,video/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files, "document")}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files, "image")}
      />

      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            disabled={disabled}
            className="relative"
          >
            <Plus className="h-5 w-5" />
            {attachments.length > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-[10px] font-bold flex items-center justify-center text-primary-foreground">
                {attachments.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
            <Camera className="h-4 w-4 mr-2" />
            Take Photo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
            <Image className="h-4 w-4 mr-2" />
            Photo Library
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-4 w-4 mr-2" />
            Attach File
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface AttachmentPreviewBarProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreviewBar({ attachments, onRemove }: AttachmentPreviewBarProps) {
  if (attachments.length === 0) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="border-t border-border bg-card/30 overflow-hidden"
    >
      <div className="p-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          <AnimatePresence>
            {attachments.map((attachment) => (
              <motion.div
                key={attachment.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="relative flex-shrink-0"
              >
                {attachment.type === "image" ? (
                  <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-border">
                    <img
                      src={attachment.preview}
                      alt={attachment.name}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  </div>
                ) : attachment.type === "video" ? (
                  <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-border bg-secondary">
                    <video
                      src={attachment.preview}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Video className="h-6 w-6 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="h-20 w-28 rounded-xl border border-border bg-secondary p-2 flex flex-col justify-between">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] font-medium truncate">{attachment.name}</p>
                      <p className="text-[9px] text-muted-foreground">{formatFileSize(attachment.size)}</p>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => onRemove(attachment.id)}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
