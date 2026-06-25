"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { getDefaultPathForUser } from "@/lib/admin-access";
import {
  clearRememberedLoginName,
  clearStoredAdminAuth,
  getRememberedLoginName,
  loginAdmin,
  rememberLoginName,
  saveAdminAuth,
} from "@/lib/admin-auth";

import "./login.css";

export default function LoginPage() {
  const router = useRouter();
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedLoginName = getRememberedLoginName();
    if (savedLoginName) {
      setLoginName(savedLoginName);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const authPayload = await loginAdmin({
        username: loginName.trim(),
        password,
      });

      saveAdminAuth(authPayload);

      if (rememberMe) {
        rememberLoginName(loginName.trim());
      } else {
        clearRememberedLoginName();
      }

      toast.success("Login successful!");

      setTimeout(() => {
        startTransition(() => {
          router.replace(getDefaultPathForUser(authPayload.user));
          router.refresh();
        });
      }, 1500);
    } catch (error) {
      clearStoredAdminAuth();
      setErrorMessage(error.message || "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white">
      <style>{`
        @keyframes slideUpFade {
          0% { opacity: 0; transform: translateY(30px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-entrance {
          opacity: 0;
          animation: slideUpFade 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <ToastContainer position="top-right" autoClose={1500} hideProgressBar={false} newestOnTop closeOnClick pauseOnFocusLoss draggable pauseOnHover theme="colored" />
      <div className="py-4 px-4 md:px-8 w-full">
        <div className="grid lg:grid-cols-2 items-center gap-6 max-w-6xl w-full mx-auto animate-entrance">
          <div className="border border-slate-300 bg-white rounded-lg p-6 max-w-md mx-auto shadow-sm md:p-8 lg:mx-0 w-full lg:order-last">
            <div className="mb-8">
              <h1 className="text-slate-900 text-3xl font-bold mb-4">TKINFOTECHSOFT ERP </h1>
            
            </div>

            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <label htmlFor="email" className="mb-2 text-slate-900 font-medium text-sm inline-block">
                  Login Name
                </label>
                <input 
                  type="text" 
                  id="email" 
                  name="email" 
                  placeholder="Enter login name" 
                  required
                  className="px-3 py-2.5 text-sm text-slate-900 rounded-md bg-white w-full outline-1 -outline-offset-1 outline-slate-300 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600" 
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  autoComplete="username"
                />
              </div>
              
              <div>
                <label htmlFor="password" className="mb-2 text-slate-900 font-medium text-sm inline-block">
                  Password
                </label>
                <input 
                  type="password" 
                  id="password" 
                  name="password" 
                  placeholder="••••••••" 
                  required
                  className="px-3 py-2.5 text-sm text-slate-900 rounded-md bg-white w-full outline-1 -outline-offset-1 outline-slate-300 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div className="flex items-start flex-wrap gap-2">
                <label className="flex items-center group has-[input:checked]:text-slate-900">
                  <input 
                    id="remember" 
                    name="remember" 
                    type="checkbox" 
                    className="sr-only" 
                    checked={rememberMe}
                    onChange={() => setRememberMe((current) => !current)}
                  />
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded outline-1 outline-slate-300 bg-white group-has-[input:checked]:bg-blue-600 group-has-[input:checked]:outline-blue-600 group-focus-within:outline-2 group-focus-within:outline-blue-600" aria-hidden="true">
                    <svg className="size-3 text-white opacity-0 group-has-[input:checked]:opacity-100" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 5l3 3 7-7" />
                    </svg>
                  </span>
                  <span className="ml-3 text-sm text-slate-700">
                    Remember me
                  </span>
                </label>

                <a href="#" className="ml-auto text-sm font-medium text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                  Forgot password?
                </a>
              </div>

              {errorMessage ? <p className="text-red-500 text-sm mt-2">{errorMessage}</p> : null}

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-2 px-3.5 text-sm rounded-md font-semibold cursor-pointer tracking-wide text-white border border-blue-600 bg-blue-600 hover:bg-blue-700 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Checking..." : "Sign in"}
              </button>
            </form>
          </div>

          <div className="aspect-[71/50] max-lg:w-4/5 mx-auto lg:order-first">
            <img src="/logo.png" className="w-full object-cover" alt="login img" />
          </div>
        </div>
      </div>
    </main>
  );
}
