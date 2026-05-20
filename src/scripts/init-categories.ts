// Kategorileri otomatik oluşturan script
// Admin token ile çalıştırılmalı

/** Yerel API kökü — ortamda override: set API_BASE_URL */
const BACKEND_URL =
  (typeof process !== 'undefined' && process.env.API_BASE_URL) ||
  'http://localhost:8787/make-server-47081311';

// Admin token buraya yapıştırılacak
const ADMIN_TOKEN = 'YOUR_ADMIN_ACCESS_TOKEN_HERE';

const categories = [
  {
    name: 'Samsung',
    slug: 'samsung',
    icon: '📱',
    description: 'Samsung firmware, tools ve flash dosyaları',
  },
  {
    name: 'Xiaomi',
    slug: 'xiaomi',
    icon: '🔶',
    description: 'Xiaomi MIUI ROM, Fastboot ROM ve Mi Unlock',
  },
  {
    name: 'Huawei',
    slug: 'huawei',
    icon: '🔴',
    description: 'Huawei firmware ve FRP unlock tools',
  },
  {
    name: 'Oppo',
    slug: 'oppo',
    icon: '🟢',
    description: 'Oppo ColorOS ROM ve flash tools',
  },
  {
    name: 'Vivo',
    slug: 'vivo',
    icon: '🔵',
    description: 'Vivo stock ROM ve Qualcomm tools',
  },
  {
    name: 'iPhone',
    slug: 'iphone',
    icon: '🍎',
    description: 'iPhone IPSW files, iTunes ve 3uTools',
  },
  {
    name: 'Realme',
    slug: 'realme',
    icon: '🟡',
    description: 'Realme stock ROM ve flash tools',
  },
  {
    name: 'OnePlus',
    slug: 'oneplus',
    icon: '🔴',
    description: 'OnePlus OxygenOS ve MSM tool',
  },
  {
    name: 'Nokia',
    slug: 'nokia',
    icon: '🔵',
    description: 'Nokia stock ROM ve flash tools',
  },
  {
    name: 'Motorola',
    slug: 'motorola',
    icon: '⚫',
    description: 'Motorola stock ROM ve RSD Lite',
  },
];

async function createCategories() {
  console.log('🚀 Kategoriler oluşturuluyor...\n');

  for (const category of categories) {
    try {
      const response = await fetch(`${BACKEND_URL}/categories`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(category),
      });

      const result = await response.json();

      if (response.ok) {
        console.log(`✅ ${category.name} oluşturuldu (${category.icon})`);
      } else {
        console.error(`❌ ${category.name} hatası:`, result.error);
      }
    } catch (error) {
      console.error(`❌ ${category.name} ağ hatası:`, error);
    }
  }

  console.log('\n🎉 Kategori oluşturma tamamlandı!');
}

createCategories();
