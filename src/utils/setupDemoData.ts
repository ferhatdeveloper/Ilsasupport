import { apiFunctionsBase } from './supabase/info';

export async function setupDemoData(adminToken: string) {
  const baseUrl = `${apiFunctionsBase}`;

  const categories = [
    { name: 'Samsung', slug: 'samsung', icon: '📱', description: 'Samsung firmware and tools' },
    { name: 'Xiaomi', slug: 'xiaomi', icon: '📱', description: 'Xiaomi firmware and tools' },
    { name: 'Huawei', slug: 'huawei', icon: '📱', description: 'Huawei firmware and tools' },
    { name: 'Oppo', slug: 'oppo', icon: '📱', description: 'Oppo firmware and tools' },
    { name: 'iPhone Tools', slug: 'iphone-tools', icon: '🍎', description: 'iPhone flashing tools' },
    { name: 'Vivo', slug: 'vivo', icon: '📱', description: 'Vivo firmware and tools' },
    { name: 'Realme', slug: 'realme', icon: '📱', description: 'Realme firmware and tools' },
    { name: 'OnePlus', slug: 'oneplus', icon: '📱', description: 'OnePlus firmware and tools' },
  ];

  const createdCategories: any = {};

  // Kategorileri oluştur
  for (const cat of categories) {
    try {
      const response = await fetch(`${baseUrl}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(cat),
      });

      if (response.ok) {
        const result = await response.json();
        createdCategories[cat.slug] = result.categoryId;
        console.log(`✅ Created category: ${cat.name}`);
      }
    } catch (error) {
      console.error(`❌ Error creating category ${cat.name}:`, error);
    }
  }

  // Demo dosyaları oluştur
  const demoFiles = [
    // Samsung
    {
      name: 'Samsung Galaxy S23 Ultra Firmware',
      description: 'Official firmware for Galaxy S23 Ultra (SM-S918B)',
      categoryId: createdCategories['samsung'],
      fileType: 'firmware',
      version: 'Android 14',
      size: '6.5 GB',
      downloadUrl: 'https://drive.google.com/file/d/1example/view',
      isPremium: false,
    },
    {
      name: 'Odin v3.14.4 - Samsung Flash Tool',
      description: 'Latest Odin flashing tool for Samsung devices',
      categoryId: createdCategories['samsung'],
      fileType: 'tool',
      version: '3.14.4',
      size: '45 MB',
      downloadUrl: 'https://drive.google.com/file/d/2example/view',
      isPremium: false,
    },
    {
      name: 'Samsung Galaxy A54 Firmware',
      description: 'Official firmware for Galaxy A54 (SM-A546B)',
      categoryId: createdCategories['samsung'],
      fileType: 'firmware',
      version: 'Android 13',
      size: '5.2 GB',
      downloadUrl: 'https://drive.google.com/file/d/3example/view',
      isPremium: true,
    },

    // Xiaomi
    {
      name: 'Xiaomi 13 Pro Global Firmware',
      description: 'MIUI 14 Global ROM for Xiaomi 13 Pro',
      categoryId: createdCategories['xiaomi'],
      fileType: 'firmware',
      version: 'MIUI 14.0.6',
      size: '4.8 GB',
      downloadUrl: 'https://drive.google.com/file/d/4example/view',
      isPremium: false,
    },
    {
      name: 'Mi Flash Tool v2023',
      description: 'Official Xiaomi flashing tool',
      categoryId: createdCategories['xiaomi'],
      fileType: 'tool',
      version: '2023.12.01',
      size: '85 MB',
      downloadUrl: 'https://drive.google.com/file/d/5example/view',
      isPremium: false,
    },
    {
      name: 'Redmi Note 12 Pro Firmware',
      description: 'MIUI 14 firmware for Redmi Note 12 Pro',
      categoryId: createdCategories['xiaomi'],
      fileType: 'firmware',
      version: 'MIUI 14.0.4',
      size: '4.2 GB',
      downloadUrl: 'https://drive.google.com/file/d/6example/view',
      isPremium: true,
    },

    // Huawei
    {
      name: 'Huawei P50 Pro Firmware',
      description: 'HarmonyOS 3.0 for P50 Pro',
      categoryId: createdCategories['huawei'],
      fileType: 'firmware',
      version: 'HarmonyOS 3.0',
      size: '5.5 GB',
      downloadUrl: 'https://drive.google.com/file/d/7example/view',
      isPremium: false,
    },
    {
      name: 'HiSuite - Huawei Manager',
      description: 'Official Huawei device management tool',
      categoryId: createdCategories['huawei'],
      fileType: 'tool',
      version: '11.1.0.360',
      size: '125 MB',
      downloadUrl: 'https://drive.google.com/file/d/8example/view',
      isPremium: false,
    },

    // Oppo
    {
      name: 'Oppo Find X5 Pro Firmware',
      description: 'ColorOS 13 for Find X5 Pro',
      categoryId: createdCategories['oppo'],
      fileType: 'firmware',
      version: 'ColorOS 13.1',
      size: '5.8 GB',
      downloadUrl: 'https://drive.google.com/file/d/9example/view',
      isPremium: false,
    },
    {
      name: 'Oppo Flash Tool',
      description: 'MSM Download Tool for Oppo devices',
      categoryId: createdCategories['oppo'],
      fileType: 'tool',
      version: '2023',
      size: '95 MB',
      downloadUrl: 'https://drive.google.com/file/d/10example/view',
      isPremium: true,
    },

    // iPhone Tools
    {
      name: '3uTools - iOS Manager',
      description: 'All-in-one iOS management tool',
      categoryId: createdCategories['iphone-tools'],
      fileType: 'tool',
      version: '3.08.012',
      size: '145 MB',
      downloadUrl: 'https://drive.google.com/file/d/11example/view',
      isPremium: false,
    },
    {
      name: 'iMazing - iOS Backup Tool',
      description: 'Professional iOS device backup solution',
      categoryId: createdCategories['iphone-tools'],
      fileType: 'tool',
      version: '2.17.5',
      size: '210 MB',
      downloadUrl: 'https://drive.google.com/file/d/12example/view',
      isPremium: true,
    },
    {
      name: 'Checkra1n Jailbreak Tool',
      description: 'iOS 12-14 jailbreak tool',
      categoryId: createdCategories['iphone-tools'],
      fileType: 'tool',
      version: '0.12.4',
      size: '35 MB',
      downloadUrl: 'https://drive.google.com/file/d/13example/view',
      isPremium: false,
    },

    // Vivo
    {
      name: 'Vivo X90 Pro Firmware',
      description: 'FuntouchOS 13 for Vivo X90 Pro',
      categoryId: createdCategories['vivo'],
      fileType: 'firmware',
      version: 'FuntouchOS 13',
      size: '5.1 GB',
      downloadUrl: 'https://drive.google.com/file/d/14example/view',
      isPremium: false,
    },

    // Realme
    {
      name: 'Realme GT 2 Pro Firmware',
      description: 'Realme UI 4.0 for GT 2 Pro',
      categoryId: createdCategories['realme'],
      fileType: 'firmware',
      version: 'Realme UI 4.0',
      size: '4.9 GB',
      downloadUrl: 'https://drive.google.com/file/d/15example/view',
      isPremium: false,
    },

    // OnePlus
    {
      name: 'OnePlus 11 Firmware',
      description: 'OxygenOS 13 for OnePlus 11',
      categoryId: createdCategories['oneplus'],
      fileType: 'firmware',
      version: 'OxygenOS 13.1',
      size: '5.3 GB',
      downloadUrl: 'https://drive.google.com/file/d/16example/view',
      isPremium: false,
    },
    {
      name: 'MSM Download Tool - OnePlus',
      description: 'Official OnePlus unbrick tool',
      categoryId: createdCategories['oneplus'],
      fileType: 'tool',
      version: '4.0',
      size: '75 MB',
      downloadUrl: 'https://drive.google.com/file/d/17example/view',
      isPremium: true,
    },
  ];

  // Dosyaları oluştur
  for (const file of demoFiles) {
    try {
      const response = await fetch(`${baseUrl}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(file),
      });

      if (response.ok) {
        console.log(`✅ Created file: ${file.name}`);
      }
    } catch (error) {
      console.error(`❌ Error creating file ${file.name}:`, error);
    }
  }

  console.log('✅ Demo data setup complete!');
  return true;
}
