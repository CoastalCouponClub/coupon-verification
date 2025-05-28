import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
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
let verifiedCodeRef = null;
let verifiedRedemptions = [];

// Format
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

// Auth
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

// Verify
document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");
  const redeemBtn = document.getElementById("redeemBtn");
  const doneBtn = document.getElementById("doneBtn");

  status.innerText = "";
  history.innerHTML = "";
  redeemBtn.style.display = "none";
  doneBtn.style.display = "none";

  if (!code) {
    status.innerText = "Please enter a code to verify.";
    return;
  }

  verifiedCodeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(verifiedCodeRef);

  if (!codeSnap.exists() || !codeSnap.data().isValid) {
    status.innerText = "Code not found or inactive.";
    return;
  }

  const data = codeSnap.data();
  verifiedRedemptions = data.redemptions?.filter(r => r.business === currentBusiness && !r.deleted) || [];

  let limitReached = redemptionLimit !== "unlimited" && verifiedRedemptions.length >= parseInt(redemptionLimit);

  status.innerText = "Code is valid.";
  if (limitReached) {
    status.innerText += ` Redemption limit reached (${redemptionLimit}).`;
    redeemBtn.disabled = true;
  } else {
    redeemBtn.disabled = false;
  }

  redeemBtn.style.display = "inline-block";
  doneBtn.style.display = "inline-block";
  document.getElementById("verifyBtn").style.display = "none";
  document.getElementById("redemptionHistorySection").style.display = "block";

  renderRedemptionHistory();
});

// Render redemption history
function renderRedemptionHistory() {
  const history = document.getElementById("redemptionHistory");
  history.innerHTML = "";

  verifiedRedemptions.forEach((r, index) => {
    const item = document.createElement("li");
    item.innerText = `• ${formatDate(r.date)} Status: Redeemed`;

    const delBtn = document.createElement("button");
    delBtn.className = "delete-button";
    delBtn.innerText = "Delete";
    delBtn.onclick = async () => {
      r.deleted = true;
      verifiedRedemptions[index].deleted = true;

      const codeSnap = await getDoc(verifiedCodeRef);
      const allRedemptions = codeSnap.data().redemptions || [];
      allRedemptions[index].deleted = true;
      await updateDoc(verifiedCodeRef, { redemptions: allRedemptions });

      const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", document.getElementById("codeInput").value));
      const docs = await getDocs(q);
      docs.forEach(async d => {
        if (!d.data().deleted) {
          await updateDoc(d.ref, { deleted: true });
        }
      });

      renderRedemptionHistory();
      checkRedemptionLimit(); // recheck and re-enable redeem button if limit is now okay
    };

    item.appendChild(delBtn);
    history.appendChild(item);
  });
}

// Redeem
document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");

  if (!code || !currentBusiness) {
    status.innerText = "Missing code or business info.";
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

  const codeSnap = await getDoc(verifiedCodeRef);
  const existing = codeSnap.data().redemptions || [];
  existing.push(redemption);
  await updateDoc(verifiedCodeRef, { redemptions: existing });

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    ...redemption,
    timestamp: serverTimestamp()
  });

  verifiedRedemptions.push(redemption);
  renderRedemptionHistory();
  checkRedemptionLimit();

  status.innerText = "Redemption logged successfully!";
});

// Reset portal
document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemStatus").innerText = "";
  document.getElementById("redemptionHistory").innerHTML = "";
  document.getElementById("redemptionHistorySection").style.display = "none";

  document.getElementById("verifyBtn").style.display = "inline-block";
  document.getElementById("redeemBtn").style.display = "none";
  document.getElementById("redeemBtn").disabled = true;
  document.getElementById("doneBtn").style.display = "none";
});

// Helper to recheck redemption limit
function checkRedemptionLimit() {
  const redeemBtn = document.getElementById("redeemBtn");
  const status = document.getElementById("redeemStatus");

  const activeRedemptions = verifiedRedemptions.filter(r => !r.deleted);
  const limitReached = redemptionLimit !== "unlimited" && activeRedemptions.length >= parseInt(redemptionLimit);

  if (limitReached) {
    redeemBtn.disabled = true;
    status.innerText += ` Redemption limit reached (${redemptionLimit}).`;
  } else {
    redeemBtn.disabled = false;
  }
}
