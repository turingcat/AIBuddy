import type { ContentBlock, ImageContent } from './types/message';

type ToolResultContent = {
  images: ImageContent[];
  details: ContentBlock[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUserVisible(block: Record<string, unknown>): boolean {
  const annotations = block.annotations;
  if (!isRecord(annotations) || !('audience' in annotations)) {
    return true;
  }

  return Array.isArray(annotations.audience) && annotations.audience.includes('user');
}

function isImageContent(
  block: Record<string, unknown>
): block is ImageContent & Record<string, unknown> {
  return (
    block.type === 'image' &&
    typeof block.mimeType === 'string' &&
    block.mimeType.startsWith('image/') &&
    typeof block.data === 'string'
  );
}

export function partitionUserVisibleToolResultContent(toolResult: unknown): ToolResultContent {
  if (!isRecord(toolResult) || toolResult.status !== 'success' || !isRecord(toolResult.value)) {
    return { images: [], details: [] };
  }

  const content = toolResult.value.content;
  if (!Array.isArray(content)) {
    return { images: [], details: [] };
  }

  const images: ImageContent[] = [];
  const details: ContentBlock[] = [];

  for (const item of content) {
    if (!isRecord(item) || !isUserVisible(item)) {
      continue;
    }

    if (isImageContent(item)) {
      images.push(item);
    } else {
      details.push(item as ContentBlock);
    }
  }

  return { images, details };
}
