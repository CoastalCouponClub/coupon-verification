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

function getResetDate(firstDateStr, interval) {
  const firstDate = new Date(firstDateStr);
  let resetDate = new Date(firstDate);
  resetDate.setHours(0, 0, 0, 0);

  switch (interval) {
    case 'daily':
      resetDate.setDate(resetDate.getDate() + 1);
      break;
    case 'weekly':
      resetDate.setDate(resetDate.getDate() + 7);
      break;
    case 'monthly':
      resetDate.setMonth(resetDate.getMonth() + 1);
      break;
    case 'none':
    default:
      return null;
  }

  return resetDate;
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

  let redemptionLimitReached = false;
  if (resetInterval === "none") {
    redemptionLimitReached = redemptionLimit !== "unlimited" && usedAtThisBusiness.length >= parseInt(redemptionLimit);
  } else if (usedAtThisBusiness.length > 0) {
    const firstDate = usedAtThisBusiness[0].date;
    const resetDate = getResetDate(firstDate, resetInterval);
    const now = new Date();
    if (resetDate && now < resetDate) {
      redemptionLimitReached = redemptionLimit !== "unlimited" && usedAtThisBusiness.length >= parseInt(redemptionLimit);
      if (redemptionLimitReached) {
        status.innerText = `Code is valid. Redemption limit reached. Try again on ${formatDate(resetDate.toISOString())}.`;
      }
    } else {
      redemptionLimitReached = false;
    }
  }

  if (!redemptionLimitReached) {
    status.innerText = "✅ Code is valid and can be redeemed.";
    redeemBtn.style.display = "inline-block";
    redeemBtn.disabled = false;
  } else {
    redeemBtn.style.display = "inline-block";
    redeemBtn.disabled = true;
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
      const updatedRedemptions = redemptions.map(entry => entry === r ? r : entry);
      await updateDoc(codeRef, { redemptions: updatedRedemptions });

      const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
      const docs = await getDocs(q);
      docs.forEach(async d => {
        await updateDoc(d.ref, { deleted: true });
      });

      item.remove();

      const remaining = updatedRedemptions.filter(r => r.business === currentBusiness && !r.deleted);
      const limit = redemptionLimit !== "unlimited" && remaining.length >= parseInt(redemptionLimit);

      if (!limit) {
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
    const updatedRedemptions = existing.map(entry => entry === redemption ? redemption : entry);
    await updateDoc(codeRef, { redemptions: updatedRedemptions });

    const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
    const docs = await getDocs(q);
    docs.forEach(async d => {
      await updateDoc(d.ref, { deleted: true });
    });

    item.remove();

    const remaining = updatedRedemptions.filter(r => r.business === currentBusiness && !r.deleted);
    const limit = redemptionLimit !== "unlimited" && remaining.length >= parseInt(redemptionLimit);

    if (!limit) {
      document.getElementById("redeemBtn").disabled = false;
      status.innerText = "✅ Code is valid and can be redeemed.";
    }
  };

  item.appendChild(delBtn);
  history.appendChild(item);

  document.getElementById("redeemBtn").disabled = true;

  // Show limit reached if applicable
  const validRedemptions = existing.filter(r => r.business === currentBusiness && !r.deleted);
  const limitReached = redemptionLimit !== "unlimited" && validRedemptions.length >= parseInt(redemptionLimit);

  if (limitReached && resetInterval !== "none") {
    const resetDate = getResetDate(validRedemptions[0].date, resetInterval);
    if (resetDate) {
      status.innerText += ` Redemption limit reached. Try again on ${formatDate(resetDate.toISOString())}.`;
    }
  }
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
