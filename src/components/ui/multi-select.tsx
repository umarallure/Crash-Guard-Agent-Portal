import * as React from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  searchText?: string;
  itemClassName?: string;
}

interface MultiSelectProps {
  options: Array<string | MultiSelectOption>;
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  maxVisibleBadges?: number | null;
  selectedDisplayMode?: 'wrap' | 'scroll';
  highlightSelectedOptions?: boolean;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select items...',
  className,
  maxVisibleBadges = 3,
  selectedDisplayMode = 'wrap',
  highlightSelectedOptions = true,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

  const safeOptions = React.useMemo(() => (Array.isArray(options) ? options : []), [options]);
  const safeSelected = React.useMemo(() => (Array.isArray(selected) ? selected : []), [selected]);
  const shouldCollapseSelection = maxVisibleBadges !== null && safeSelected.length > maxVisibleBadges;

  const normalizedOptions = React.useMemo<MultiSelectOption[]>(() => {
    return safeOptions.reduce<MultiSelectOption[]>((acc, option) => {
      if (typeof option === 'string') {
        acc.push({
          value: option,
          label: option,
          searchText: option,
        });
        return acc;
      }

      const value = option?.value?.trim();
      if (!value) return acc;

      const label = option.label?.trim() || value;
      acc.push({
        value,
        label,
        searchText: option.searchText?.trim() || `${label} ${value}`,
        itemClassName: option.itemClassName?.trim() || undefined,
      });
      return acc;
    }, []);
  }, [safeOptions]);

  const optionLabelByValue = React.useMemo(() => {
    const map = new Map<string, string>();
    normalizedOptions.forEach((option) => {
      map.set(option.value, option.label);
    });
    return map;
  }, [normalizedOptions]);

  const filteredOptions = React.useMemo(() => {
    const trimmedSearch = searchTerm.trim().toLowerCase();
    if (!trimmedSearch) return normalizedOptions;

    return normalizedOptions.filter((option) =>
      `${option.label} ${option.value} ${option.searchText || ''}`.toLowerCase().includes(trimmedSearch)
    );
  }, [normalizedOptions, searchTerm]);

  const allFilteredSelected = React.useMemo(() => {
    const filteredValues = filteredOptions.map((option) => option.value);
    return filteredValues.length > 0 && filteredValues.every((value) => safeSelected.includes(value));
  }, [filteredOptions, safeSelected]);

  const handleUnselect = React.useCallback((item: string) => {
    onChange(safeSelected.filter((selectedItem) => selectedItem !== item));
  }, [safeSelected, onChange]);

  const handleSelect = React.useCallback((item: string) => {
    if (safeSelected.includes(item)) {
      onChange(safeSelected.filter((selectedItem) => selectedItem !== item));
    } else {
      onChange([...safeSelected, item]);
    }
  }, [safeSelected, onChange]);

  const handleToggleAll = React.useCallback(() => {
    const filteredValues = filteredOptions.map((option) => option.value);

    if (allFilteredSelected) {
      onChange(safeSelected.filter((selectedValue) => !filteredValues.includes(selectedValue)));
    } else {
      onChange([...new Set([...safeSelected, ...filteredValues])]);
    }
  }, [allFilteredSelected, filteredOptions, onChange, safeSelected]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between min-h-10 h-auto', className)}
        >
          <div
            className={cn(
              'flex flex-1 gap-1',
              selectedDisplayMode === 'scroll'
                ? 'overflow-x-auto whitespace-nowrap pr-1'
                : 'flex-wrap'
            )}
          >
            {safeSelected.length === 0 && (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            {safeSelected.length > 0 && !shouldCollapseSelection ? (
              safeSelected.map((item) => (
                <Badge
                  variant="secondary"
                  key={item}
                  className={cn(
                    'text-xs',
                    selectedDisplayMode === 'scroll' ? 'shrink-0' : 'mr-1 mb-1'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnselect(item);
                  }}
                >
                  {optionLabelByValue.get(item) ?? item}
                  <button
                    className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUnselect(item);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleUnselect(item);
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </Badge>
              ))
            ) : safeSelected.length > 0 ? (
              <Badge variant="secondary" className="mr-1 mb-1 text-xs">
                {safeSelected.length} selected
              </Badge>
            ) : null}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <div className="p-2">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="max-h-64 overflow-auto border-t">
          {filteredOptions.length > 0 && (
            <div className="p-2 border-b">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleAll}
                className="w-full justify-start text-xs"
              >
                {allFilteredSelected ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          )}
          {filteredOptions.length > 0 ? (
            <div className="p-1">
              {filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-center',
                    highlightSelectedOptions && safeSelected.includes(option.value) && 'bg-accent text-accent-foreground',
                    option.itemClassName
                  )}
                >
                  <div
                    className={cn(
                      'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                      safeSelected.includes(option.value)
                        ? 'bg-primary text-primary-foreground'
                        : 'opacity-50 [&_svg]:invisible'
                    )}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {searchTerm ? 'No items found.' : 'No options available.'}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
