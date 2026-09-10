import path from 'node:path';

export function packagedAibuddyAssetPath(
  resourcesPath: string,
  assetStem: string,
  extension: string
): string {
  return path.join(resourcesPath, 'aibuddy', `${path.basename(assetStem)}.${extension}`);
}
