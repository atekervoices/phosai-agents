import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AuthProvider } from "@/contexts/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { APP_SITE_DESCRIPTION, APP_TITLE } from "@/lib/constants";
import "./globals.css";

const inter = { className: "font-sans antialiased" };

export const metadata: Metadata = {
  title: APP_TITLE,
  description: APP_SITE_DESCRIPTION,
  icons: {
    icon: [
      { url: "/phosai_logo.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/phosai_logo.png",
    apple: "/phosai_logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `var __name = function (target, value) { return Object.defineProperty(target, "name", { value, configurable: true }); };`,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <NuqsAdapter>
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
              {children}
              <Toaster position="bottom-right" />
            </ThemeProvider>
          </NuqsAdapter>
        </AuthProvider>
      </body>
    </html>
  );
}
