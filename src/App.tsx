import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import Dashboard from "./Dashboard";
import { LanguageSwitch } from "./components/LanguageSwitch";
import { Loader } from "./components/Loader";
import { Button, Input, Logo } from "./ds";
import { translateServerError } from "./i18n";
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
  const { t, i18n } = useTranslation();
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
    if (!error) return;
    const known = `auth.errors.${error.code}`;
    setError(error.code && i18n.exists(known) ? t(known as "auth.errors.INVALID_EMAIL") : translateServerError(error.message ?? t("errors.unknown")));
  }

  return (
    <main className="auth">
      <LanguageSwitch />
      <Logo size={88} animate />
      <div className="auth__intro">
        <h1 className="auth__title">{t(signUp ? "auth.signUpTitle" : "auth.signInTitle")}</h1>
        <p className="muted">
          {t(signUp ? "auth.signUpLede" : "auth.signInLede")}
        </p>
      </div>
      <form className="auth__form" onSubmit={onSubmit} key={mode}>
        {signUp && <Input name="name" label={t("auth.name")} autoComplete="given-name" required />}
        <Input name="email" type="email" label={t("auth.email")} autoComplete="email" required />
        <Input
          name="password"
          type="password"
          label={t("auth.password")}
          autoComplete={signUp ? "new-password" : "current-password"}
          minLength={8}
          hint={signUp ? t("auth.passwordHint") : undefined}
          required
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" block disabled={loading}>
          {t(loading ? "auth.wait" : signUp ? "auth.signUp" : "auth.signIn")}
        </Button>
      </form>
      <Button variant="ghost" size="sm" onClick={() => (setMode(signUp ? "signIn" : "signUp"), setError(null))}>
        {t(signUp ? "auth.toSignIn" : "auth.toSignUp")}
      </Button>
    </main>
  );
}
