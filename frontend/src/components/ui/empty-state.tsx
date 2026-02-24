import * as React from "react"

import { cn } from "@/lib/utils"

interface EmptyStateProps extends React.ComponentProps<"div"> {
  illustration?: string
  title: string
  description?: string
}

function EmptyState({
  illustration,
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
          className="mb-4 h-20 w-20"
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
