import type { Metadata } from "next";
import { Inter, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = Share_Tech_Mono({ weight: "400", subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Lumina Home Console",
  description: "Smart Home Automation Dashboard",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#05070a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable} antialiased bg-bg-dark text-text-primary min-h-screen selection:bg-accent-blue/30 selection:text-accent-blue`}>
        {children}
      </body>
    </html>
  );
}
