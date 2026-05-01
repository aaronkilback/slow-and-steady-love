import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, ProtectedRoute } from "@/components/auth/AuthProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import AuthPage from "./pages/AuthPage";
import SignalPage from "./pages/SignalPage";
import MessagesPage from "./pages/MessagesPage";
import AegisPage from "./pages/AegisPage";
import AgentsPage from "./pages/AgentsPage";
import AgentChatPage from "./pages/AgentChatPage";
import ProfilePage from "./pages/ProfilePage";
import TravelPage from "./pages/TravelPage";
import InstallPage from "./pages/InstallPage";
import CommsPage from "./pages/CommsPage";
import SOSPage from "./pages/SOSPage";
import NetworkScanPage from "./pages/NetworkScanPage";
import InvitePage from "./pages/InvitePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/install" element={<InstallPage />} />
            {/* Public invite acceptance — no auth required */}
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route path="/" element={<Navigate to="/aegis" replace />} />
              <Route path="/signal" element={<SignalPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/aegis" element={<AegisPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/agent/:agentId" element={<AgentChatPage />} />
              <Route path="/travel" element={<TravelPage />} />
              <Route path="/comms" element={<CommsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/sos" element={<SOSPage />} />
              <Route path="/network-scan" element={<NetworkScanPage />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
