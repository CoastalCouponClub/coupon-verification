import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ✅ Load Firebase config from Netlify-injected script tag
const configScript = document.querySelector('script[data-config]');
const firebaseConfig = JSON.parse(decodeURIComponent(configScript.getAttribute('data-config')));

// ✅ Hardcoded invite code
const inviteCode = "cccinviteonly25"; // Replace with your actual invite code

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Auto-resize support for embeds
if (window.ResizeObserver) {
  const resizeObserver = new ResizeObserver(() => {
    window.parent?.postMessage({ type: 'resize', height: document.body.scrollHeight }, '*');
  });
  resizeObserver.observe(document.body);
}

// ✅ LOGIN LOGIC
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("loginMessage");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginForm["login-email"].value;
    const password = loginForm["login-password"].value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (loginMessage) {
        loginMessage.textContent = "Login successful!";
        loginMessage.className = "form-message success";
        loginMessage.style.display = "block";
        loginMessage.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setTimeout(() => {
        window.location.href = "/businessPortal/dashboard.html";
      }, 1000);
    } catch (error) {
      if (loginMessage) {
        loginMessage.textContent = "Login failed: " + error.message;
        loginMessage.className = "form-message error";
        loginMessage.style.display = "block";
        loginMessage.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        alert("Login failed: " + error.message);
      }
    }
  });
}

// ✅ SIGNUP LOGIC
const signupForm = document.getElementById("signup-form");
const signupMessage = document.getElementById("formMessage");

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = signupForm["signup-email"].value;
    const password = signupForm["signup-password"].value;
    const businessName = signupForm["signup-business-name"].value;
    const couponOffer = signupForm["signup-offer"].value;
    const redemptionLimit = signupForm["signup-redemption-limit"].value;
    const resetInterval = signupForm["signup-reset-interval"].value;
    const enteredInvite = signupForm["signup-invite-code"].value.trim();

    if (enteredInvite !== inviteCode) {
      signupMessage.textContent = "Signup failed: Invalid invite code.";
      signupMessage.className = "form-message error";
      signupMessage.style.display = "block";
      signupMessage.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, "businessAccounts", uid), {
        businessName,
        email,
        couponOffer,
        redemptionLimit,
        resetInterval,
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, "businessAccounts", uid, "redemptions"), {
        initialized: true,
        timestamp: serverTimestamp()
      });

      signupMessage.textContent = "Account created successfully!";
      signupMessage.className = "form-message success";
      signupMessage.style.display = "block";
      signupMessage.scrollIntoView({ behavior: "smooth", block: "center" });
      signupForm.reset();

      setTimeout(() => {
        window.location.href = "/businessPortal/dashboard.html";
      }, 1500);
    } catch (error) {
      signupMessage.textContent = "Signup failed: " + error.message;
      signupMessage.className = "form-message error";
      signupMessage.style.display = "block";
      signupMessage.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}
