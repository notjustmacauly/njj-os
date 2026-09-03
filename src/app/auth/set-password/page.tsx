import { SetPasswordForm } from "./set-password-form";

export const dynamic = "force-dynamic";

export default function SetPasswordPage() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-border rounded-xl shadow-card p-6">
        <h1 className="font-serif font-bold text-2xl text-ink mb-1">Set your password</h1>
        <p className="text-sm text-inkSoft mb-4">
          Choose a password to finish setting up your account.
        </p>
        <SetPasswordForm />
      </div>
    </div>
  );
}
