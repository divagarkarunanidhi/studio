
"use client"

import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
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
import { Combobox, type ComboboxOption as SingleSelectOption } from "./combobox"

export type { SingleSelectOption };


interface SingleSelectProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  options: SingleSelectOption[]
  onValueChange: (value: string) => void
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

    return (
     <Combobox 
        options={options}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        className={className}
     />
    )
  }
)
SingleSelect.displayName = "SingleSelect"

    