import '../styles/modern-pages.css';
import { SITE_LOGO_SRC } from '../constants/siteAssets';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 mt-20 bg-[#050914]">
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex justify-center mb-4">
          <img
            src={SITE_LOGO_SRC}
            alt=""
            className="h-14 sm:h-16 w-auto max-w-[280px] object-contain opacity-95 drop-shadow-md"
            width={260}
            height={64}
            decoding="async"
          />
        </div>
        <p className="text-center text-sm ilsa-muted">
          © {currentYear} ILSA Support. All rights reserved.
        </p>
      </div>
    </footer>
  );
}