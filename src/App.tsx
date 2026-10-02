import { useState, type FormEvent } from "react";
import Dashboard from "./Dashboard";
import { Loader } from "./components/Loader";
import { Button, Input, Logo } from "./ds";
import { authClient } from "./lib/auth-client";
import { useTheme } from "./lib/theme";

export default function App() {
  const { data: session, isPending } = authClient.useSession();
  const [theme, setTheme] = useTheme();

  if (isPending)
    return (
      <main className="splash">
        <Loader />
      </main>
    );
  if (!session) return <AuthForm />;

  return <Dashboard email={session.user.email} dark={theme === "dark"} onDark={(dark) => setTheme(dark ? "dark" : "light")} />;
}

function AuthForm() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const signUp = mode === "signUp";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    setLoading(true);
    setError(null);
    const { error } = signUp
      ? await authClient.signUp.email({ email, password, name: String(form.get("name")) })
      : await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) setError(error.message ?? "Erreur inconnue");
  }

  return (
    <main className="auth">
      <Logo size={88} animate />
      <div className="auth__intro">
        <h1 className="auth__title">{signUp ? "Créer un compte" : "Connexion"}</h1>
        <p className="muted">
          {signUp ? "Un compte pour suivre et régler les PC de la famille." : "Retrouvez les PC de la famille."}
        </p>
      </div>
      <form className="auth__form" onSubmit={onSubmit} key={mode}>
        {signUp && <Input name="name" label="Prénom" autoComplete="given-name" required />}
        <Input name="email" type="email" label="Adresse e-mail" autoComplete="email" required />
        <Input
          name="password"
          type="password"
          label="Mot de passe"
          autoComplete={signUp ? "new-password" : "current-password"}
          minLength={8}
          hint={signUp ? "8 caractères minimum." : undefined}
          required
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" block disabled={loading}>
          {loading ? "Un instant…" : signUp ? "Créer le compte" : "Se connecter"}
        </Button>
      </form>
      <Button variant="ghost" size="sm" onClick={() => (setMode(signUp ? "signIn" : "signUp"), setError(null))}>
        {signUp ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? En créer un"}
      </Button>
    </main>
  );
}
