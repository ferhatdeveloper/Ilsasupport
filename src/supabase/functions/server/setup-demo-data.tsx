// Demo subcategory ve dosyaları oluşturmak için setup scripti

export const demoSubcategories = [
  // Samsung
  { categoryName: 'Samsung', subcategories: [
    { name: 'Repair', icon: '🔧' },
    { name: 'FRP Tools', icon: '🔓' },
    { name: 'Flash Files', icon: '⚡' },
    { name: 'Combination', icon: '🔄' },
    { name: 'Yazılım', icon: '💾' },
  ]},
  
  // Xiaomi
  { categoryName: 'Xiaomi', subcategories: [
    { name: 'MIUI ROM', icon: '📱' },
    { name: 'Fastboot ROM', icon: '⚡' },
    { name: 'Mi Unlock', icon: '🔓' },
    { name: 'EDL Tools', icon: '🔧' },
    { name: 'Custom ROM', icon: '🎨' },
  ]},
  
  // Huawei
  { categoryName: 'Huawei', subcategories: [
    { name: 'Firmware', icon: '💾' },
    { name: 'FRP Remove', icon: '🔓' },
    { name: 'Flash Tool', icon: '⚡' },
    { name: 'HiSuite', icon: '🔧' },
  ]},
  
  // Oppo
  { categoryName: 'Oppo', subcategories: [
    { name: 'ColorOS ROM', icon: '🎨' },
    { name: 'Flash Tool', icon: '⚡' },
    { name: 'MSM Tool', icon: '🔧' },
    { name: 'Pattern Unlock', icon: '🔓' },
  ]},
  
  // Vivo
  { categoryName: 'Vivo', subcategories: [
    { name: 'Stock ROM', icon: '📱' },
    { name: 'Qualcomm Tool', icon: '🔧' },
    { name: 'MTK Tool', icon: '⚙️' },
    { name: 'FRP Bypass', icon: '🔓' },
  ]},
  
  // Realme
  { categoryName: 'Realme', subcategories: [
    { name: 'Realme UI ROM', icon: '🎨' },
    { name: 'Flash Tool', icon: '⚡' },
    { name: 'Deep Testing', icon: '🔬' },
  ]},
  
  // OnePlus
  { categoryName: 'OnePlus', subcategories: [
    { name: 'OxygenOS', icon: '💨' },
    { name: 'MSM Tool', icon: '🔧' },
    { name: 'Fastboot ROM', icon: '⚡' },
  ]},
  
  // Tecno
  { categoryName: 'Tecno', subcategories: [
    { name: 'Stock ROM', icon: '📱' },
    { name: 'SP Flash Tool', icon: '⚡' },
    { name: 'FRP Tool', icon: '🔓' },
  ]},
  
  // Infinix
  { categoryName: 'Infinix', subcategories: [
    { name: 'Stock ROM', icon: '📱' },
    { name: 'Flash Tool', icon: '⚡' },
    { name: 'Pattern Remove', icon: '🔓' },
  ]},
  
  // iPhone
  { categoryName: 'iPhone', subcategories: [
    { name: 'IPSW Files', icon: '🍎' },
    { name: 'iTunes', icon: '🎵' },
    { name: 'iCloud Bypass', icon: '☁️' },
    { name: '3uTools', icon: '🔧' },
  ]},
];

