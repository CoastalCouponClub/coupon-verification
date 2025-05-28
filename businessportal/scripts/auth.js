import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBJxxcGhuYspiZ9HRAlZgihgXLaA2FjPXc",
  authDomain: "coastalcouponverifier.firebaseapp.com",
  projectId: "coastalcouponverifier",
  storageBucket: "coastalcouponverifier.firebasestorage.app",
  messagingSenderId: "189807704712",
  appId: "1:189807704712:web:9427e68464115f388ebd3d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Login
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginForm["login-email"].value;
    const password = loginForm["login-password"].value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/businessPortal/dashboard.html";
    } catch (error) {
      alert("Login failed: " + error.message);
    }
  });
}

// Signup
const signupForm = document.getElementById("signup-form");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = signupForm["signup-email"].value;
    const password = signupForm["signup-password"].value;
    const businessName = signupForm["signup-business-name"].value;
    const couponOffer = signupForm["signup-offer"].value;
    const redemptionLimit = signupForm["signup-redemption-limit"].value;
    const resetInterval = signupForm["signup-reset-interval"].value;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // Create business account document
      await setDoc(doc(db, "businessAccounts", uid), {
        businessName,
        email,
        couponOffer,
        redemptionLimit,
        resetInterval,
        createdAt: serverTimestamp()
      });

      // Create empty redemptions subcollection with an initial dummy entry (optional)
      const redemptionsRef = collection(db, "businessAccounts", uid, "redemptions");
      await addDoc(redemptionsRef, {
        initialized: true,
        timestamp: serverTimestamp()
      });

      window.location.href = "/businessPortal/dashboard.html";
    } catch (error) {
      alert("Signup failed: " + error.message);
    }
  });
}
