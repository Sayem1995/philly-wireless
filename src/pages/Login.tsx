import { useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isFirebaseConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Sign-in unavailable</CardTitle>
            <CardDescription>
              Firebase is not configured. Add the VITE_FIREBASE_* env vars to
              enable member sign-in.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success("Signed in!");
      navigate("/admin");
    } catch (err) {
      const msg =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      if (msg.includes("invalid-credential") || msg.includes("user-not-found")) {
        toast.error("Invalid email or password.");
      } else {
        toast.error("Sign-in failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!auth) return;
    setSubmitting(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      toast.success("Signed in!");
      navigate("/admin");
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      if (code !== "auth/popup-closed-by-user") {
        toast.error("Google sign-in failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Staff sign in for the Philly Phone Repair admin</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-3" onSubmit={handleEmailLogin}>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@phillyphonerepair.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="relative text-center">
            <span className="text-xs text-muted-foreground">or</span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            disabled={submitting}
            onClick={handleGoogleLogin}
          >
            <GoogleIcon /> Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}