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
let currentCode = null;

function formatDateMidnightPlusInterval(dateStr, interval) {
  const base = new Date(dateStr);
  base.setHours(0, 0, 0, 0);

  if (interval === "daily") base.setDate(base.getDate() + 1);
  else if (interval === "weekly") base.setDate(base.getDate() + 7);
  else if (interval === "monthly") base.setMonth(base.getMonth() + 1);

  return base;
}

function formatDateDisplay(dateStr) {
  return new Date(dateStr).toLocaleString("en-US", {
    dateStyle: "short",
    timeStyle: "short"
  });
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
  currentCode = code;

  if (!code) {
    status.innerText = "Please enter a code to verify.";
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists() || !codeSnap.data().isValid) {
    status.innerText = "Code not found or inactive.";
    return;
  }

  const data = codeSnap.data();
  const redemptions = data.redemptions || [];
  const usedAtThisBusiness = redemptions.filter(r => r.business === currentBusiness && !r.deleted);

  let validRedemptions = usedAtThisBusiness;

  if (resetInterval !== "none") {
    const sorted = [...usedAtThisBusiness].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sorted.length > 0) {
      const firstDate = sorted[0].date;
      const resetDate = formatDateMidnightPlusInterval(firstDate, resetInterval);
      validRedemptions = usedAtThisBusiness.filter(r => new Date(r.date) < resetDate);
    }
  }

  const limitReached = redemptionLimit !== "unlimited" && validRedemptions.length >= parseInt(redemptionLimit);

  if (limitReached) {
    status.innerText = "Code is valid. ❌ Redemption limit reached.";
    redeemBtn.style.display = "inline-block";
    redeemBtn.disabled = true;
  } else {
    status.innerText = "✅ Code is valid and can be redeemed.";
    redeemBtn.style.display = "inline-block";
    redeemBtn.disabled = false;
  }

  document.getElementById("verifyBtn").style.display = "none";
  document.getElementById("redemptionHistorySection").style.display = "block";
  doneBtn.style.display = "inline-block";

  usedAtThisBusiness.forEach(r => {
    if (r.deleted) return;

    const item = document.createElement("li");
    item.innerText = `• ${formatDateDisplay(r.date)} Status: Redeemed`;

    const delBtn = document.createElement("button");
    delBtn.className = "delete-button";
    delBtn.innerText = "Delete";
    delBtn.onclick = async () => {
      r.deleted = true;
      const updatedRedemptions = redemptions.map(entry => entry === r ? r : entry);
      await updateDoc(codeRef, { redemptions: updatedRedemptions });

      const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
      const docs = await getDocs(q);
      docs.forEach(async d => {
        await updateDoc(d.ref, { deleted: true });
      });

      item.remove();

      const remaining = updatedRedemptions.filter(r => r.business === currentBusiness && !r.deleted);
      let validRemaining = remaining;

      if (resetInterval !== "none" && remaining.length > 0) {
        const resetTime = formatDateMidnightPlusInterval(remaining[0].date, resetInterval);
        validRemaining = remaining.filter(r => new Date(r.date) < resetTime);
      }

      if (validRemaining.length < parseInt(redemptionLimit)) {
        redeemBtn.disabled = false;
        status.innerText = "✅ Code is valid and can be redeemed.";
      }
    };

    item.appendChild(delBtn);
    history.appendChild(item);
  });
});

document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = currentCode;
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
    timestamp: serverTimestamp()
  });

  const item = document.createElement("li");
  item.innerText = `• ${formatDateDisplay(redemption.date)} Status: Redeemed`;

  const delBtn = document.createElement("button");
  delBtn.className = "delete-button";
  delBtn.innerText = "Delete";
  delBtn.onclick = async () => {
    redemption.deleted = true;
    const updated = existing.map(e => e === redemption ? redemption : e);
    await updateDoc(codeRef, { redemptions: updated });

    const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
    const docs = await getDocs(q);
    docs.forEach(async d => {
      await updateDoc(d.ref, { deleted: true });
    });

    item.remove();

    const remaining = updated.filter(r => r.business === currentBusiness && !r.deleted);
    let validRemaining = remaining;

    if (resetInterval !== "none" && remaining.length > 0) {
      const resetTime = formatDateMidnightPlusInterval(remaining[0].date, resetInterval);
      validRemaining = remaining.filter(r => new Date(r.date) < resetTime);
    }

    if (validRemaining.length < parseInt(redemptionLimit)) {
      document.getElementById("redeemBtn").disabled = false;
      status.innerText = "✅ Code is valid and can be redeemed.";
    }
  };

  item.appendChild(delBtn);
  history.appendChild(item);

  // Re-check limit
  const validRedemptions = existing.filter(r => r.business === currentBusiness && !r.deleted);
  let limitReached = false;

  if (resetInterval !== "none" && validRedemptions.length > 0) {
    const resetTime = formatDateMidnightPlusInterval(validRedemptions[0].date, resetInterval);
    const count = validRedemptions.filter(r => new Date(r.date) < resetTime).length;
    limitReached = count >= parseInt(redemptionLimit);
  } else {
    limitReached = validRedemptions.length >= parseInt(redemptionLimit);
  }

  if (limitReached) {
    status.innerText = "✅ Redemption logged successfully. ❌ Redemption limit reached.";
    document.getElementById("redeemBtn").disabled = true;
  } else {
    status.innerText = "✅ Redemption logged successfully!";
    document.getElementById("redeemBtn").disabled = true;
  }
});

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
