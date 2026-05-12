import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-cream">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl mb-2">🍊</div>
          <h1 className="text-2xl font-bold text-ink">NotJust OS</h1>
          <p className="text-sm text-inkSoft mt-1">Sign in to continue</p>
        </div>

        <div className="bg-white border border-border rounded-lg p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="text-xs text-inkSoft text-center mt-6">
          v2 · Supabase-backed
        </p>
      </div>
    </div>
  );
}
