import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { SuccessPage } from './pages/SuccessPage';
import { AdminPage } from './pages/AdminPage';
import { TestPage } from './pages/TestPage';
import { AxieStudioTestPage } from './pages/AxieStudioTestPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { ProductDebugPage } from './pages/ProductDebugPage';
// import { TeamPage } from './pages/TeamPage'; // TEMPORARILY HIDDEN
import { isSuperAdmin } from './utils/adminAuth';
import { Loader2 } from 'lucide-react';

// Wrapper component to handle login redirects
function LoginWrapper() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  return <Navigate to={redirectTo} replace />;
}

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-white border-2 border-black flex items-center justify-center rounded-none mb-4 mx-auto">
            <img
              src="https://www.axiestudio.se/Axiestudiologo.jpg"
              alt="Axie Studio"
              className="w-12 h-12 object-contain"
            />
          </div>
          <div className="flex items-center gap-3 justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-black" />
            <span className="text-black font-bold uppercase tracking-wide">LOADING AXIE STUDIO...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
        <Route
          path="/login"
          element={user ? <LoginWrapper /> : <LoginPage />}
        />
        <Route 
          path="/success" 
          element={user ? <SuccessPage /> : <Navigate to="/login" replace />} 
        />
        <Route 
          path="/products" 
          element={user ? <ProductsPage /> : <Navigate to="/login" replace />} 
        />
        <Route
          path="/admin"
          element={user && isSuperAdmin(user.id) ? <AdminPage /> : <Navigate to="/dashboard" replace />}
        />
        <Route
          path="/test"
          element={user && isSuperAdmin(user.id) ? <TestPage /> : <Navigate to="/dashboard" replace />}
        />
        <Route
          path="/test/axiestudio"
          element={user && isSuperAdmin(user.id) ? <AxieStudioTestPage /> : <Navigate to="/dashboard" replace />}
        />
        <Route
          path="/account"
          element={user ? <UserManagementPage /> : <Navigate to="/login" replace />}
        />
        {/* TEAM ROUTE TEMPORARILY HIDDEN */}
        {/* <Route
          path="/team"
          element={user ? <TeamPage /> : <Navigate to="/login" replace />}
        /> */}
        <Route
          path="/dashboard"
          element={user ? <DashboardPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/product-debug"
          element={user ? <ProductDebugPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/"
          element={user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />}
        />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;