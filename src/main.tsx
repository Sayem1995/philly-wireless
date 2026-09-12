import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { AuthProvider } from "@/providers/AuthProvider"
import { Toaster } from "@/components/ui/sonner"
import { RoutedErrorBoundary } from "@/components/ErrorBoundary"
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RoutedErrorBoundary>
        <TRPCProvider>
          <AuthProvider>
            <App />
            {/* Required for the toast.* calls across the app (booking, contact,
                newsletter, login). Without it those messages render nowhere and
                failures look like nothing happened. */}
            <Toaster position="top-center" richColors />
          </AuthProvider>
        </TRPCProvider>
      </RoutedErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
