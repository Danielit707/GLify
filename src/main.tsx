import { ClerkProvider } from "@clerk/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthenticatedApp from "./AuthenticatedApp";
import "./styles.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
        <AuthenticatedApp />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);