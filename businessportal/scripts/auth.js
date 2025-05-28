import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import firebaseConfig from "./firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Signup handler
export async function handleSignup(email, password, businessName, couponOffer, redemptionLimit, resetInterval) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = userCredential.user.uid;

  // Save profile to Firestore
  await setDoc(doc(db, "businessAccounts", uid), {
    businessName,
    couponOffer,
    redemptionLimit,
    resetInterval,
    createdAt: serverTimestamp()
  });

  return uid;
}

// Login handler
export async function handleLogin(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user.uid;
}

// Auth state change listener (optional)
export function onAuthChange(callback) {
  onAuthStateChanged(auth, callback);
}
