import { Navigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute - Protects routes from unauthenticated access
 * Redirects to login if no valid token is found in localStorage
 * Note: Token validation is handled by the backend API
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const location = useLocation();

  // Check if token exists in localStorage
  const token = localStorage.getItem("adminToken");
  const user = localStorage.getItem("adminUser");

  // If no token or user data, redirect to login
  if (!token || !user) {
    // Redirect to login page and save the current location for redirect back after login
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // If token exists, render the protected content
  // The actual token validation is done by the backend API
  // If token is invalid, the API will return 401 and the interceptor will redirect to login
  return <>{children}</>;
};

export default ProtectedRoute;
