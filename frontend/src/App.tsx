import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import StudentDashboard from "./pages/StudentDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import NewApplicationPage from "./pages/NewApplicationPage";
import StudentPasswordResetPage from "./pages/StudentPasswordResetPage";
import DocumentTypeAdminPage from "./pages/DocumentTypeAdminPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="/change-password"
            element={
              <RequireAnyAuth>
                <ChangePasswordPage />
              </RequireAnyAuth>
            }
          />
          <Route
            path="/student"
            element={
              <ProtectedRoute role="student">
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/new"
            element={
              <ProtectedRoute role="student">
                <NewApplicationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute role="staff">
                <StaffDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/reset-password"
            element={
              <ProtectedRoute role="staff">
                <StudentPasswordResetPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/document-types"
            element={
              <ProtectedRoute role="staff">
                <DocumentTypeAdminPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

// change-passwordは学生・職員どちらでもアクセスできるが、未ログインならログイン画面に戻す
function RequireAnyAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return children;
}
