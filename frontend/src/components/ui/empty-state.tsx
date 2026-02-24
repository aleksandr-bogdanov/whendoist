import * as React from "react"

import { cn } from "@/lib/utils"

interface EmptyStateProps extends React.ComponentProps<"div"> {
  illustration?: string
  illustrationClassName?: string
  title: string
  description?: string
}

function EmptyState({
  illustration,
  illustrationClassName,
  title,
  description,
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        className
      )}
      {...props}
    >
      {illustration && (
        <img
          src={illustration}
          alt=""
          aria-hidden="true"
          className={cn("mb-4 h-20 w-20", illustrationClassName)}
        />
      )}
      <p className="text-sm text-muted-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground/60 mt-1">{description}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export { EmptyState }
