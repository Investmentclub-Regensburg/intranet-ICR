import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Modern und ruhig (Feedback 2026-10-09, löst den eckigen Website-Look mit Rotschatten
// und Anheben ab): abgerundet (rounded-lg), mittlere Schriftstärke, Primär einfarbig mit
// feiner Innenkante statt Glow, beim Klicken minimal eingedrückt. Alle Buttons im
// Intranet laufen hierüber (auch AlertDialog, Kalender) bzw. über buttonVariants;
// Icon-Aktionen über components/kit/IconButton.tsx im selben Stil.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,color,border-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/35 focus-visible:ring-[3px] focus-visible:ring-offset-1 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.14)] hover:bg-primary/90",
        // Markenrot ist schon Primär: Destruktives als ruhiger Rahmen-Button mit roter Schrift,
        // beim Hover rot hinterlegt.
        destructive:
          "border border-border bg-card text-destructive shadow-xs hover:border-destructive/30 hover:bg-destructive/[0.06] focus-visible:ring-destructive/25",
        outline:
          "border border-border bg-card text-foreground shadow-xs hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-border/70",
        ghost:
          "text-foreground hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-3.5 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-[0.8125rem] has-[>svg]:px-2.5",
        lg: "h-11 px-5 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
