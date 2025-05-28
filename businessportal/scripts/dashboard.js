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
  query,
  where,
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
let lastVerifiedCode = null;

// Helper: format date
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

// Auth check
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

// Verify Code
document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");

  status.innerText = "";
  history.innerHTML = "";
  lastVerifiedCode = null;

  if (!code) {
    status.innerText = "Please enter a code to verify.";
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists() || codeSnap.data().isValid === false) {
    status.innerText = "Invalid or inactive code.";
    return;
  }

  const redemptions = codeSnap.data().redemptions?.filter(r => !r.deleted && r.business === currentBusiness) || [];

  let limitReached = false;
  if (redemptionLimit !== "unlimited" && redemptions.length >= parseInt(redemptionLimit)) {
    status.innerText = `✅ Code is valid.\n⚠️ Redemption limit reached (${redemptionLimit}).`;
    limitReached = true;
  } else {
    status.innerText = "✅ Code is valid.";
  }

  redemptions.forEach(r => {
    const item = document.createElement("li");
    item.innerText = `• ${formatDate(r.date)} Status: Redeemed`;
    history.appendChild(item);
  });

  lastVerifiedCode = code;

  // Show redeem + done, hide verify
  document.getElementById("redeemBtn").style.display = limitReached ? "none" : "inline-block";
  document.getElementById("verifyBtn").style.display = "none";
  document.getElementById("doneBtn").style.display = "inline-block";
  document.getElementById("editSection").style.display = "block";
});

// Redeem Code
document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = lastVerifiedCode;
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");

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
    businessName: currentBusiness,
    deleted: false
  };

  const existing = codeSnap.data().redemptions || [];
  existing.push(redemption);

  await updateDoc(codeRef, { redemptions: existing });

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    ...redemption,
    timestamp: serverTimestamp(),
    deleted: false
  });

  status.innerText = "Redemption logged successfully!";
  document.getElementById("redeemBtn").style.display = "none";

  // ✅ Add to UI immediately
  const item = document.createElement("li");
  item.innerText = `• ${formatDate(redemption.date)} Status: Redeemed`;

  const delBtn = document.createElement("button");
  delBtn.className = "delete-button";
  delBtn.innerText = "Delete";
  delBtn.style.marginLeft = "10px";
  delBtn.style.padding = "2px 8px";
  delBtn.style.backgroundColor = "#ff4d4d";
  delBtn.style.color = "#fff";
  delBtn.style.border = "none";
  delBtn.style.borderRadius = "4px";
  delBtn.style.cursor = "pointer";

  delBtn.onclick = async () => {
    redemption.deleted = true;
    const updated = existing.map(r => r === redemption ? redemption : r);
    await updateDoc(codeRef, { redemptions: updated });

    const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
    const docs = await getDocs(q);
    docs.forEach(async d => await updateDoc(d.ref, { deleted: true }));

    item.remove();
  };

  item.appendChild(delBtn);
  history.appendChild(item);
});

// Done button resets the form
document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemStatus").innerText = "";
  document.getElementById("redemptionHistory").innerHTML = "";
  document.getElementById("verifyBtn").style.display = "inline-block";
  document.getElementById("redeemBtn").style.display = "none";
  document.getElementById("doneBtn").style.display = "none";
  document.getElementById("editSection").style.display = "none";
  lastVerifiedCode = null;
});
