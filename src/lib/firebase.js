// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

console.log("firebaseConfig:", firebaseConfig);

const app = initializeApp(firebaseConfig);

console.log("app options:", app.options);

// ここを変更
export const auth = getAuth(app);
export const db = getFirestore(app, "(default)");

console.log("firestore db app projectId:", db.app.options.projectId);
console.log("firestore db type:", db.type);
console.log("firestore databaseId:", db._databaseId);