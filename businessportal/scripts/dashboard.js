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
  serverTimestamp,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBJxxcGhuYspiZ9HRAlZgihgXLaA2FjPXc",
  authDomain: "coastalcouponverifier.firebaseapp.com",
  projectId: "coastalcouponverifier",
  storageBucket: "coastalcouponverifier.appspot.com",
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
let lastVerifiedCode = null;

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  result.setHours(0, 0, 0, 0);
  return result;
}

function calculateResetDate(startDate, interval) {
  const date = new Date(startDate);
  if (["monthly", "1 month"].includes(interval)) return addMonths(date, 1);
  if (["weekly", "1 week"].includes(interval)) return addDays(date, 7);
  if (["daily", "1 day"].includes(interval)) return addDays(date, 1);
  return null;
}

function showRedemptionHistory(redemptions) {
  const historyList = document.getElementById("redemptionHistory");
  historyList.innerHTML = "";
  redemptions.forEach((r, index) => {
    const li = document.createElement("li");
    li.textContent = `${r.code} — ${formatDate(r.date)} ${r.edited ? '(edited)' : ''}`;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "delete-button";
    deleteBtn.onclick = async () => {
      await deleteDoc(doc(db, `businessAccounts/${businessUID}/redemptions`, r.id));
      verifyCode(lastVerifiedCode); // Refresh
    };

    li.appendChild(deleteBtn);
    historyList.appendChild(li);
  });

  document.getElementById("redemptionHistorySection").style.display = "block";
}

async function verifyCode(code) {
  if (!code) return;

  const status = document.getElementById("redeemStatus");
  const redeemBtn = document.getElementById("redeemBtn");
  const verifyBtn = document.getElementById("verifyBtn");
  const doneBtn = document.getElementById("doneBtn");

  status.innerText = "Checking...";
  lastVerifiedCode = code;

  const codeDoc = await getDoc(doc(db, "verifiedCodes", code));
  if (!codeDoc.exists()) {
    status.innerText = "❌ Invalid code.";
    redeemBtn.style.display = "none";
    return;
  }

  const redemptionsRef = collection(db, `businessAccounts/${businessUID}/redemptions`);
  const snapshot = await getDocs(query(redemptionsRef, where("code", "==", code)));

  const redemptions = [];
  const validRedemptions = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const r = { ...data, id: docSnap.id };
    redemptions.push(r);
    if (!r.deleted) validRedemptions.push(r);
  });

  const inWindowRedemptions = validRedemptions.filter(r => {
    const date = new Date(r.date);
    const now = new Date();
    const reset = calculateResetDate(date, resetInterval);
    return !reset || now < reset;
  });

  const limitReached = redemptionLimit !== "unlimited" &&
    inWindowRedemptions.length >= parseInt(redemptionLimit);

  if (limitReached) {
    const latest = validRedemptions[validRedemptions.length - 1];
    const resetDate = latest ? calculateResetDate(new Date(latest.date), resetInterval) : null;
    let message = `✅ Code is valid. Redemption limit reached (${redemptionLimit}).`;
    if (resetDate) {
      message += ` Try again after: ${resetDate.toLocaleDateString('en-US', { dateStyle: 'long' })}`;
    }
    status.innerText = message;
    redeemBtn.disabled = true;
  } else {
    status.innerText = "✅ Code is valid.";
    redeemBtn.disabled = false;
  }

  redeemBtn.style.display = "inline-block";
  verifyBtn.style.display = "none";
  doneBtn.style.display = "inline-block";

  showRedemptionHistory(redemptions);
}

document.getElementById("verifyBtn").addEventListener("click", () => {
  const code = document.getElementById("codeInput").value.trim();
  verifyCode(code);
});

document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = lastVerifiedCode;
  const status = document.getElementById("redeemStatus");

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    date: new Date().toISOString(),
    business: currentBusiness,
    edited: false,
    deleted: false,
    notes: ""
  });

  status.innerText = "✅ Code redeemed successfully.";
  verifyCode(code); // Refresh UI and check if limit is now triggered
});

document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemStatus").innerText = "";
  document.getElementById("redeemBtn").style.display = "none";
  document.getElementById("verifyBtn").style.display = "inline-block";
  document.getElementById("doneBtn").style.display = "none";
  document.getElementById("redemptionHistorySection").style.display = "none";
});

// Auth and load business
onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.businessEmail = user.email;
    const uid = user.uid;
    const docRef = doc(db, "businessAccounts", uid);
    const businessSnap = await getDoc(docRef);

    if (businessSnap.exists()) {
      const data = businessSnap.data();
      currentBusiness = data.businessName;
      businessUID = uid;
      redemptionLimit = data.redemptionLimit;
      resetInterval = data.resetInterval;

      document.getElementById("business-info").innerHTML = `
        <p><strong>Business Name:</strong> ${currentBusiness}</p>
        <p><strong>Coupon Offer:</strong> ${data.couponOffer}</p>
        <p><strong>Redemption Limit:</strong> ${redemptionLimit}</p>
        <p><strong>Reset Interval:</strong> ${resetInterval}</p>
      `;
    } else {
      document.getElementById("business-info").innerText = "Business account not found.";
    }
  } else {
    window.location.href = "login.html";
  }
});

// Email export logic (kept for reference)
document.getElementById("exportBtn").addEventListener("click", async () => {
  const redemptionsSnapshot = await getDocs(
    query(collection(db, `businessAccounts/${businessUID}/redemptions`))
  );

  const redemptions = [];
  redemptionsSnapshot.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) redemptions.push(data);
  });

  redemptions.sort((a, b) => new Date(a.date) - new Date(b.date));
  const csv = ["Code,Date,Business,Notes,Edited", ...redemptions.map(r =>
    [r.code, formatDate(r.date), r.business, r.notes || "", r.edited ? "Yes" : "No"].join(",")
  )].join("\n");

  const fileUrl = await uploadCSVFile(csv, `${currentBusiness}_redemptions.csv`);

  const templateParams = {
    businessName: currentBusiness,
    verifiedCount: new Set(redemptions.map(r => r.code)).size,
    redemptionCount: redemptions.length,
    firstRedemption: redemptions.length ? formatDate(redemptions[0].date) : "N/A",
    latestRedemption: redemptions.length ? formatDate(redemptions[redemptions.length - 1].date) : "N/A",
    fileUrl,
    to_email: window.businessEmail
  };

  emailjs.send("service_zn4nuce", "template_2zb6jgh", templateParams)
    .then(() => alert("✅ Export sent to your email!"))
    .catch(err => {
      console.error("Email failed:", err);
      alert("❌ Failed to send email.");
    });
});
