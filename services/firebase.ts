
// services/firebase.ts
// Standard modular imports for Firebase v9+
import * as FirebaseApp from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBrTJ7R10Ms-ka9O7xwADiv-kyoVkiTlEg",
  authDomain: "studywiseai-458aa.firebaseapp.com",
  projectId: "studywiseai-458aa",
  storageBucket: "studywiseai-458aa.firebasestorage.app",
  messagingSenderId: "1094903850038",
  appId: "1:1094903850038:web:REPLACE_WITH_YOUR_REAL_WEB_APP_ID",
};

// ✅ Initialize exactly once using namespaced methods to bypass named export resolution issues in certain environments
export const app = FirebaseApp.getApps().length 
  ? FirebaseApp.getApp() 
  : FirebaseApp.initializeApp(firebaseConfig);

// ✅ Auth is registered via the modular SDK, initialized with the app instance
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
