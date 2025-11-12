
"use client"

import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { Check, X, ChevronsUpDown, Trash2 } from "lucide-react"
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
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"


export type MultiSelectOption = {
  value: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

const multiSelectVariants = cva(
  "m-1 transition-all duration-300 ease-in-out border-foreground/10 text-foreground bg-card hover:bg-card/80",
  {
    variants: {
      variant: {
        default:
          "border-secondary/10 text-secondary bg-secondary/10 hover:bg-secondary/80",
        primary:
          "border-primary/10 text-primary bg-primary/10 hover:bg-primary/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface MultiSelectProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof multiSelectVariants> {
  options: MultiSelectOption[]
  onValueChange: (value: string[]) => void
  defaultValue: string[]
  placeholder?: string
  animation?: number
  maxCount?: number
  asChild?: boolean
  className?: string
}

export const MultiSelect = React.forwardRef<
  HTMLButtonElement,
  MultiSelectProps
>(
  (
    {
      options,
      onValueChange,
      variant,
      defaultValue = [],
      placeholder = "Select options",
      animation = 0,
      maxCount = 3,
      asChild = false,
      className,
      ...props
    },
    ref
  ) => {
    const [selectedValues, setSelectedValues] =
      React.useState<string[]>(defaultValue)
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false)

    React.useEffect(() => {
      if (JSON.stringify(selectedValues) !== JSON.stringify(defaultValue)) {
        setSelectedValues(defaultValue)
      }
    }, [defaultValue, selectedValues])

    const handleInputKeyDown = (
      event: React.KeyboardEvent<HTMLInputElement>
    ) => {
      if (event.key === "Enter") {
        setIsPopoverOpen(true)
      } else if (event.key === "Backspace" && !event.currentTarget.value) {
        const newSelectedValues = [...selectedValues]
        newSelectedValues.pop()
        setSelectedValues(newSelectedValues)
        onValueChange(newSelectedValues)
      }
    }

    const toggleOption = (value: string) => {
      const newSelectedValues = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value]
      setSelectedValues(newSelectedValues)
      onValueChange(newSelectedValues)
    }

    return (
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            {...props}
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            className={cn(
              "flex w-full p-1 rounded-md border min-h-10 h-auto items-center justify-between bg-inherit hover:bg-card",
              className
            )}
          >
            {selectedValues.length > 0 ? (
              <div className="flex justify-between items-center w-full">
                <div className="flex flex-wrap items-center">
                  {selectedValues.slice(0, maxCount).map((value) => {
                    const option = options.find((o) => o.value === value)
                    if (!option) return null;
                    const Icon = option.icon
                    return (
                      <Badge
                        key={value}
                        className={cn(multiSelectVariants({ variant }))}
                        style={{
                          animation: `animation-${animation}s`,
                        }}
                      >
                        {Icon && <Icon className="h-4 w-4 mr-2" />}
                        {option.label}
                        <X
                          className="ml-2 h-4 w-4 cursor-pointer"
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleOption(value)
                          }}
                        />
                      </Badge>
                    )
                  })}
                  {selectedValues.length > maxCount && (
                    <Badge
                      className={cn(
                        "bg-transparent text-foreground border-foreground/10 hover:bg-card",
                        multiSelectVariants({ variant })
                      )}
                      style={{
                        animation: `animation-${animation}s`,
                      }}
                    >
                      {`+ ${selectedValues.length - maxCount} more`}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <X
                    className="h-4 w-4 cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedValues([])
                      onValueChange([])
                    }}
                  />
                  <Separator
                    orientation="vertical"
                    className="flex min-h-6 h-full"
                  />
                  <ChevronsUpDown className="h-4 w-4" />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full mx-auto">
                <span className="text-sm text-muted-foreground mx-3">
                  {placeholder}
                </span>
                <ChevronsUpDown className="h-4 w-4 mx-2" />
              </div>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-full p-0"
          align="start"
          onEscapeKeyDown={() => setIsPopoverOpen(false)}
        >
          <Command>
            <CommandInput
              placeholder="Search..."
              onKeyDown={handleInputKeyDown}
            />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selectedValues.includes(option.value)
                  return (
                    <CommandItem
                      key={option.value}
                      onSelect={() => toggleOption(option.value)}
                      style={{
                        pointerEvents: "auto",
                        opacity: 1,
                      }}
                      className="cursor-pointer"
                    >
                      <div
                        className={cn(
                          "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50 [&_svg]:invisible"
                        )}
                      >
                        <Check className="h-4 w-4" />
                      </div>
                      {option.icon && (
                        <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      )}
                      <span>{option.label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <div className="flex items-center justify-between">
                  {selectedValues.length > 0 && (
                    <>
                      <CommandItem
                        onSelect={() => {
                          setSelectedValues([])
                          onValueChange([])
                        }}
                        style={{
                          pointerEvents: "auto",
                          opacity: 1,
                        }}
                        className="flex-1 justify-center cursor-pointer"
                      >
                        Clear
                      </CommandItem>
                      <Separator
                        orientation="vertical"
                        className="flex min-h-6 h-full"
                      />
                    </>
                  )}
                  <CommandItem
                    onSelect={() => setIsPopoverOpen(false)}
                    style={{
                      pointerEvents: "auto",
                      opacity: 1,
                    }}
                    className="flex-1 justify-center cursor-pointer"
                  >
                    Close
                  </CommandItem>
                </div>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }
)
MultiSelect.displayName = "MultiSelect"
