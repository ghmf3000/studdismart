// services/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBrTJ7R10Ms-ka9O7xwADiv-kyoVkiTlEg",
  authDomain: "studywiseai-458aa.firebaseapp.com",
  projectId: "studywiseai-458aa",
  storageBucket: "studywiseai-458aa.firebasestorage.app",
  messagingSenderId: "1094903850038",
  appId: "1:1094903850038:web:REPLACE_WITH_YOUR_REAL_WEB_APP_ID",
};

// ✅ Initialize exactly once
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ Auth is registered because we import from "firebase/auth" above
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
