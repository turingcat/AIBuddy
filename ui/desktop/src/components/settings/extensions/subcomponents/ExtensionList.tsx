import ExtensionItem from './ExtensionItem';
import builtInExtensionsData from '../../../../built-in-extensions.json';
import type { ExtensionConfig } from '../../../../types/extensions';
import { FixedExtensionEntry } from '../../../ConfigContext';
import { combineCmdAndArgs } from '../utils';
import { defineMessages, useIntl } from '../../../../i18n';
import type { IntlShape } from 'react-intl';

const i18n = defineMessages({
  defaultExtensions: {
    id: 'extensionList.defaultExtensions',
    defaultMessage: 'Default Extensions ({count})',
  },
  availableExtensions: {
    id: 'extensionList.availableExtensions',
    defaultMessage: 'Available Extensions ({count})',
  },
  noExtensions: {
    id: 'extensionList.noExtensions',
    defaultMessage: 'No extensions available',
  },
  builtInExtension: {
    id: 'extensionList.builtInExtension',
    defaultMessage: 'Built-in extension',
  },
  developerTitle: {
    id: 'extensionList.builtIns.developer.title',
    defaultMessage: 'Developer',
  },
  developerDescription: {
    id: 'extensionList.builtIns.developer.description',
    defaultMessage: 'General development tools useful for software engineering.',
  },
  computerControllerTitle: {
    id: 'extensionList.builtIns.computercontroller.title',
    defaultMessage: 'Computer Controller',
  },
  computerControllerDescription: {
    id: 'extensionList.builtIns.computercontroller.description',
    defaultMessage: "General computer control tools that don't require development experience.",
  },
  autoVisualiserTitle: {
    id: 'extensionList.builtIns.autovisualiser.title',
    defaultMessage: 'Auto Visualiser',
  },
  autoVisualiserDescription: {
    id: 'extensionList.builtIns.autovisualiser.description',
    defaultMessage: 'Automatically visualize data and generate user interfaces.',
  },
  memoryTitle: {
    id: 'extensionList.builtIns.memory.title',
    defaultMessage: 'Memory',
  },
  memoryDescription: {
    id: 'extensionList.builtIns.memory.description',
    defaultMessage: 'Teach {appName} your preferences as you go.',
  },
  tutorialTitle: {
    id: 'extensionList.builtIns.tutorial.title',
    defaultMessage: 'Tutorial',
  },
  tutorialDescription: {
    id: 'extensionList.builtIns.tutorial.description',
    defaultMessage: 'Access interactive tutorials and guides.',
  },
});

const BUILT_IN_EXTENSION_MESSAGES = {
  developer: { title: i18n.developerTitle, description: i18n.developerDescription },
  computercontroller: {
    title: i18n.computerControllerTitle,
    description: i18n.computerControllerDescription,
  },
  autovisualiser: {
    title: i18n.autoVisualiserTitle,
    description: i18n.autoVisualiserDescription,
  },
  memory: { title: i18n.memoryTitle, description: i18n.memoryDescription },
  tutorial: { title: i18n.tutorialTitle, description: i18n.tutorialDescription },
} as const;

interface ExtensionListProps {
  extensions: FixedExtensionEntry[];
  onToggle: (extension: FixedExtensionEntry) => Promise<boolean | void> | void;
  onConfigure?: (extension: FixedExtensionEntry) => void;
  isStatic?: boolean;
  disableConfiguration?: boolean;
  searchTerm?: string;
}

