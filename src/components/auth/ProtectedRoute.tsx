import { Navigate } from "react-router-dom";
import { useAuthContext } from "@/context/UserContext";

export const ProtectedRoute = ({ children }: { children: React.ReactElement }) => {
  const { loading, session } = useAuthContext();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
};
