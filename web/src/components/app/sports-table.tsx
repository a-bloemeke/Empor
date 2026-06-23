import { cn } from "@/lib/utils"

const headerGradient = "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))"

export function SportsTable({
  title,
  children,
  className,
  action,
}: {
  title: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border shadow-sm", className)}>
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: headerGradient }}
      >
        <span className="text-white font-bold tracking-wide uppercase text-xs">{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}
