import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * iOS/Android-style bottom sheet using vaul.
 * Swipe down to dismiss, backdrop click to close.
 */
export function BottomSheet({ open, onOpenChange, title, children, className }: BottomSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 mt-24 flex flex-col rounded-t-[16px]",
            "bg-background border-t border-border",
            "max-h-[85vh]",
            className,
          )}
        >
          {/* Handle */}
          <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/20" />

          {/* Title */}
          {title && (
            <Drawer.Title className="px-4 pb-2 text-sm font-medium text-foreground">
              {title}
            </Drawer.Title>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 pb-safe">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
