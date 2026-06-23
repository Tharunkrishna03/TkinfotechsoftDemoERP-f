"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

      startTransition(() => {
        router.replace(getDefaultPathForUser(authPayload.user));
        router.refresh();
      });
    } catch (error) {
      clearStoredAdminAuth();
      setErrorMessage(error.message || "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="image-side">
          <img
            src="/loginpage2.png"
            alt="Login"
          />
        </div>

        <div className="form-side">
          <h2><center>Login</center></h2>
          

          <form className="login-form" onSubmit={handleLogin}>
            <fieldset className="login-fieldset">
              <legend>Login Name</legend>
              <input
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                autoComplete="username"
                placeholder="Enter login name"
                required
              />
            </fieldset>

            <fieldset className="login-fieldset">
              <legend>Password</legend>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter password"
                required
              />
            </fieldset>

            <div className="options">
              <label>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={() => setRememberMe((currentValue) => !currentValue)}
                />{" "}
                Remember Me
              </label>
            </div>

            {errorMessage ? <p className="login-error">{errorMessage}</p> : null}

            <button className="login-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Checking..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
