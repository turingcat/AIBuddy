import { describe, expect, it } from 'vitest';
import { partitionUserVisibleToolResultContent } from './toolResultContent';

const userVisibleImage = {
  type: 'image',
  mimeType: 'image/png',
  data: 'aW1hZ2U=',
};

describe('partitionUserVisibleToolResultContent', () => {
  it.each([
    ['omitted audience', undefined, 1],
    ['user audience', ['user'], 1],
    ['combined assistant and user audience', ['assistant', 'user'], 1],
    ['assistant-only audience', ['assistant'], 0],
  ])('returns images for %s', (_name, audience, imageCount) => {
    const image = audience ? { ...userVisibleImage, annotations: { audience } } : userVisibleImage;

    const result = partitionUserVisibleToolResultContent({
      status: 'success',
      value: { content: [image] },
    });

    expect(result.images).toHaveLength(imageCount);
    expect(result.details).toEqual([]);
  });

  it('keeps visible text/resource/audio blocks in details', () => {
    const text = { type: 'text', text: 'tool output' };
    const resource = {
      type: 'resource',
      resource: { uri: 'file:///output.txt', text: 'resource output' },
    };
    const audio = { type: 'audio', mimeType: 'audio/wav', data: 'audio-data' };

    const result = partitionUserVisibleToolResultContent({
      status: 'success',
      value: { content: [text, resource, audio, userVisibleImage] },
    });

    expect(result.images).toEqual([userVisibleImage]);
    expect(result.details).toEqual([text, resource, audio]);
  });

  it('returns empty partitions pending, error, missing, malformed content', () => {
    for (const toolResult of [
      { status: 'pending' },
      { status: 'error', error: 'failed' },
      { status: 'success', value: {} },
      { status: 'success', value: { content: 'not an array' } },
      { status: 'success', value: { content: { malformed: true } } },
    ]) {
      expect(partitionUserVisibleToolResultContent(toolResult)).toEqual({
        images: [],
        details: [],
      });
    }
  });

  it('does not lift images with an invalid MIME type or data payload', () => {
    const result = partitionUserVisibleToolResultContent({
      status: 'success',
      value: {
        content: [
          { type: 'image', mimeType: 'text/plain', data: 'not-an-image' },
          { type: 'image', mimeType: 'image/png', data: null },
        ],
      },
    });

    expect(result.images).toEqual([]);
    expect(result.details).toHaveLength(2);
  });
});
