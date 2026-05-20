// Bu scripti tarayıcı konsolunda çalıştırarak tüm markaları otomatik ekleyebilirsiniz

const BRANDS = [
  // A-C
  { name: 'Alcatel', icon: '📱', slug: 'alcatel' },
  { name: 'Archos', icon: '📱', slug: 'archos' },
  { name: 'Asus', icon: '💻', slug: 'asus' },
  { name: 'BlackBerry', icon: '⬛', slug: 'blackberry' },
  { name: 'Blackview', icon: '📱', slug: 'blackview' },
  { name: 'BLU', icon: '🔵', slug: 'blu' },
  { name: 'BQ Aquaris', icon: '🟦', slug: 'bq-aquaris' },
  { name: 'Casper', icon: '👻', slug: 'casper' },
  { name: 'CAT', icon: '🟡', slug: 'cat' },
  { name: 'Chimera', icon: '🦅', slug: 'chimera' },
  { name: 'Coolpad', icon: '🔵', slug: 'coolpad' },
  { name: 'Cubot', icon: '📱', slug: 'cubot' },
  
  // D-G
  { name: 'DFT Pro', icon: '🔧', slug: 'dft-pro' },
  { name: 'Djitsu', icon: '🔴', slug: 'djitsu' },
  { name: 'Doogee', icon: '🔵', slug: 'doogee' },
  { name: 'Elephone', icon: '📱', slug: 'elephone' },
  { name: 'General Mobile', icon: '📱', slug: 'general-mobile' },
  { name: 'Gigaset', icon: '🟧', slug: 'gigaset' },
  { name: 'Google Pixel', icon: '🔵', slug: 'google-pixel' },
  { name: 'Gplus', icon: '📱', slug: 'gplus' },
  
  // H-I
  { name: 'Hiking', icon: '⛰️', slug: 'hiking' },
  { name: 'Hisense', icon: '🟢', slug: 'hisense' },
  { name: 'Hometech', icon: '🏠', slug: 'hometech' },
  { name: 'Honor', icon: '🔵', slug: 'honor' },
  { name: 'HTC', icon: '🟢', slug: 'htc' },
  { name: 'Huawei', icon: '🔴', slug: 'huawei' },
  { name: 'Infinix', icon: '🔷', slug: 'infinix' },
  { name: 'iPhone', icon: '🍎', slug: 'iphone' },
  { name: 'iQOO', icon: '⚫', slug: 'iqoo' },
  { name: 'İtel', icon: '📱', slug: 'itel' },
  
  // K-M
  { name: 'Kaan', icon: '⚫', slug: 'kaan' },
  { name: 'Lava', icon: '🔴', slug: 'lava' },
  { name: 'Lenovo', icon: '🔴', slug: 'lenovo' },
  { name: 'LG', icon: '🟣', slug: 'lg' },
  { name: 'Magisk', icon: '⚫', slug: 'magisk' },
  { name: 'Masstel', icon: '📱', slug: 'masstel' },
  { name: 'Meizu', icon: '🔵', slug: 'meizu' },
  { name: 'Micromax', icon: '🟧', slug: 'micromax' },
  { name: 'Motorola', icon: '🔷', slug: 'motorola' },
  
  // N-R
  { name: 'Nokia', icon: '🔵', slug: 'nokia' },
  { name: 'Nothing', icon: '⚫', slug: 'nothing' },
  { name: 'Nubia', icon: '🔴', slug: 'nubia' },
  { name: 'OMX', icon: '📱', slug: 'omx' },
  { name: 'OnePlus', icon: '🔴', slug: 'oneplus' },
  { name: 'Oppo', icon: '🟢', slug: 'oppo' },
  { name: 'Q Mobile', icon: '📱', slug: 'q-mobile' },
  { name: 'Realme', icon: '🟡', slug: 'realme' },
  { name: 'Reeder', icon: '📱', slug: 'reeder' },
  
  // S-T
  { name: 'Samsung', icon: '📱', slug: 'samsung' },
  { name: 'Sky', icon: '🔵', slug: 'sky' },
  { name: 'Symphony', icon: '📱', slug: 'symphony' },
  { name: 'TCL', icon: '🔴', slug: 'tcl' },
  { name: 'Technopc', icon: '💻', slug: 'technopc' },
  { name: 'Tecno Mobile', icon: '🔵', slug: 'tecno-mobile' },
  { name: 'Thomson', icon: '📱', slug: 'thomson' },
  { name: 'Tinmo', icon: '📱', slug: 'tinmo' },
  { name: 'Trident', icon: '🔱', slug: 'trident' },
  
  // U-Z
  { name: 'Ulefone', icon: '🔵', slug: 'ulefone' },
  { name: 'Umidigi', icon: '🔴', slug: 'umidigi' },
  { name: 'Vestel', icon: '🔴', slug: 'vestel' },
  { name: 'Vivo', icon: '🔵', slug: 'vivo' },
  { name: 'Vodafone', icon: '🔴', slug: 'vodafone' },
  { name: 'Walton', icon: '🔵', slug: 'walton' },
  { name: 'Wiko', icon: '📱', slug: 'wiko' },
  { name: 'Xiaomi', icon: '🟧', slug: 'xiaomi' },
  { name: 'ZTE', icon: '🔵', slug: 'zte' },
  
  // Tools & Special
  { name: 'Box Tool Program', icon: '📦', slug: 'box-tool' },
  { name: 'EFT Pro', icon: '🔧', slug: 'eft-pro' },
  { name: 'MTK Tools', icon: '🔧', slug: 'mtk-tools' },
  { name: 'Pandora Tool', icon: '🔧', slug: 'pandora-tool' },
  { name: 'Unlock Tool', icon: '🔓', slug: 'unlock-tool' },
  { name: 'Tablet Yazılımları', icon: '📱', slug: 'tablet-software' },
  { name: 'Tuşlu Telefon', icon: '📞', slug: 'feature-phones' },
  { name: 'Karşık Cihazlar', icon: '📱', slug: 'mixed-devices' },
  { name: 'Videolu Çözümler', icon: '🎥', slug: 'video-solutions' },
];

