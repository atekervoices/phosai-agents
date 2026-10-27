"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  type User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type UserCredential,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  role: "admin" | "user";
  isFirebaseConfigured: boolean;
  signIn: (email: string, password: string) => Promise<UserCredential>;
  signUp: (email: string, password: string) => Promise<UserCredential>;
  signInWithGoogle: () => Promise<UserCredential>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAIL = (
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
  process.env.ADMIN_EMAIL ||
  "simonallanachuka@gmail.com"
).toLowerCase();

function setCookie(name: string, value: string, days = 7) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<"admin" | "user">("user");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If Firebase keys aren't configured in environment, allow seamless local/demo mode
    if (!isFirebaseConfigured) {
      const demoEmail = localStorage.getItem("demo_user_email") || ADMIN_EMAIL;
      setIsAdmin(true);
      setRole("admin");
      setLoading(false);
      return;
    }

    const syncUserSession = async (currentUser: User | null) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          const tokenResult = await currentUser.getIdTokenResult();
          const customRole = String(
            tokenResult.claims.role || (tokenResult.claims.admin ? "admin" : "")
          ).toLowerCase();
          const userEmail = (currentUser.email || "").toLowerCase();
          const userIsAdmin =
            customRole === "admin" || (Boolean(userEmail) && userEmail === ADMIN_EMAIL);

          setIsAdmin(userIsAdmin);
          setRole(userIsAdmin ? "admin" : "user");

          // Save to localStorage for client-side API clients
          localStorage.setItem("firebase_token", token);
          localStorage.setItem("firebase_uid", currentUser.uid);
          localStorage.setItem("firebase_role", userIsAdmin ? "admin" : "user");

          // Sync cookies for Next.js proxy & server-side requests
          setCookie("firebase_token", token);
          setCookie("firebase_uid", currentUser.uid);
          setCookie("firebase_role", userIsAdmin ? "admin" : "user");
          if (currentUser.email) {
            setCookie("firebase_email", currentUser.email);
          }
        } catch (err) {
          console.error("Error retrieving Firebase token:", err);
        }
      } else {
        setIsAdmin(false);
        setRole("user");
        localStorage.removeItem("firebase_token");
        localStorage.removeItem("firebase_uid");
        localStorage.removeItem("firebase_role");
        deleteCookie("firebase_token");
        deleteCookie("firebase_uid");
        deleteCookie("firebase_role");
        deleteCookie("firebase_email");
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      await syncUserSession(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (cred.user) {
      const token = await cred.user.getIdToken();
      const userEmail = (cred.user.email || "").toLowerCase();
      const userIsAdmin = userEmail === ADMIN_EMAIL;
      setIsAdmin(userIsAdmin);
      setRole(userIsAdmin ? "admin" : "user");
      setUser(cred.user);
      localStorage.setItem("firebase_token", token);
      localStorage.setItem("firebase_uid", cred.user.uid);
      localStorage.setItem("firebase_role", userIsAdmin ? "admin" : "user");
      setCookie("firebase_token", token);
      setCookie("firebase_uid", cred.user.uid);
      setCookie("firebase_role", userIsAdmin ? "admin" : "user");
      if (cred.user.email) setCookie("firebase_email", cred.user.email);
    }
    return cred;
  };

  const signUp = async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (cred.user) {
      const token = await cred.user.getIdToken();
      const userEmail = (cred.user.email || "").toLowerCase();
      const userIsAdmin = userEmail === ADMIN_EMAIL;
      setIsAdmin(userIsAdmin);
      setRole(userIsAdmin ? "admin" : "user");
      setUser(cred.user);
      localStorage.setItem("firebase_token", token);
      localStorage.setItem("firebase_uid", cred.user.uid);
      localStorage.setItem("firebase_role", userIsAdmin ? "admin" : "user");
      setCookie("firebase_token", token);
      setCookie("firebase_uid", cred.user.uid);
      setCookie("firebase_role", userIsAdmin ? "admin" : "user");
      if (cred.user.email) setCookie("firebase_email", cred.user.email);
    }
    return cred;
  };

  const signInWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    if (cred.user) {
      const token = await cred.user.getIdToken();
      const userEmail = (cred.user.email || "").toLowerCase();
      const userIsAdmin = userEmail === ADMIN_EMAIL;
      setIsAdmin(userIsAdmin);
      setRole(userIsAdmin ? "admin" : "user");
      setUser(cred.user);
      localStorage.setItem("firebase_token", token);
      localStorage.setItem("firebase_uid", cred.user.uid);
      localStorage.setItem("firebase_role", userIsAdmin ? "admin" : "user");
      setCookie("firebase_token", token);
      setCookie("firebase_uid", cred.user.uid);
      setCookie("firebase_role", userIsAdmin ? "admin" : "user");
      if (cred.user.email) setCookie("firebase_email", cred.user.email);
    }
    return cred;
  };

  const signOutUser = async () => {
    if (isFirebaseConfigured) {
      await fbSignOut(auth);
    }
    localStorage.removeItem("firebase_token");
    localStorage.removeItem("firebase_uid");
    localStorage.removeItem("firebase_role");
    localStorage.removeItem("demo_user_email");
    deleteCookie("firebase_token");
    deleteCookie("firebase_uid");
    deleteCookie("firebase_role");
    deleteCookie("firebase_email");
    setUser(null);
    setIsAdmin(false);
    setRole("user");
  };

  const getIdToken = async () => {
    if (user) {
      return await user.getIdToken();
    }
    return localStorage.getItem("firebase_token");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        role,
        isFirebaseConfigured,
        signIn,
        signUp,
        signInWithGoogle,
        signOut: signOutUser,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
