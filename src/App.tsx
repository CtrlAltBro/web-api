import { useState, type FormEvent } from "react";
import { authClient } from "./lib/auth-client";

export default function App() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <main className="card">Chargement…</main>;
  if (!session) return <AuthForm />;

  return (
    <main className="card">
      <h1>CtrlAltBro</h1>
      <p>Connecté en tant que {session.user.email}</p>
      <button onClick={() => authClient.signOut()}>Se déconnecter</button>
    </main>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    setLoading(true);
    setError(null);
    const { error } =
      mode === "signIn"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(form.get("name")) });
    setLoading(false);
    if (error) setError(error.message ?? "Erreur inconnue");
  }

  return (
    <main className="card">
      <h1>{mode === "signIn" ? "Connexion" : "Créer un compte"}</h1>
      <form onSubmit={onSubmit}>
        {mode === "signUp" && <input name="name" placeholder="Nom" required />}
        <input name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input
          name="password"
          type="password"
          placeholder="Mot de passe"
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
        {error && <p className="error">{error}</p>}
        <button disabled={loading}>{mode === "signIn" ? "Se connecter" : "Créer le compte"}</button>
      </form>
      <button className="link" onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}>
        {mode === "signIn" ? "Pas de compte ? En créer un" : "Déjà un compte ? Se connecter"}
      </button>
    </main>
  );
}
