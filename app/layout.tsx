import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Playfair_Display } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Header } from '@/components/header'
import { ThemeProvider } from '@/components/theme-provider'
import { FolderProvider } from '@/components/folder-context'
import { Toaster } from '@/components/ui/toaster'
import { AutoSyncProvider } from '@/components/auto-sync-provider'
import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({ 
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  weight: ["400", "500", "600", "700"]
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: 'VocabLab – Revolution',
  description: 'AI-powered dynamic flashcards for efficient language learning. Enhance your vocabulary with personalized flashcards and spaced repetition.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#18181a' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${plusJakartaSans.variable} ${playfairDisplay.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <FolderProvider>
            <AutoSyncProvider />
            <Header />
            <main className="page-fade mx-auto w-full max-w-[1150px] px-3 pb-10 pt-8 sm:px-6 sm:pb-12 sm:pt-10 md:pb-16">
              {children}
            </main>
            <Toaster />
            <Analytics />
          </FolderProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
