import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { AuthProvider } from "@/providers/AuthProvider"
import { CartProvider } from "@/providers/cart"
import { Toaster } from "@/components/ui/sonner"
import { RoutedErrorBoundary } from "@/components/ErrorBoundary"
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RoutedErrorBoundary>
        <TRPCProvider>
          <AuthProvider>
            <CartProvider>
              <App />
              {/* Required for the toast.* calls across the app (booking, contact,
                  newsletter, login, cart). Without it those messages render
                  nowhere and failures look like nothing happened. */}
              <Toaster position="top-center" richColors />
            </CartProvider>
          </AuthProvider>
        </TRPCProvider>
      </RoutedErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