export const demoFiles = [
  // Samsung - Repair
  {
    subcategoryName: 'Repair',
    categoryName: 'Samsung',
    files: [
      {
        name: 'Samsung Galaxy S23 Ultra SM-S918B Repair Firmware',
        description: 'Latest official repair firmware for Galaxy S23 Ultra. Includes full system repair files.',
        version: '14.0',
        size: 8589934592, // 8GB
        fileType: 'firmware',
        isPremium: true,
      },
      {
        name: 'Samsung Galaxy A54 5G SM-A546B Flash File',
        description: 'Stock ROM for Samsung Galaxy A54 5G. All regions supported.',
        version: '13.0',
        size: 6442450944, // 6GB
        fileType: 'firmware',
        isPremium: false,
      },
    ]
  },
  
  // Samsung - FRP Tools
  {
    subcategoryName: 'FRP Tools',
    categoryName: 'Samsung',
    files: [
      {
        name: 'Samsung FRP Tool 2024 Latest',
        description: 'One-click FRP bypass tool for all Samsung devices. Android 13/14 supported.',
        version: '5.2',
        size: 52428800, // 50MB
        fileType: 'tool',
        isPremium: true,
      },
      {
        name: 'Combination File Samsung S23',
        description: 'Combination firmware for FRP bypass and testing.',
        version: '1.0',
        size: 2147483648, // 2GB
        fileType: 'firmware',
        isPremium: false,
      },
    ]
  },
  
  // Xiaomi - MIUI ROM
  {
    subcategoryName: 'MIUI ROM',
    categoryName: 'Xiaomi',
    files: [
      {
        name: 'Xiaomi 13 Pro MIUI 14 Recovery ROM',
        description: 'Official MIUI 14 recovery ROM for Xiaomi 13 Pro. Global version.',
        version: '14.0.6.0',
        size: 5368709120, // 5GB
        fileType: 'firmware',
        isPremium: true,
      },
      {
        name: 'Redmi Note 12 Pro MIUI 14',
        description: 'Latest MIUI 14 for Redmi Note 12 Pro. All variants.',
        version: '14.0.4.0',
        size: 4294967296, // 4GB
        fileType: 'firmware',
        isPremium: false,
      },
    ]
  },
  
  // Xiaomi - Fastboot ROM
  {
    subcategoryName: 'Fastboot ROM',
    categoryName: 'Xiaomi',
    files: [
      {
        name: 'Mi Flash Tool 2024',
        description: 'Official Xiaomi flash tool for fastboot ROM installation.',
        version: '2024.3.0',
        size: 104857600, // 100MB
        fileType: 'tool',
        isPremium: false,
      },
    ]
  },
  
  // Oppo - ColorOS ROM
  {
    subcategoryName: 'ColorOS ROM',
    categoryName: 'Oppo',
    files: [
      {
        name: 'Oppo Reno 10 Pro ColorOS 14',
        description: 'Latest ColorOS 14 official firmware for Oppo Reno 10 Pro.',
        version: '14.0',
        size: 6442450944, // 6GB
        fileType: 'firmware',
        isPremium: true,
      },
      {
        name: 'Oppo A78 Stock ROM',
        description: 'Official stock ROM for Oppo A78. ColorOS 13.',
        version: '13.1',
        size: 5368709120, // 5GB
        fileType: 'firmware',
        isPremium: false,
      },
    ]
  },
  
  // Vivo - Stock ROM
  {
    subcategoryName: 'Stock ROM',
    categoryName: 'Vivo',
    files: [
      {
        name: 'Vivo V29 Pro Stock Firmware',
        description: 'Official stock ROM for Vivo V29 Pro with Funtouch OS 14.',
        version: '14.0',
        size: 6979321856, // 6.5GB
        fileType: 'firmware',
        isPremium: true,
      },
    ]
  },
  
  // iPhone - IPSW Files
  {
    subcategoryName: 'IPSW Files',
    categoryName: 'iPhone',
    files: [
      {
        name: 'iPhone 15 Pro Max iOS 17.2 IPSW',
        description: 'Official iOS 17.2 IPSW file for iPhone 15 Pro Max.',
        version: '17.2',
        size: 7516192768, // 7GB
        fileType: 'firmware',
        isPremium: true,
      },
      {
        name: 'iPhone 13 iOS 17.1 IPSW',
        description: 'iOS 17.1 restore image for iPhone 13.',
        version: '17.1',
        size: 6979321856, // 6.5GB
        fileType: 'firmware',
        isPremium: false,
      },
    ]
  },
];

export const demoDownloadUrls = [
  // Bu URL'ler örnek Google Drive linkleri - gerçek projede gerçek linkler olmalı
  'https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view',
  'https://drive.google.com/file/d/2b3c4d5e6f7g8h9i0j1k/view',
  'https://drive.google.com/file/d/3c4d5e6f7g8h9i0j1k2l/view',
  'https://drive.google.com/file/d/4d5e6f7g8h9i0j1k2l3m/view',
  'https://drive.google.com/file/d/5e6f7g8h9i0j1k2l3m4n/view',
];
