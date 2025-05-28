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

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

function getResetDate(startDate, interval) {
  const date = new Date(startDate);
  if (interval === "1 month") date.setMonth(date.getMonth() + 1);
  else if (interval === "1 year") date.setFullYear(date.getFullYear() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

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

document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");
  const redeemBtn = document.getElementById("redeemBtn");
  const doneBtn = document.getElementById("doneBtn");

  status.innerText = "";
  history.innerHTML = "";
  redeemBtn.style.display = "none";
  redeemBtn.disabled = false;
  doneBtn.style.display = "none";

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists() || !codeSnap.data().isValid) {
    status.innerText = "Code not found or inactive.";
    return;
  }

  const data = codeSnap.data();
  const redemptions = data.redemptions || [];
  const usedAtThisBusiness = redemptions.filter(r => r.business === currentBusiness && !r.deleted);

  const now = new Date();
  let validRedemptions = [...usedAtThisBusiness];

  if (resetInterval !== "never") {
    const sorted = [...usedAtThisBusiness].sort((a, b) => new Date(a.date) - new Date(b.date));
    const earliest = sorted[0] ? new Date(sorted[0].date) : now;
    const resetDate = getResetDate(earliest, resetInterval);

    validRedemptions = usedAtThisBusiness.filter(r => new Date(r.date) >= resetDate);
  }

  const limitReached = redemptionLimit !== "unlimited" && validRedemptions.length >= parseInt(redemptionLimit);

  status.innerText = "✅ Code is valid.";

  if (limitReached) {
    let retryDate = "the next eligible date";
    if (resetInterval !== "never") {
      const sorted = [...usedAtThisBusiness].sort((a, b) => new Date(a.date) - new Date(b.date));
      const earliest = sorted[0] ? new Date(sorted[0].date) : now;
      retryDate = getResetDate(earliest, resetInterval).toLocaleString();
    }
    status.innerText += ` Redemption limit reached. Try again after ${retryDate}.`;
    redeemBtn.disabled = true;
  } else {
    redeemBtn.style.display = "inline-block";
    redeemBtn.disabled = false;
  }

  document.getElementById("verifyBtn").style.display = "none";
  document.getElementById("redemptionHistorySection").style.display = "block";
  doneBtn.style.display = "inline-block";

  usedAtThisBusiness.forEach(r => {
    const item = document.createElement("li");
    item.innerText = `• ${formatDate(r.date)} Status: Redeemed`;

    const delBtn = document.createElement("button");
    delBtn.className = "delete-button";
    delBtn.innerText = "Delete";

    delBtn.onclick = async () => {
      r.deleted = true;
      const updated = redemptions.map(entry => entry === r ? r : entry);
      await updateDoc(codeRef, { redemptions: updated });

      const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
      const docs = await getDocs(q);
      docs.forEach(async d => await updateDoc(d.ref, { deleted: true }));

      item.remove();

      const newValid = updated.filter(r => r.business === currentBusiness && !r.deleted &&
        (resetInterval === "never" || new Date(r.date) >= getResetDate(new Date(r.date), resetInterval)));

      if (redemptionLimit === "unlimited" || newValid.length < parseInt(redemptionLimit)) {
        redeemBtn.disabled = false;
        status.innerText = "✅ Code is valid and can be redeemed.";
      }
    };

    item.appendChild(delBtn);
    history.appendChild(item);
  });
});

document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

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
    timestamp: serverTimestamp()
  });

  status.innerText = "✅ Redemption logged successfully!";
  status.style.color = "green";
  status.style.fontWeight = "bold";

  const item = document.createElement("li");
  item.innerText = `• ${formatDate(redemption.date)} Status: Redeemed`;

  const delBtn = document.createElement("button");
  delBtn.className = "delete-button";
  delBtn.innerText = "Delete";

  delBtn.onclick = async () => {
    redemption.deleted = true;
    const updated = existing.map(entry => entry === redemption ? redemption : entry);
    await updateDoc(codeRef, { redemptions: updated });

    const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
    const docs = await getDocs(q);
    docs.forEach(async d => await updateDoc(d.ref, { deleted: true }));

    item.remove();

    const remaining = updated.filter(r => r.business === currentBusiness && !r.deleted);
    if (redemptionLimit === "unlimited" || remaining.length < parseInt(redemptionLimit)) {
      document.getElementById("redeemBtn").disabled = false;
      status.innerText = "✅ Code is valid and can be redeemed.";
    }
  };

  item.appendChild(delBtn);
  history.appendChild(item);

  const validAfter = getResetDate(new Date(redemption.date), resetInterval).toLocaleString();
  status.innerText += ` Redemption limit reached. Try again after ${validAfter}.`;

  document.getElementById("redeemBtn").disabled = true;
});

document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemStatus").innerText = "";
  document.getElementById("redeemStatus").style.color = "";
  document.getElementById("redeemStatus").style.fontWeight = "";
  document.getElementById("redemptionHistory").innerHTML = "";
  document.getElementById("redemptionHistorySection").style.display = "none";

  document.getElementById("verifyBtn").style.display = "inline-block";
  document.getElementById("redeemBtn").style.display = "none";
  document.getElementById("redeemBtn").disabled = true;
  document.getElementById("doneBtn").style.display = "none";
});
