
"use client"

import { Command as CommandPrimitive } from "cmdk"
import { X } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"

export type MultiSelectOption = {
  value: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  selected?: MultiSelectOption[]
  onChange: React.Dispatch<React.SetStateAction<MultiSelectOption[]>>
  className?: string
  placeholder?: string
}

export function MultiSelect({
  options,
  selected = [],
  onChange,
  className,
  ...props
}: MultiSelectProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")

  const handleUnselect = React.useCallback(
    (option: MultiSelectOption) => {
      onChange(selected.filter((s) => s.value !== option.value))
    },
    [onChange, selected]
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const input = inputRef.current
      if (input) {
        if (e.key === "Delete" || e.key === "Backspace") {
          if (input.value === "") {
            const newSelected = [...selected]
            newSelected.pop()
            onChange(newSelected)
          }
        }
        if (e.key === "Escape") {
          input.blur()
        }
      }
    },
    [onChange, selected]
  )

  const selectables = options.filter(
    (option) => !selected.some((s) => s.value === option.value)
  )

  return (
    <Command
      onKeyDown={handleKeyDown}
      className={cn("overflow-visible bg-transparent", className)}
    >
      <div className="group rounded-md border border-input px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <div className="flex flex-wrap gap-1">
          {selected.map((option) => {
            return (
              <Badge key={option.value} variant="secondary">
                {option.label}
                <div
                  className="ml-1 cursor-pointer rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleUnselect(option)
                    }
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onClick={() => handleUnselect(option)}
                  role="button"
                  tabIndex={0}
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </div>
              </Badge>
            )
          })}
          {selected.length > 0 && (
            <X
              className="my-auto ml-auto h-4 w-4 cursor-pointer text-muted-foreground"
              onClick={(event) => {
                event.preventDefault()
                onChange([])
              }}
            />
          )}
          <CommandPrimitive.Input
            ref={inputRef}
            value={inputValue}
            onValueChange={setInputValue}
            onBlur={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            placeholder={
              selected.length > 0 ? "" : props.placeholder || "Select..."
            }
            className="ml-2 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="relative mt-2">
        <CommandList>
          {open && selectables.length > 0 ? (
            <div className="absolute top-0 z-10 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in">
              <CommandGroup className="h-full overflow-auto">
                {selectables.map((option) => {
                  return (
                    <CommandItem
                      key={option.value}
                      onMouseDown={(e) => {
                        e.preventDefault()
                      }}
                      onSelect={() => {
                        setInputValue("")
                        onChange([...selected, option])
                      }}
                      className={"cursor-pointer"}
                    >
                      {option.label}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </div>
          ) : null}
        </CommandList>
      </div>
    </Command>
  )
}
