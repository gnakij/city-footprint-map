import * as React from "react"

import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

const commandVariants = cva(
  "flex h-full w-full flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground",
  {
    variants: {
      variant: {
        default: "",
      },
      size: {
        default: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Command = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    shouldFilter?: boolean
  }
>(({ className, shouldFilter = true, ...props }, ref) => (
  <div ref={ref} className={commandVariants({ className })} {...props} />
))
Command.displayName = "Command"

const CommandInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="mr-2 h-4 w-4 shrink-0 opacity-50"
    >
      <path
        d="M11 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-5 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm12 0a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
      />
    </svg>
    <input
      ref={ref}
      className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  </div>
))
CommandInput.displayName = "CommandInput"

const CommandList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className="max-h-[300px] overflow-y-auto overflow-x-hidden" {...props} />
))
CommandList.displayName = "CommandList"

const CommandEmpty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className="py-6 text-center text-sm"
    cmdk-empty=""
    {...props}
  />
))
CommandEmpty.displayName = "CommandEmpty"

const CommandGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className="overflow-hidden p-1" {...props} />
))
CommandGroup.displayName = "CommandGroup"

const CommandItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    onSelect?: (value: string) => void
    value?: string
  }
>(({ className, onSelect, value, ...props }, ref) => {
  const handleSelect = React.useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if (onSelect && value) {
        onSelect(value)
      }
    },
    [onSelect, value]
  )

  return (
    <div
      ref={ref}
      className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50"
      role="option"
      aria-selected="false"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleSelect}
      {...props}
    />
  )
})
CommandItem.displayName = "CommandItem"

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
}