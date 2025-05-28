window.addEventListener("DOMContentLoaded", () => {
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
  deleteDoc,
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

let currentBusiness = null;
let businessUID = null;
let redemptionLimit = null;
let resetInterval = null;
let currentCode = null;

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
      resetInterval = data.resetInterval;
    }
  } else {
    window.location.href = "login.html";
  }
});

// Hide redeem and history until verification
document.getElementById("redeemBtn").style.display = "none";
document.getElementById("doneBtn").style.display = "none";
document.getElementById("redemptionSection").style.display = "none";

// Verify Code
document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");
  status.innerHTML = "";
  history.innerHTML = "";
  currentCode = null;

  if (!code) {
    status.innerHTML = `<span style="color:red">Please enter a code.</span>`;
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists() || !codeSnap.data().isValid) {
    status.innerHTML = `<span style="color:red">❌ Code not found or inactive.</span>`;
    return;
  }

  const data = codeSnap.data();
  const redemptions = data.redemptions || [];
  const usedAtBusiness = redemptions.filter(r => r.business === currentBusiness && !r.deleted);

  status.innerHTML = `<span style="color:green">✅ Code is valid.</span>`;

  if (redemptionLimit !== "unlimited" && usedAtBusiness.length >= parseInt(redemptionLimit)) {
    status.innerHTML += `<br><span style="color:orange">⚠️ Redemption limit reached (${redemptionLimit}).</span>`;
    document.getElementById("redeemBtn").disabled = true;
  } else {
    document.getElementById("redeemBtn").disabled = false;
  }

  currentCode = code;
  await showRedemptionHistory(code);
  document.getElementById("redeemBtn").style.display = "inline-block";
  document.getElementById("doneBtn").style.display = "inline-block";
  document.getElementById("verifyBtn").style.display = "none";
  document.getElementById("redemptionSection").style.display = "block";
});

// Redeem Code
document.getElementById("redeemBtn").addEventListener("click", async () => {
  if (!currentCode || !currentBusiness) return;

  const codeRef = doc(db, "verifiedCodes", currentCode);
  const codeSnap = await getDoc(codeRef);
  const redemptions = codeSnap.data().redemptions || [];

  const newRedemption = {
    business: currentBusiness,
    date: new Date().toISOString(),
    edited: false,
    notes: "",
    businessName: currentBusiness
  };

  redemptions.push(newRedemption);

  await updateDoc(codeRef, {
    redemptions
  });

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code: currentCode,
    ...newRedemption,
    timestamp: serverTimestamp()
  });

  await showRedemptionHistory(currentCode);
});

// Show Redemption History
async function showRedemptionHistory(code) {
  const history = document.getElementById("redemptionHistory");
  history.innerHTML = "";

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);
  const redemptions = codeSnap.data().redemptions || [];

  const validRedemptions = redemptions.filter(r => r.business === currentBusiness && !r.deleted);
  const deletedCount = redemptions.filter(r => r.business === currentBusiness && r.deleted).length;

  validRedemptions.forEach((r, index) => {
    const date = new Date(r.date).toLocaleString();
    const entry = document.createElement("li");
    entry.innerHTML = `Date: ${date} — Status: Redeemed 
      <button style="margin-left:10px; background:#dc3545; color:white; border:none; padding:2px 6px; cursor:pointer;"
        onclick="deleteRedemption('${code}', ${index})">Delete</button>`;
    history.appendChild(entry);
  });

  const redeemBtn = document.getElementById("redeemBtn");
  if (redemptionLimit !== "unlimited" && validRedemptions.length >= parseInt(redemptionLimit)) {
    redeemBtn.disabled = true;
  } else {
    redeemBtn.disabled = false;
  }
}

// Delete Redemption
window.deleteRedemption = async (code, index) => {
  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);
  const redemptions = codeSnap.data().redemptions || [];

  if (redemptions[index]) {
    redemptions[index].deleted = true;
    await updateDoc(codeRef, { redemptions });
    await showRedemptionHistory(code);
  }
};

// Reset dashboard for next customer
document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemStatus").innerHTML = "";
  document.getElementById("redemptionHistory").innerHTML = "";
  document.getElementById("redeemBtn").style.display = "none";
  document.getElementById("doneBtn").style.display = "none";
  document.getElementById("verifyBtn").style.display = "inline-block";
  document.getElementById("redemptionSection").style.display = "none";
});

});
