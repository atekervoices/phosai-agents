import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  const isClerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  if (!isClerkEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-center">
        <div className="max-w-md space-y-4 p-8 rounded-2xl bg-card border border-border shadow-xl">
          <h2 className="text-lg font-bold text-foreground">Clerk Authentication Not Configured</h2>
          <p className="text-xs text-muted-foreground">
            Please add <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-amber-400">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-amber-400">CLERK_SECRET_KEY</code> to your <code className="font-mono">.env</code> file.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto shadow-2xl rounded-2xl overflow-hidden border border-border",
            card: "bg-card text-foreground",
          },
        }}
      />
    </div>
  );
}
