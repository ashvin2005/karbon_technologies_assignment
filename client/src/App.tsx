import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";

type SessionUser = { id: string; email: string; createdAt: string };

export default function App() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    api.me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const auth = useMemo(
    () => ({
      user,
      login: (nextUser: SessionUser) => setUser(nextUser),
      logout: async () => {
        await api.logout();
        setUser(null);
        navigate("/login");
      }
    }),
    [user, navigate]
  );

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-lg">Loading SplitMint...</div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage onSuccess={auth.login} />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/" replace /> : <RegisterPage onSuccess={auth.login} />}
      />
      <Route
        path="/"
        element={user ? <DashboardPage user={user} onLogout={auth.logout} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