async function setupAllBrands() {
  const baseUrl = window.location.origin;
  const token = prompt('Admin token girin (Setup admin yaptıktan sonra giriş yapıp console\'da localStorage.getItem("supabase.auth.token") yazın):');
  
  if (!token) {
    console.error('Token gerekli!');
    return;
  }

  console.log(`🚀 ${BRANDS.length} marka ekleniyor...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const brand of BRANDS) {
    try {
      const response = await fetch(`${baseUrl}/api/make-server-47081311/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: brand.name,
          slug: brand.slug,
          icon: brand.icon,
          description: `${brand.name} firmware and tools`,
        }),
      });

      if (response.ok) {
        successCount++;
        console.log(`✅ ${brand.name} eklendi`);
      } else {
        errorCount++;
        const error = await response.json();
        console.error(`❌ ${brand.name} eklenemedi:`, error.error);
      }
      
      // Rate limiting için bekle
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      errorCount++;
      console.error(`❌ ${brand.name} eklenemedi:`, error);
    }
  }
  
  console.log(`\n✨ Tamamlandı!`);
  console.log(`✅ Başarılı: ${successCount}`);
  console.log(`❌ Hata: ${errorCount}`);
  console.log(`📊 Toplam: ${BRANDS.length}`);
  
  // Sayfayı yenile
  console.log('\n🔄 Sayfa 2 saniye sonra yenilenecek...');
  setTimeout(() => window.location.reload(), 2000);
}

// Çalıştırmak için:
console.log('📋 Markaları eklemek için setupAllBrands() fonksiyonunu çağırın');
console.log(`📝 Toplam ${BRANDS.length} marka eklenecek`);
