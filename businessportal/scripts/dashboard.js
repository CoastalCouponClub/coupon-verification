import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBJxxcGhuYspiZ9HRAlZgihgXLaA2FjPXc",
  authDomain: "coastalcouponverifier.firebaseapp.com",
  projectId: "coastalcouponverifier",
  storageBucket: "coastalcouponverifier.firebasestorage.app",
  messagingSenderId: "189807704712",
  appId: "1:189807704712:web:9427e68464115f388ebd3d"
  // etc
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Globals
let currentBusiness = null;
let businessUID = null;
let redemptionLimit = null;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const uid = user.uid;
    const docRef = doc(db, "businessAccounts", uid);
    const businessSnap = await getDoc(docRef);

    if (businessSnap.exists()) {
      const data = businessSnap.data();
      document.getElementById("business-info").innerHTML = `
        <p><strong>Business Name:</strong> ${data.businessName}</p>
        <p><strong>Coupon Offer:</strong> ${data.couponOffer}</p>
        <p><strong>Redemption Limit:</strong> ${data.redemptionLimit}</p>
        <p><strong>Reset Interval:</strong> ${data.resetInterval}</p>
      `;
      currentBusiness = data.businessName;
      businessUID = uid;
      redemptionLimit = data.redemptionLimit;
    } else {
      document.getElementById("business-info").innerText = "Business account not found.";
    }
  } else {
    window.location.href = "login.html";
  }
});

// Verify Code First
document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");
  status.innerText = "";
  history.innerHTML = "";

  if (!code) {
    status.innerText = "Please enter a code to verify.";
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists()) {
    status.innerText = "Code not found or inactive.";
    return;
  }

  const data = codeSnap.data();
  if (!data.isValid) {
    status.innerText = "This code is marked as invalid.";
    return;
  }

  // Check redemption history
  const redemptions = data.redemptions || [];
  const usedAtThisBusiness = redemptions.filter(r => r.business === currentBusiness);

  if (redemptionLimit !== "unlimited" && usedAtThisBusiness.length >= parseInt(redemptionLimit)) {
    status.innerText = `Redemption limit reached at your business (${redemptionLimit}x).`;
    return;
  }

  if (usedAtThisBusiness.length > 0) {
    status.innerText = "Code is valid but has been redeemed here before:";
    usedAtThisBusiness.forEach(r => {
      const item = document.createElement("li");
      item.innerText = `• ${r.date}`;
      history.appendChild(item);
    });
  } else {
    status.innerText = "Code is valid and has not yet been redeemed here.";
  }

  document.getElementById("redeemBtn").disabled = false;
});

// Redeem Code
document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");

  if (!code || !currentBusiness) {
    status.innerText = "Missing code or business info.";
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists()) {
    status.innerText = "Code does not exist.";
    return;
  }

  const redemption = {
    business: currentBusiness,
    date: new Date().toISOString(),
    edited: false,
    notes: "",
    businessName: currentBusiness
  };

  // Update redemptions array
  const existing = codeSnap.data().redemptions || [];
  existing.push(redemption);

  await updateDoc(codeRef, {
    redemptions: existing
  });

  // Also log to redemptions subcollection
  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    ...redemption,
    timestamp: serverTimestamp()
  });

  status.innerText = "Redemption logged successfully!";
  document.getElementById("redeemBtn").disabled = true;
});
