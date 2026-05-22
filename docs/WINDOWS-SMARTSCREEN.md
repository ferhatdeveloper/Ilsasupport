# Windows SmartScreen ve antivirüs uyarıları

ILSA Support portable (`ILSA-Support-Portable-*.exe`) **imzasız** derlendiği için Windows «Bilinmeyen yayımcı» uyarısı gösterir. Bu, yaygın bir Electron portable davranışıdır; otomatik olarak «virüs» anlamına gelmez.

## Kullanıcıya söylenecekler

1. SmartScreen penceresinde **Yine de çalıştır** (veya **Daha fazla bilgi** → **Yine de çalıştır**).
2. Tarayıcı indirmeyi engellerse siteden **ZIP** indirin, zip’i açın, içindeki `.exe`’yi çalıştırın.
3. İndirilen dosyada kilit varsa (PowerShell, İndirilenler klasöründe):

```powershell
Unblock-File -Path "$env:USERPROFILE\Downloads\ILSA-Support-Portable-1.0.3.exe"
```

## Kalıcı çözüm (yönetici)

1. **EV Code Signing** sertifikası alın (DigiCert, Sectigo vb.).
2. `electron-client` derlemeden önce ortam değişkenleri:

```powershell
$env:CSC_LINK = "C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "sertifika-sifresi"
npm run dist:portable
```

3. İlk haftalarda dosyayı Microsoft’a bildirin (itibar oluşması):
   - https://www.microsoft.com/en-us/wdsi/filesubmission
   - Dosya türü: «Bağımsız bilgisayar yazılımı geliştiricisi»

## Derleme

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-electron-download.ps1
```

EXE + ZIP + SHA256 özeti `public/downloads/` ve `build/downloads/` altına kopyalanır.