export default function ExtensionList({
  extensions,
  onToggle,
  onConfigure,
  isStatic,
  disableConfiguration: _disableConfiguration,
  searchTerm = '',
}: ExtensionListProps) {
  const intl = useIntl();

  const matchesSearch = (extension: FixedExtensionEntry): boolean => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    const copy = getLocalizedExtensionCopy(extension, intl);
    const originalSubtitle = getSubtitle(extension);
    const aliases = [
      copy.title,
      copy.description,
      getFriendlyTitle(extension),
      originalSubtitle.description,
      originalSubtitle.command,
      extension.configKey,
      extension.description,
      extension.name,
    ];

    return aliases.some((alias) => alias?.toLowerCase().includes(searchLower));
  };

  // Separate enabled and disabled extensions, then filter by search term
  const enabledExtensions = extensions.filter((ext) => ext.enabled && matchesSearch(ext));
  const disabledExtensions = extensions.filter((ext) => !ext.enabled && matchesSearch(ext));

  // Sort each group alphabetically by their friendly title
  const sortedEnabledExtensions = [...enabledExtensions].sort((a, b) =>
    getLocalizedExtensionCopy(a, intl).title.localeCompare(getLocalizedExtensionCopy(b, intl).title)
  );
  const sortedDisabledExtensions = [...disabledExtensions].sort((a, b) =>
    getLocalizedExtensionCopy(a, intl).title.localeCompare(getLocalizedExtensionCopy(b, intl).title)
  );

  return (
    <div className="space-y-8">
      {sortedEnabledExtensions.length > 0 && (
        <div>
          <h2 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            {intl.formatMessage(i18n.defaultExtensions, { count: sortedEnabledExtensions.length })}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
            {sortedEnabledExtensions.map((extension) => (
              <ExtensionItem
                key={extension.name}
                extension={extension}
                onToggle={onToggle}
                onConfigure={onConfigure}
                isStatic={isStatic}
              />
            ))}
          </div>
        </div>
      )}

      {sortedDisabledExtensions.length > 0 && (
        <div>
          <h2 className="text-lg font-medium text-text-secondary mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
            {intl.formatMessage(i18n.availableExtensions, {
              count: sortedDisabledExtensions.length,
            })}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
            {sortedDisabledExtensions.map((extension) => (
              <ExtensionItem
                key={extension.name}
                extension={extension}
                onToggle={onToggle}
                onConfigure={onConfigure}
                isStatic={isStatic}
              />
            ))}
          </div>
        </div>
      )}

      {extensions.length === 0 && (
        <div className="text-center text-text-secondary py-8">
          {intl.formatMessage(i18n.noExtensions)}
        </div>
      )}
    </div>
  );
}

// Helper functions
export function formatExtensionName(name: string): string {
  return name
    .split(/[-_]/) // Split on hyphens and underscores
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

type ExtensionCopySource = ExtensionConfig & { configKey?: string };

export function getFriendlyTitle(extension: ExtensionCopySource): string {
  const name =
    ((extension.type === 'builtin' || extension.type === 'platform') && extension.display_name) ||
    extension.name;
  return formatExtensionName(name);
}

function normalizeExtensionName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, '');
}

export function getLocalizedExtensionCopy(
  extension: ExtensionCopySource,
  intl: IntlShape
): { title: string; description: string | null } {
  const stableId =
    extension.type === 'builtin'
      ? [extension.configKey, extension.name, extension.display_name]
          .filter((name): name is string => Boolean(name))
          .map(normalizeExtensionName)
          .find((name) => name in BUILT_IN_EXTENSION_MESSAGES)
      : undefined;
  const messages = stableId
    ? BUILT_IN_EXTENSION_MESSAGES[stableId as keyof typeof BUILT_IN_EXTENSION_MESSAGES]
    : undefined;

  if (!messages) {
    return {
      title: getFriendlyTitle(extension),
      description: getSubtitle(extension).description,
    };
  }

  return {
    title: intl.formatMessage(messages.title),
    description: intl.formatMessage(messages.description),
  };
}

export function getSubtitle(config: ExtensionConfig) {
  switch (config.type) {
    case 'builtin': {
      const extensionData = builtInExtensionsData.find(
        (ext) => normalizeExtensionName(ext.name) === normalizeExtensionName(config.name)
      );
      return {
        description: extensionData?.description || config.description || 'Built-in extension',
        command: null,
      };
    }
    case 'streamable_http': {
      return {
        description: config.description ? `HTTP: ${config.description}` : 'HTTP extension',
        command: config.uri || null,
      };
    }

    default:
      return {
        description: config.description || null,
        command: 'cmd' in config ? combineCmdAndArgs(config.cmd, config.args ?? []) : null,
      };
  }
}
