import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, FileText, Video, Play, Expand } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface MessageAttachment {
  url: string;
  type: "image" | "video" | "document";
  name: string;
  size: number;
}

interface MessageAttachmentsProps {
  attachments: MessageAttachment[];
  isOwn: boolean;
}

export function MessageAttachments({ attachments, isOwn }: MessageAttachmentsProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.type === "image");
  const videos = attachments.filter((a) => a.type === "video");
  const documents = attachments.filter((a) => a.type === "document");

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const openLightbox = (index: number) => {
    setSelectedIndex(index);
    setLightboxOpen(true);
  };

  return (
    <>
      <div className="space-y-2 mt-2">
        {/* Image Grid */}
        {images.length > 0 && (
          <div className={cn(
            "grid gap-1 rounded-xl overflow-hidden",
            images.length === 1 && "grid-cols-1",
            images.length === 2 && "grid-cols-2",
            images.length === 3 && "grid-cols-2",
            images.length >= 4 && "grid-cols-2"
          )}>
            {images.slice(0, 4).map((img, index) => (
              <motion.div
                key={index}
                whileTap={{ scale: 0.98 }}
                onClick={() => openLightbox(index)}
                className={cn(
                  "relative cursor-pointer overflow-hidden",
                  images.length === 1 && "aspect-[4/3] max-h-64",
                  images.length === 2 && "aspect-square",
                  images.length === 3 && index === 0 && "row-span-2 aspect-[3/4]",
                  images.length === 3 && index > 0 && "aspect-square",
                  images.length >= 4 && "aspect-square"
                )}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  className="h-full w-full object-cover transition-transform hover:scale-105"
                />
                {index === 3 && images.length > 4 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">+{images.length - 4}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-2 right-2">
                    <Expand className="h-4 w-4 text-white drop-shadow-lg" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Videos */}
        {videos.map((video, index) => (
          <motion.div
            key={index}
            whileTap={{ scale: 0.98 }}
            className="relative aspect-video rounded-xl overflow-hidden bg-secondary cursor-pointer"
            onClick={() => window.open(video.url, "_blank")}
          >
            <video
              src={video.url}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Play className="h-7 w-7 text-white ml-1" fill="white" />
              </div>
            </div>
          </motion.div>
        ))}

        {/* Documents */}
        {documents.map((doc, index) => (
          <motion.a
            key={index}
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            whileTap={{ scale: 0.98 }}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-colors",
              isOwn 
                ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" 
                : "bg-secondary hover:bg-secondary/80"
            )}
          >
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              isOwn ? "bg-primary-foreground/20" : "bg-primary/10"
            )}>
              <FileText className={cn(
                "h-5 w-5",
                isOwn ? "text-primary-foreground" : "text-primary"
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-medium truncate",
                isOwn ? "text-primary-foreground" : "text-foreground"
              )}>
                {doc.name}
              </p>
              <p className={cn(
                "text-xs",
                isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
              )}>
                {formatFileSize(doc.size)}
              </p>
            </div>
            <Download className={cn(
              "h-4 w-4 flex-shrink-0",
              isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
            )} />
          </motion.a>
        ))}
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-0">
          <div className="relative h-full w-full flex items-center justify-center p-4">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
            
            {images[selectedIndex] && (
              <motion.img
                key={selectedIndex}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                src={images[selectedIndex].url}
                alt={images[selectedIndex].name}
                className="max-h-[85vh] max-w-full object-contain rounded-lg"
              />
            )}

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-black/50 rounded-xl backdrop-blur-sm">
                {images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedIndex(index)}
                    className={cn(
                      "h-12 w-12 rounded-lg overflow-hidden transition-all",
                      selectedIndex === index 
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-black" 
                        : "opacity-60 hover:opacity-100"
                    )}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
