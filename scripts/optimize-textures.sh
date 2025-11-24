#!/bin/bash
# Texture optimization script
# Resizes textures to 1024x1024 and compresses them

TEXTURE_DIR="/Users/gorkolas/Documents/www/rampage/public/assets/textures"

echo "🎨 Optimizing textures..."
echo "Original sizes:"
du -sh "$TEXTURE_DIR"

# Create backup
echo "📦 Creating backup..."
if [ ! -d "$TEXTURE_DIR.backup" ]; then
  cp -r "$TEXTURE_DIR" "$TEXTURE_DIR.backup"
  echo "✅ Backup created at $TEXTURE_DIR.backup"
fi

# Optimize all JPG files (color/albedo maps) - high quality, 1024x1024
echo "🖼️  Optimizing color/albedo JPG files..."
find "$TEXTURE_DIR" -name "*.jpg" -type f | while read file; do
  echo "  Processing: $file"
  npx sharp-cli -i "$file" -o "$file" resize 1024 1024 --fit cover --quality 85
done

# Optimize PNG files (normal, roughness, AO) - 1024x1024, png compression
echo "🗺️  Optimizing PNG files (normals, roughness, AO)..."
find "$TEXTURE_DIR" -name "*.png" -type f | while read file; do
  echo "  Processing: $file"
  npx sharp-cli -i "$file" -o "$file" resize 1024 1024 --fit cover --compressionLevel 9
done

echo ""
echo "✅ Optimization complete!"
echo "New sizes:"
du -sh "$TEXTURE_DIR"
echo ""
echo "Backup stored at: $TEXTURE_DIR.backup"
