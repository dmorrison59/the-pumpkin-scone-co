import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Pumpkin Scone Co.",
  description: "Fresh seasonal pumpkin scones, baked in small batches and available by preorder.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
