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
  deleteDoc,
  serverTimestamp
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

const codeInput = document.getElementById("codeInput");
const verifyBtn = document.getElementById("verifyBtn");
const redeemBtn = document.getElementById("redeemBtn");
const doneBtn = document.getElementById("doneBtn");
const status = document.getElementById("redeemStatus");
const historySection = document.getElementById("redemptionHistorySection");
const historyList = document.getElementById("redemptionHistory");
const analytics = document.getElementById("analytics");

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

function generateCSV(data) {
  const headers = ["Code", "Date", "Business", "Notes", "Edited"];
  const rows = data.map(r => [
    r.code,
    new Date(r.date).toLocaleString(),
    r.business,
    r.notes || "",
    r.edited ? "Yes" : "No"
  ]);
  return [headers, ...rows].map(e => e.join(",")).join("\n");
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
  if (!interval || interval === "none") return null;
  const date = new Date(startDate);
  date.setHours(0, 0, 0, 0);

  if (["monthly", "1 month"].includes(interval)) return addMonths(date, 1);
  if (["weekly", "1 week"].includes(interval)) return addDays(date, 7);
  if (["daily", "1 day"].includes(interval)) return addDays(date, 1);
  return null;
}

async function uploadCSVFile(fileContent, filename) {
  const storage = getStorage(app);
  const fileRef = storageRef(storage, `exports/${filename}`);
  const blob = new Blob([fileContent], { type: 'text/csv' });

  await uploadBytes(fileRef, blob);
  return await getDownloadURL(fileRef);
}

async function loadHistory(code) {
  historyList.innerHTML = "";
  const snap = await getDocs(collection(db, `businessAccounts/${businessUID}/redemptions`));
  const entries = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (!data.deleted && data.code === code) {
      entries.push({ id: doc.id, ...data });
    }
  });
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  entries.forEach(entry => {
    const li = document.createElement("li");
    li.innerText = `${formatDate(entry.date)} — ${entry.code}`;
    const del = document.createElement("button");
    del.innerText = "Delete";
    del.className = "delete-button";
    del.onclick = async () => {
      await updateDoc(doc(db, `businessAccounts/${businessUID}/redemptions`, entry.id), {
        deleted: true,
        edited: true
      });
      await verifyCode(); // re-check status after deletion
    };
    li.appendChild(del);
    historyList.appendChild(li);
  });
  historySection.style.display = entries.length ? "block" : "none";
}

async function verifyCode() {
  const code = codeInput.value.trim();
  if (!code || !currentBusiness) return;

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) {
    status.innerText = "❌ Invalid code.";
    return;
  }

  const verifiedData = codeSnap.data();
  const validRedemptions = (verifiedData.redemptions || []).filter(r => r.business === currentBusiness && !r.deleted);
  const inWindowRedemptions = [...validRedemptions];

  if (resetInterval && resetInterval !== "none" && validRedemptions.length > 0) {
    const sorted = validRedemptions.sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastDate = new Date(sorted[0].date);
    const resetDate = calculateResetDate(lastDate, resetInterval);
    const now = new Date();
    if (now >= resetDate) {
      inWindowRedemptions.length = 0;
    }
  }

  const limitReached = redemptionLimit !== "unlimited" &&
    inWindowRedemptions.length >= parseInt(redemptionLimit);

  if (limitReached) {
    let msg = `Code is valid. Redemption limit reached (${redemptionLimit}).`;
    if (validRedemptions.length > 0) {
      const resetDate = calculateResetDate(validRedemptions[0].date, resetInterval);
      msg += ` Try again after: ${resetDate.toLocaleDateString()}`;
    }
    status.innerText = msg;
    redeemBtn.disabled = true;
  } else {
    status.innerText = "✅ Code is valid. Ready to redeem.";
    redeemBtn.disabled = false;
  }

  redeemBtn.style.display = "inline-block";
  doneBtn.style.display = "inline-block";
  verifyBtn.style.display = "none";

  await loadHistory(code);
}

async function redeemCode() {
  const code = codeInput.value.trim();
  if (!code || !currentBusiness) return;

  const redemptionData = {
    code,
    date: new Date().toISOString(),
    business: currentBusiness,
    notes: "",
    edited: false,
    deleted: false
  };

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), redemptionData);

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) {
    await setDoc(codeRef, { redemptions: [redemptionData] });
  } else {
    const prev = codeSnap.data();
    const redemptions = [...(prev.redemptions || []), redemptionData];
    await updateDoc(codeRef, { redemptions });
  }

  status.innerText = "🎉 Code redeemed successfully!";
  redeemBtn.disabled = true;

  await verifyCode(); // Trigger re-check after redeem
}

function resetUI() {
  codeInput.value = "";
  status.innerText = "";
  verifyBtn.style.display = "inline-block";
  redeemBtn.style.display = "none";
  doneBtn.style.display = "none";
  historySection.style.display = "none";
  historyList.innerHTML = "";
}

verifyBtn.addEventListener("click", verifyCode);
redeemBtn.addEventListener("click", redeemCode);
doneBtn.addEventListener("click", resetUI);

document.getElementById("exportBtn").addEventListener("click", async () => {
  const snap = await getDocs(collection(db, `businessAccounts/${businessUID}/redemptions`));
  const redemptions = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) redemptions.push(data);
  });

  redemptions.sort((a, b) => new Date(a.date) - new Date(b.date));
  const csv = generateCSV(redemptions);
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
      console.error("Email send failed:", err);
      alert("❌ Failed to send email.");
    });
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.businessEmail = user.email;
    const docRef = doc(db, "businessAccounts", user.uid);
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
      businessUID = user.uid;
      redemptionLimit = data.redemptionLimit;
      resetInterval = data.resetInterval;
      analytics.style.display = "block";
    }
  } else {
    window.location.href = "login.html";
  }
});
