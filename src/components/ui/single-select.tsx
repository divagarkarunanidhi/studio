
"use client"

import { cn } from "@/lib/utils"
import { Check, ChevronsUpDown } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type SingleSelectOption = {
  value: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface SingleSelectProps {
  options: SingleSelectOption[]
  onValueChange: (value?: string) => void
  value?: string
  placeholder?: string
  emptyMessage?: string
  className?: string
}

export const SingleSelect = React.forwardRef<
  HTMLButtonElement,
  SingleSelectProps
>(
  (
    {
      options,
      onValueChange,
      value,
      placeholder = "Select an option",
      emptyMessage = "No results found.",
      className,
      ...props
    },
    ref
  ) => {
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false)

    const selectedOption = options.find((option) => option.value === value)

    const handleSelect = (currentValue: string) => {
      onValueChange(currentValue === value ? undefined : currentValue)
      setIsPopoverOpen(false)
    }

    return (
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            {...props}
            variant="outline"
            role="combobox"
            aria-expanded={isPopoverOpen}
            className={cn("w-full justify-between h-10 p-1 bg-background hover:bg-card", className)}
          >
            {selectedOption ? (
              <Badge
                key={selectedOption.value}
                className="m-1 transition-all duration-300 ease-in-out border-foreground/10 text-foreground bg-card hover:bg-card/80"
              >
                {selectedOption.label}
              </Badge>
            ) : (
              <span className="text-sm text-muted-foreground mx-3">
                {placeholder}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={handleSelect}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.icon && (
                      <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }
)
SingleSelect.displayName = "SingleSelect"
