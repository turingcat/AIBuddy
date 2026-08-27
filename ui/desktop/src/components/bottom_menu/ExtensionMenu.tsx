import { useMemo, useState } from 'react';
import { Puzzle } from 'lucide-react';
import type { FixedExtensionEntry } from '../ConfigContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { getLocalizedExtensionCopy } from '../settings/extensions/subcomponents/ExtensionList';
import { useIntl } from '../../i18n';

interface ExtensionMenuProps {
  extensions: FixedExtensionEntry[];
  title: string;
  searchPlaceholder: string;
  description: string;
  emptyMessage: string;
  noResultsMessage: string;
  triggerLabel?: string;
  hidden: boolean;
  isTransitioning: boolean;
  isSortPending: boolean;
  togglingExtensionName: string | null;
  onToggle: (extension: FixedExtensionEntry) => void;
  onClose?: () => void;
}

export function ExtensionMenu({
  extensions,
  title,
  searchPlaceholder,
  description,
  emptyMessage,
  noResultsMessage,
  triggerLabel,
  hidden,
  isTransitioning,
  isSortPending,
  togglingExtensionName,
  onToggle,
  onClose,
}: ExtensionMenuProps) {
  const intl = useIntl();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredExtensions = useMemo(() => {
    return extensions.filter((extension) => {
      const query = searchQuery.toLowerCase();
      const copy = getLocalizedExtensionCopy(extension, intl);
      const aliases = [
        copy.title,
        copy.description,
        extension.name,
        'display_name' in extension ? extension.display_name : undefined,
        extension.description,
        extension.configKey,
      ];
      return aliases.some((alias) => alias?.toLowerCase().includes(query));
    });
  }, [extensions, intl, searchQuery]);

  const sortedExtensions = useMemo(() => {
    return [...filteredExtensions].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return getLocalizedExtensionCopy(a, intl).title.localeCompare(
        getLocalizedExtensionCopy(b, intl).title
      );
    });
  }, [filteredExtensions, intl]);

  const activeCount = useMemo(() => {
    return extensions.filter((extension) => extension.enabled).length;
  }, [extensions]);

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSearchQuery('');
          onClose?.();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center [&_svg]:size-4 text-text-primary/70 hover:text-text-primary hover:scale-100 hover:bg-transparent text-xs cursor-pointer ${hidden ? 'invisible' : ''}`}
          aria-label={triggerLabel ?? title}
          title={triggerLabel ?? title}
        >
          <Puzzle className="mr-1 h-4 w-4" />
          {triggerLabel && <span className="mr-1">{triggerLabel}</span>}
          <span>{activeCount}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="center"
        className="w-64"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        <div className="p-2">
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
          <p className="text-xs text-text-primary/60 mt-1.5">{description}</p>
        </div>
        <div
          className={`max-h-[400px] overflow-y-auto transition-opacity duration-300 ${
            isTransitioning && isSortPending ? 'opacity-50' : 'opacity-100'
          }`}
        >
          {sortedExtensions.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-text-primary/70">
              {searchQuery ? noResultsMessage : emptyMessage}
            </div>
          ) : (
            sortedExtensions.map((extension) => {
              const isToggling = togglingExtensionName === extension.name;
              const copy = getLocalizedExtensionCopy(extension, intl);
              return (
                <div
                  key={extension.name}
                  className={`flex items-center justify-between px-2 py-2 transition-all duration-300 ${
                    isToggling ? 'cursor-wait opacity-70' : 'cursor-pointer'
                  }`}
                  onClick={() => !isToggling && onToggle(extension)}
                  title={copy.description || copy.title}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary">{copy.title}</div>
                    {copy.description && (
                      <div className="text-xs text-text-primary/60 truncate mt-0.5">
                        {copy.description}
                      </div>
                    )}
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={extension.enabled}
                      onCheckedChange={() => onToggle(extension)}
                      variant="mono"
                      disabled={isToggling}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
