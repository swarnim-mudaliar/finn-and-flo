import './globals.css';
import type { ReactNode } from 'react';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata = {
  title: 'Finn & Flo — the trading floor for secondhand wholesale',
  description:
    'Personal AI agents for both sides of secondhand fashion wholesale. Flo sells, Finn buys, humans only decide.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable} min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
