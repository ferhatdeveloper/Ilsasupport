# Assets Klasörü

Bu klasöre uygulama icon'larını ekleyin.

## Gerekli Dosyalar

### icon.ico (Windows)
- Boyut: 256x256 piksel
- Format: ICO
- Şeffaf arka plan (önerilen)

### icon.icns (Mac)
- Boyut: 512x512 piksel
- Format: ICNS
- Retina desteği

### icon.png (Linux & Tray)
- Boyut: 512x512 piksel
- Format: PNG
- Şeffaf arka plan

### tray-icon.png (Sistem Tepsisi)
- Boyut: 32x32 piksel (küçük, basit tasarım)
- Format: PNG
- Şeffaf arka plan
- Monochrome önerilir

## Icon Oluşturma Araçları

### Online
- https://www.icoconverter.com/
- https://cloudconvert.com/png-to-ico
- https://iconverticons.com/online/

### Offline
- **Windows**: IcoFX
- **Mac**: Image2icon
- **Linux**: GIMP

## Varsayılan Icon

Icon dosyaları yoksa uygulama Electron varsayılan icon'unu kullanır.
Production build için mutlaka özel icon ekleyin!

## ILSA Support Logo

ILSA Support için mavi-mor gradient bir logo önerilir:
- Ana renk: #3b82f6 (mavi)
- İkincil renk: #8b5cf6 (mor)
- Arka plan: Şeffaf
- Stil: Modern, minimal

## Örnek Kod (Icon Dönüştürme)

### PNG to ICO (ImageMagick)
```bash
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

### PNG to ICNS (Mac)
```bash
mkdir icon.iconset
sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
iconutil -c icns icon.iconset
```

---

**Not:** Icon dosyaları ekledikten sonra uygulamayı yeniden build edin.
