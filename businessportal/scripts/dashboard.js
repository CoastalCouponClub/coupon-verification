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
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Globals
let currentBusiness = null;
let businessUID = null;
let redemptionLimit = null;
let resetInterval = null;

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
    } else {
      document.getElementById("business-info").innerText = "Business account not found.";
    }
  } else {
    window.location.href = "login.html";
  }
});

// Helper to determine if reset interval has passed
function isRedemptionReset(redemptionDate, resetInterval) {
  const now = new Date();
  const last = new Date(redemptionDate);

  switch (resetInterval) {
    case "1 month":
      last.setMonth(last.getMonth() + 1);
      break;
    case "1 year":
      last.setFullYear(last.getFullYear() + 1);
      break;
    case "never":
    default:
      return false;
  }

  return now >= last;
}

// Verify Code
document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");
  status.innerText = "";
  history.innerHTML = "";
  document.getElementById("redeemBtn").disabled = true;

  if (!code) {
    status.innerText = "Please enter a code to verify.";
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists() || !codeSnap.data().isValid) {
    status.innerText = "Invalid or inactive code.";
    return;
  }

  const redemptions = codeSnap.data().redemptions || [];
  const redemptionsHere = redemptions.filter(r => r.business === currentBusiness);

  let recentCount = 0;
  let nextEligibleDate = null;

  for (const r of redemptionsHere) {
    if (!isRedemptionReset(r.date, resetInterval)) {
      recentCount++;
    } else {
      const lastDate = new Date(r.date);
      if (!nextEligibleDate || lastDate > nextEligibleDate) {
        nextEligibleDate = lastDate;
      }
    }
  }

  if (redemptionLimit !== "unlimited" && recentCount >= parseInt(redemptionLimit)) {
    const futureReset = new Date(nextEligibleDate);
    switch (resetInterval) {
      case "1 month":
        futureReset.setMonth(futureReset.getMonth() + 1);
        break;
      case "1 year":
        futureReset.setFullYear(futureReset.getFullYear() + 1);
        break;
    }

    status.innerText = `Redemption limit reached. Try again after: ${futureReset.toLocaleDateString()}`;
    return;
  }

  if (redemptionsHere.length > 0) {
    status.innerText = "Code is valid. Redemption history:";
    redemptionsHere.forEach(r => {
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
    status.innerText = "Code not found.";
    return;
  }

  const redemption = {
    business: currentBusiness,
    date: new Date().toISOString(),
    edited: false,
    notes: "",
    businessName: currentBusiness
  };

  const redemptions = codeSnap.data().redemptions || [];
  redemptions.push(redemption);

  await updateDoc(codeRef, {
    redemptions
  });

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    ...redemption,
    timestamp: serverTimestamp()
  });

  status.innerText = "Code redeemed successfully!";
  document.getElementById("redeemBtn").disabled = true;

  // Auto-refresh redemption log
  const history = document.getElementById("redemptionHistory");
  const item = document.createElement("li");
  item.innerText = `• ${redemption.date}`;
  history.appendChild(item);
});
