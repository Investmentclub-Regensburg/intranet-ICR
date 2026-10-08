import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/theme-provider";
// Hausschrift Inter (wie die Website), self-hosted über npm: keine Verbindung
// zu Google Fonts, weder beim Build noch im Browser.
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "ICR Intranet",
  description: "Das interne Netzwerk des ICR",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f9" },
    { media: "(prefers-color-scheme: dark)", color: "#140305" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
