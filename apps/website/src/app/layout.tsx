import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI-Powered Website | Intelligent Browser Automation',
  description: 'Experience the future of web automation with our AI-powered platform. Automate tasks, analyze pages, and boost productivity with intelligent browser assistance.',
  keywords: ['AI', 'automation', 'browser', 'productivity', 'web scraping', 'workflow'],
  authors: [{ name: 'AI Website Team' }],
  creator: 'AI Website',
  publisher: 'AI Website',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'AI-Powered Website | Intelligent Browser Automation',
    description: 'Experience the future of web automation with our AI-powered platform.',
    siteName: 'AI Website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI-Powered Website',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI-Powered Website | Intelligent Browser Automation',
    description: 'Experience the future of web automation with our AI-powered platform.',
    images: ['/og-image.png'],
    creator: '@aiwebsite',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}