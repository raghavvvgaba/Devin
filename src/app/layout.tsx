import "~/styles/globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { type Metadata } from "next";
import { ThemeProvider } from "~/components/theme-provider";
import { TooltipProvider } from "~/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Devin",
  description: "A simple GitHub contribution layer for non-technical users.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" className="antialiased" suppressHydrationWarning>
        <body className="font-sans min-h-screen bg-background">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
