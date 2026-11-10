/* Name, colours and icons used when the app is saved to a phone's home screen.
   Next.js serves this at /manifest.webmanifest and links it automatically. */
export default function manifest() {
  return {
    name: "Myrimaven Prospect Desk",
    short_name: "Prospect Desk",
    description: "Find, qualify and learn from organizational prospects.",
    start_url: "/discover",
    display: "standalone",
    background_color: "#FEFDF9",
    theme_color: "#563BEB",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
