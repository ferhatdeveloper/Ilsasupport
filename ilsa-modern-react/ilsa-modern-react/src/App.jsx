import React from "react";
import "./styles.css";

const brands = [
  { name: "SAMSUNG", mark: "S" },
  { name: "XIAOMI", mark: "MI" },
  { name: "HUAWEI", mark: "H" },
  { name: "APPLE", mark: "A" },
  { name: "ASUS", mark: "AS" },
  { name: "OPPO", mark: "OP" },
  { name: "VIVO", mark: "V" },
  { name: "REALME", mark: "R" },
  { name: "NOKIA", mark: "N" },
  { name: "LG", mark: "LG" },
  { name: "SONY", mark: "SY" },
  { name: "LENOVO", mark: "L" },
  { name: "HTC", mark: "HT" },
  { name: "MEIZU", mark: "MZ" },
  { name: "ONEPLUS", mark: "1+" },
  { name: "TECNO", mark: "T" },
];

export default function App() {
  return (
    <div className="app">
      <header className="navbar">
        <div className="logo">
          <span className="logo-main">ILSA</span>
          <span className="logo-sub">SUPPORT</span>
        </div>

        <nav className="menu">
          <a href="#">Anasayfa</a>
          <a href="#">Yeniler</a>
          <a href="#">Duyurular</a>
          <a href="#">Fiyatlar</a>
          <a href="#">Virüs Tool</a>
          <a href="#">Tool İndir</a>
          <a href="#">İletişim</a>
        </nav>

        <div className="nav-actions">
          <label className="top-search">
            <span>🔎</span>
            <input placeholder="Dosya ara..." />
          </label>
          <button className="icon-btn" aria-label="Tema">☀</button>
          <button className="icon-btn" aria-label="Bildirim">🔔</button>
          <button className="profile-btn">Admin User</button>
          <button className="admin-btn">Yönetim Paneli</button>
          <button className="logout-btn">Çıkış Yap</button>
        </div>
      </header>

      <section className="hero">
        <div className="overlay">
          <div className="hero-left">
            <span className="badge">ILSA Support Platform</span>
            <h1>70+ Marka</h1>
            <p>
              Samsung, Xiaomi, Huawei, iPhone ve 70+ marka için
              firmware, tool ve driver indirin.
            </p>

            <div className="hero-buttons">
              <button className="primary">Firmware İndir</button>
              <button className="secondary">Driver Ara</button>
            </div>
          </div>
          <div className="hero-dots">
            <span className="dot active-dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>
      </section>

      <section className="search-area">
        <div className="search-wrap">
          <label className="big-search">
            <span>🔎</span>
            <input placeholder="Samsung A55 U7 firmware ara..." />
          </label>
          <div className="filters">
            <select>
              <option>Tüm Markalar</option>
            </select>
            <select>
              <option>Tüm Modeller</option>
            </select>
            <button className="search-btn">Ara</button>
          </div>
        </div>
      </section>

      <section className="brands-section">
        <div className="section-header">
          <div>
            <h2>Markalar</h2>
            <p>İhtiyacın olan markayı seçerek başlayın.</p>
          </div>

          <button className="view-all">Tüm Markaları Gör</button>
        </div>

        <div className="brand-grid">
          {brands.map((brand) => (
            <div className="brand-card" key={brand.name}>
              <div className="brand-logo">{brand.mark}</div>
              <h3>{brand.name}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="features">
        <div className="feature-card">
          <h4>Güncel Dosyalar</h4>
          <p>En güncel firmware ve tool dosyalarına anında ulaşın.</p>
        </div>

        <div className="feature-card">
          <h4>%100 Güvenli</h4>
          <p>Tüm dosyalar virüs taramasından geçirilmiştir.</p>
        </div>

        <div className="feature-card">
          <h4>Hızlı İndirme</h4>
          <p>Kesintisiz yüksek hızlı sunucular ile indirme keyfi.</p>
        </div>

        <div className="feature-card">
          <h4>7/24 Destek</h4>
          <p>Sorunlarınız için 7/24 destek ekibimiz yanınızda.</p>
        </div>
      </section>
    </div>
  );
}
