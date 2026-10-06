import "./globals.css";
import ProspectsProvider from "@/components/ProspectsProvider";
import Header from "@/components/Header";

export const metadata = {
  title: { default: "Myrimaven Prospect Desk", template: "%s · Myrimaven Prospect Desk" },
  description: "Find, rate and qualify organizational prospects for Myrimaven, and learn from every outreach.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <ProspectsProvider>
          <Header />
          <main>{children}</main>
        </ProspectsProvider>
      </body>
    </html>
  );
}
