import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nana Charts",
  description: "OHLCV chart viewer with drawing tools",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
