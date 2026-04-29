import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Samsung | Gerador de Roteiros",
  description: "Gerador automático de rotas e JPs para consultores",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen`} suppressHydrationWarning>
        <nav className="bg-[#1428A0] text-white p-4 shadow-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl tracking-wide">SAMSUNG</span>
              <span className="text-blue-200">|</span>
              <span className="font-medium text-blue-100">Gerador de Roteiros</span>
            </div>
          </div>
        </nav>
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
