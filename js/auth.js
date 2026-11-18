import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  ref,
  get,
  set,
  update,
  serverTimestamp
} from "./firebase-config.js";

export function getDefaultAvatar(name) {
  const initial = encodeURIComponent((name || "P").charAt(0).toUpperCase());
  return `https://ui-avatars.com/api/?name=${initial}&background=f5b942&color=1b1302&bold=true`;
}

export async function ensureUserProfile(user, customDisplayName = null) {
  const userRef = ref(db, `users/${user.uid}`);
  const snap = await get(userRef);
  const displayName = customDisplayName || user.displayName || user.email?.split("@")[0] || "Player";
  const photoURL = user.photoURL || getDefaultAvatar(displayName);

  if (!snap.exists()) {
    const newProfile = {
      uid: user.uid,
      displayName,
      email: user.email || "",
      photoURL,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      settings: {
        sfx: true,
        bgm: false,
        language: "bilingual"
      },
      stats: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        totalPoints: 0
      }
    };
    await set(userRef, newProfile);
    return newProfile;
  } else {
    await update(userRef, {
      displayName,
      photoURL,
      updatedAt: serverTimestamp()
    });
    return { ...snap.val(), displayName, photoURL };
  }
}

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return ensureUserProfile(result.user);
}

export async function loginWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return ensureUserProfile(result.user);
}

export async function registerWithEmail(displayName, email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName });
  return ensureUserProfile(result.user, displayName);
}

export async function logoutUser() {
  await signOut(auth);
}

export function formatAuthError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Invalid email or password. Please try again.";
  }
  if (code.includes("email-already-in-use")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (code.includes("weak-password")) {
    return "Password must be at least 6 characters long.";
  }
  if (code.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (code.includes("popup-closed-by-user")) {
    return "Google sign-in popup was closed before completing.";
  }
  return err?.message || "Authentication failed. Please check your connection and try again.";
}
