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

interface MultiSelectProps {
  options: string[];
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

  // Safety check for options and selected - ensure they're always arrays
  const safeOptions = React.useMemo(() => Array.isArray(options) ? options : [], [options]);
  const safeSelected = React.useMemo(() => Array.isArray(selected) ? selected : [], [selected]);
  const shouldCollapseSelection = maxVisibleBadges !== null && safeSelected.length > maxVisibleBadges;

  // Filter options based on search term
  const filteredOptions = React.useMemo(() => {
    if (!searchTerm.trim()) return safeOptions;
    return safeOptions.filter(option =>
      option.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [safeOptions, searchTerm]);

  const handleUnselect = React.useCallback((item: string) => {
    onChange(safeSelected.filter((s) => s !== item));
  }, [safeSelected, onChange]);

  const handleSelect = React.useCallback((item: string) => {
    if (safeSelected.includes(item)) {
      onChange(safeSelected.filter((s) => s !== item));
    } else {
      onChange([...safeSelected, item]);
    }
  }, [safeSelected, onChange]);

  const handleToggleAll = React.useCallback(() => {
    if (safeSelected.length === filteredOptions.length) {
      // Deselect all filtered options
      onChange(safeSelected.filter(s => !filteredOptions.includes(s)));
    } else {
      // Select all filtered options
      const newSelected = [...new Set([...safeSelected, ...filteredOptions])];
      onChange(newSelected);
    }
  }, [safeSelected, filteredOptions, onChange]);

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
                  {item}
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
                {safeSelected.length === filteredOptions.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          )}
          {filteredOptions.length > 0 ? (
            <div className="p-1">
              {filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-center',
                    highlightSelectedOptions && safeSelected.includes(option) && 'bg-accent text-accent-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                      safeSelected.includes(option)
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
                  <span>{option}</span>
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
