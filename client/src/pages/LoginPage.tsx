import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

type Props = {
  onSuccess: (user: { id: string; email: string; createdAt: string }) => void;
};

export default function LoginPage({ onSuccess }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("demo@splitmint.app");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await api.login(email, password);
      onSuccess(res.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <section className="w-full max-w-md rounded-3xl bg-white/90 p-8 shadow-card animate-rise">
        <h1 className="font-display text-4xl text-ink">SplitMint</h1>
        <p className="mt-2 text-sm text-ink/70">Track shared expenses with precise splits and instant balances.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold">
            Email
            <input
              className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </label>

          <label className="block text-sm font-semibold">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-ink/20 px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>

          {error && <p className="text-sm text-coral">{error}</p>}

          <button
            className="w-full rounded-xl bg-mint py-2.5 font-semibold text-white disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-sm text-ink/70">
          New here? <Link className="font-semibold text-ink" to="/register">Create account</Link>
        </p>
      </section>
    </main>
  );
}
