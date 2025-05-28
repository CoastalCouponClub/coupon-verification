// dashboard.js

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
  deleteDoc,
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
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Globals
let currentBusiness = null;
let businessUID = null;
let redemptionLimit = null;
let resetInterval = null;
let currentCode = null;

const businessInfo = document.getElementById("business-info");
const verifyBtn = document.getElementById("verifyBtn");
const redeemBtn = document.getElementById("redeemBtn");
const codeInput = document.getElementById("codeInput");
const status = document.getElementById("redeemStatus");
const redemptionHistory = document.getElementById("redemptionHistory");
const redemptionHistorySection = document.getElementById("redemptionHistorySection");
const doneBtn = document.getElementById("doneBtn");

redeemBtn.style.display = "none";
doneBtn.style.display = "none";
redemptionHistorySection.style.display = "none";

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const uid = user.uid;
    businessUID = uid;
    const docRef = doc(db, "businessAccounts", uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      businessInfo.innerHTML = `
        <p><strong>Business Name:</strong> ${data.businessName}</p>
        <p><strong>Coupon Offer:</strong> ${data.couponOffer}</p>
        <p><strong>Redemption Limit:</strong> ${data.redemptionLimit}</p>
        <p><strong>Reset Interval:</strong> ${data.resetInterval}</p>
      `;
      currentBusiness = data.businessName;
      redemptionLimit = data.redemptionLimit;
      resetInterval = data.resetInterval;
    }
  } else {
    window.location.href = "login.html";
  }
});

verifyBtn.addEventListener("click", async () => {
  const code = codeInput.value.trim();
  currentCode = code;
  status.innerHTML = "";
  redemptionHistory.innerHTML = "";
  redemptionHistorySection.style.display = "none";
  redeemBtn.style.display = "none";
  doneBtn.style.display = "none";

  if (!code) {
    status.innerHTML = "Please enter a code.";
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists() || !codeSnap.data().isValid) {
    status.innerHTML = "❌ Code not found or invalid.";
    return;
  }

  const redemptions = codeSnap.data().redemptions || [];
  const used = redemptions.filter(r => r.business === currentBusiness);
  const limitReached = redemptionLimit !== "unlimited" && used.length >= parseInt(redemptionLimit);

  status.innerHTML += `<p>✅ Code is valid.</p>`;
  if (limitReached) {
    status.innerHTML += `<p>⚠️ Redemption limit reached (${redemptionLimit}).</p>`;
    redeemBtn.disabled = true;
  } else {
    redeemBtn.disabled = false;
  }

  renderRedemptionHistory(code);
  redemptionHistorySection.style.display = "block";
  redeemBtn.style.display = "inline-block";
  verifyBtn.style.display = "none";
  doneBtn.style.display = "inline-block";
});

redeemBtn.addEventListener("click", async () => {
  const redemption = {
    business: currentBusiness,
    date: new Date().toISOString(),
    edited: false,
    notes: "",
    businessName: currentBusiness
  };

  const codeRef = doc(db, "verifiedCodes", currentCode);
  const snap = await getDoc(codeRef);
  const existing = snap.data().redemptions || [];
  existing.push(redemption);

  await updateDoc(codeRef, { redemptions: existing });
  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code: currentCode,
    ...redemption,
    timestamp: serverTimestamp()
  });

  renderRedemptionHistory(currentCode);
});

async function renderRedemptionHistory(code) {
  redemptionHistory.innerHTML = "";

  const redemptionsRef = collection(db, `businessAccounts/${businessUID}/redemptions`);
  const snapshot = await getDocs(redemptionsRef);
  let count = 0;

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.code === code && !data.deleted) {
      const item = document.createElement("div");
      item.innerHTML = `
        <p><strong>Date:</strong> ${new Date(data.timestamp?.toDate()).toLocaleString() || data.date}</p>
        <button style="background:red;color:white" onclick="deleteRedemption('${docSnap.id}')">Delete</button>
      `;
      redemptionHistory.appendChild(item);
      count++;
    }
  });

  // re-check limit after rendering
  if (redemptionLimit !== "unlimited" && count >= parseInt(redemptionLimit)) {
    redeemBtn.disabled = true;
    status.innerHTML += `<p>⚠️ Redemption limit reached (${redemptionLimit}).</p>`;
  } else {
    redeemBtn.disabled = false;
  }
}

window.deleteRedemption = async (id) => {
  const ref = doc(db, `businessAccounts/${businessUID}/redemptions/${id}`);
  await updateDoc(ref, { deleted: true });
  renderRedemptionHistory(currentCode);
};

doneBtn.addEventListener("click", () => {
  codeInput.value = "";
  status.innerHTML = "";
  redemptionHistory.innerHTML = "";
  redeemBtn.style.display = "none";
  redeemBtn.disabled = true;
  verifyBtn.style.display = "inline-block";
  redemptionHistorySection.style.display = "none";
  doneBtn.style.display = "none";
});
