import "./globals.css";
import AuthProvider, { AuthGate } from "@/components/AuthProvider";
import ProspectsProvider from "@/components/ProspectsProvider";
import Header from "@/components/Header";

const THEME_SCRIPT = `try{var t=localStorage.getItem("myrimaven-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata = {
  title: { default: "Myrimaven Prospect Desk", template: "%s · Myrimaven Prospect Desk" },
  description: "Find, rate and qualify organizational prospects for Myrimaven, and learn from every outreach.",
  /* the name under the icon when saved to an iPhone home screen (icons: app/icon.png, app/apple-icon.png) */
  appleWebApp: { capable: true, title: "Prospect Desk", statusBarStyle: "default" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply a saved light/dark choice before the page draws (see components/ThemeToggle.js) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <AuthProvider>
          <ProspectsProvider>
            <Header />
            <main>
              <AuthGate>{children}</AuthGate>
            </main>
          </ProspectsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
