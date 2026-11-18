import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  off,
  serverTimestamp,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCG_JThU0tEgfiZNm23dFOAKlZuaX9QfHc",
  authDomain: "quiz-94ebe.firebaseapp.com",
  databaseURL: "https://quiz-94ebe-default-rtdb.firebaseio.com",
  projectId: "quiz-94ebe",
  storageBucket: "quiz-94ebe.firebasestorage.app",
  messagingSenderId: "41248985742",
  appId: "1:41248985742:web:3a1e3fbaec6cb42dd06fdf"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  off,
  serverTimestamp,
  onDisconnect
};
