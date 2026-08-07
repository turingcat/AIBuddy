#!/usr/bin/env sh

# Create template icons for the menu bar
magick glyph.svg -background none -resize 22x22 iconTemplate.png
magick glyph.svg -background none -resize 44x44 iconTemplate@2x.png

# Create the "update available" menu bar template icons (glyph + badge dot)
magick glyph-update.svg -background none -resize 22x22 iconTemplateUpdate.png
magick glyph-update.svg -background none -resize 44x44 iconTemplateUpdate@2x.png

# Create main application icons from icon.svg
magick icon.svg -background none -resize 1024x1024 icon.png
magick icon.svg -background none -resize 2048x2048 icon@2x.png
magick icon.svg -background none -resize 512x512 icon-512.png

# icon-light.* mirrors the main icon. No separate light-appearance artwork is
# maintained; kept identical for backward compatibility with packaging paths
# that still reference it.
cp icon.png icon-light.png

# Create Windows icon (ico) with multiple sizes
magick icon.svg -background none -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# Create macOS icon set (icns)
mkdir -p icon.iconset
magick icon.svg -background none -resize 16x16   icon.iconset/icon_16x16.png
magick icon.svg -background none -resize 32x32   icon.iconset/icon_16x16@2x.png
magick icon.svg -background none -resize 32x32   icon.iconset/icon_32x32.png
magick icon.svg -background none -resize 64x64   icon.iconset/icon_32x32@2x.png
magick icon.svg -background none -resize 128x128 icon.iconset/icon_128x128.png
magick icon.svg -background none -resize 256x256 icon.iconset/icon_128x128@2x.png
magick icon.svg -background none -resize 256x256 icon.iconset/icon_256x256.png
magick icon.svg -background none -resize 512x512 icon.iconset/icon_256x256@2x.png
magick icon.svg -background none -resize 512x512 icon.iconset/icon_512x512.png
magick icon.svg -background none -resize 1024x1024 icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
cp icon.icns icon-light.icns
