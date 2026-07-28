import { Navigate } from "react-router-dom";
import { useAuth, Role } from "../auth/AuthContext";

export default function ProtectedRoute({
  role,
  children,
}: {
  role: Role;
  children: JSX.Element;
}) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (user.role !== role) {
    return <Navigate to="/" replace />;
  }
  return children;
}
