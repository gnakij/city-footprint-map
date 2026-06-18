import { useMemo } from "react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/shadcn/command"

interface ShadcnFuzzySelectProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  onSelect: (value: string) => void
  placeholder: string
  searchKeys?: Record<string, string>
}

function matchesOption(option: string, query: string, searchKey?: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  return [option, searchKey]
    .filter((text): text is string => Boolean(text))
    .some((text) => text.toLowerCase().includes(normalizedQuery))
}

export default function ShadcnFuzzySelect({
  options,
  value,
  onChange,
  onSelect,
  placeholder,
  searchKeys,
}: ShadcnFuzzySelectProps) {
  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        matchesOption(option, value, searchKeys?.[option])
      ),
    [options, searchKeys, value]
  )

  const handleSelect = (selectedValue: string) => {
    onSelect(selectedValue)
    onChange(selectedValue)
  }

  return (
    <Command shouldFilter={false}>
      <CommandInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          {filteredOptions.map((option) => (
            <CommandItem key={option} value={option} onSelect={(e) => handleSelect(option)}>
              {option}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}