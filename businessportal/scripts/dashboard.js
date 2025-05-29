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

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBJxxcGhuYspiZ9HRAlZgihgXLaA2FjPXc",
  authDomain: "coastalcouponverifier.firebaseapp.com",
  projectId: "coastalcouponverifier",
  storageBucket: "coastalcouponclub-exports",
  messagingSenderId: "189807704712",
  appId: "1:189807704712:web:9427e68464115f388ebd3d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app, "gs://coastalcouponclub-exports");

let currentBusiness = null;
let businessUID = null;
let redemptionLimit = null;
let resetInterval = null;

function formatDate(date) {
  try {
    const d = new Date(date);
    return isNaN(d) ? "Invalid Date" : d.toLocaleString();
  } catch {
    return "Invalid Date";
  }
}

function addInterval(date, interval) {
  const d = new Date(date);
  if (interval === "daily") d.setDate(d.getDate() + 1);
  if (interval === "weekly") d.setDate(d.getDate() + 7);
  if (interval === "monthly") d.setMonth(d.getMonth() + 1);
  return d;
}

function generateCSV(data) {
  const headers = ["Code", "Date", "Business", "Notes", "Edited"];
  const rows = data.map(r => [
    r.code,
    formatDate(r.date),
    r.business,
    r.notes || "",
    r.edited ? "Yes" : "No"
  ]);
  return [headers, ...rows].map(e => e.join(",")).join("\n");
}

async function uploadCSVFile(fileContent, filename) {
  const fileRef = storageRef(storage, `exports/${filename}`);
  const blob = new Blob([fileContent], { type: 'text/csv' });
  await uploadBytes(fileRef, blob);
  return await getDownloadURL(fileRef);
}

function updateAnalyticsSection(redemptions) {
  const uniqueCodes = new Set(redemptions.map(r => r.code));
  const sorted = redemptions.sort((a, b) => new Date(a.date) - new Date(b.date));

  document.getElementById("verifiedCount").innerText = uniqueCodes.size;
  document.getElementById("redemptionCount").innerText = redemptions.length;
  document.getElementById("firstRedemption").innerText = redemptions.length ? formatDate(sorted[0].date) : "N/A";
  document.getElementById("latestRedemption").innerText = redemptions.length ? formatDate(sorted[sorted.length - 1].date) : "N/A";
}

async function refreshRedemptionHistory() {
  const snapshot = await getDocs(collection(db, `businessAccounts/${businessUID}/redemptions`));
  const history = document.getElementById("redemptionHistory");
  history.innerHTML = "";

  const redemptions = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) redemptions.push({ id: doc.id, ...data });
  });

  updateAnalyticsSection(redemptions);

  redemptions.forEach(entry => {
    const li = document.createElement("li");
    li.textContent = `${entry.code} — ${formatDate(entry.date)}`;
    const btn = document.createElement("button");
    btn.className = "delete-button";
    btn.textContent = "Delete";
    btn.onclick = async () => {
      await deleteDoc(doc(db, `businessAccounts/${businessUID}/redemptions/${entry.id}`));
      refreshRedemptionHistory();
    };
    li.appendChild(btn);
    history.appendChild(li);
  });
}

function resetDashboard() {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemBtn").style.display = "none";
  document.getElementById("doneBtn").style.display = "none";
  document.getElementById("verifyBtn").style.display = "inline-block";
  document.getElementById("redeemStatus").innerText = "";
  document.getElementById("redemptionHistorySection").style.display = "none";
}

onAuthStateChanged(auth, async user => {
  if (!user) return window.location.href = "login.html";

  const uid = user.uid;
  window.businessEmail = user.email;
  const snap = await getDoc(doc(db, "businessAccounts", uid));
  if (!snap.exists()) return;

  const data = snap.data();
  currentBusiness = data.businessName;
  businessUID = uid;
  redemptionLimit = data.redemptionLimit;
  resetInterval = data.resetInterval;

  document.getElementById("business-info").innerHTML = `
    <p><strong>Business Name:</strong> ${data.businessName}</p>
    <p><strong>Coupon Offer:</strong> ${data.couponOffer}</p>
    <p><strong>Redemption Limit:</strong> ${data.redemptionLimit}</p>
    <p><strong>Reset Interval:</strong> ${data.resetInterval}</p>
  `;

  refreshRedemptionHistory();
  document.getElementById("analytics").style.display = "block";
});

document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  if (!code) return alert("Please enter a code.");

  const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
  const snap = await getDocs(q);
  const redemptions = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) redemptions.push(data);
  });

  const now = new Date();
  const valid = redemptions.filter(r => {
    if (!resetInterval) return true;
    const rDate = new Date(r.date);
    const resetDate = addInterval(rDate, resetInterval);
    return now < resetDate;
  });

  const status = document.getElementById("redeemStatus");
  const redeemBtn = document.getElementById("redeemBtn");
  const doneBtn = document.getElementById("doneBtn");

  if (redemptionLimit && valid.length >= redemptionLimit) {
    const last = redemptions[redemptions.length - 1];
    const nextReset = addInterval(new Date(last.date), resetInterval);
    status.innerText = `❌ Redemption limit reached. Try again after ${formatDate(nextReset)}`;
    redeemBtn.disabled = true;
  } else {
    status.innerText = `✅ Code verified and ready to redeem.`;
    redeemBtn.disabled = false;
  }

  document.getElementById("redemptionHistorySection").style.display = "block";
  redeemBtn.style.display = "inline-block";
  doneBtn.style.display = "inline-block";
  document.getElementById("verifyBtn").style.display = "none";
});

document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  if (!code) return;

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    business: currentBusiness,
    date: new Date().toISOString(),
    edited: false,
    deleted: false,
    notes: ""
  });

  const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
  const snap = await getDocs(q);
  const redemptions = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) redemptions.push(data);
  });

  const valid = redemptions.filter(r => {
    if (!resetInterval) return true;
    const rDate = new Date(r.date);
    const resetDate = addInterval(rDate, resetInterval);
    return new Date() < resetDate;
  });

  const status = document.getElementById("redeemStatus");
  status.innerText = "✅ Code redeemed successfully!";

  if (redemptionLimit && valid.length >= redemptionLimit) {
    const last = redemptions[redemptions.length - 1];
    const nextReset = addInterval(new Date(last.date), resetInterval);
    status.innerText += `\n❌ Redemption limit reached. Try again after ${formatDate(nextReset)}`;
    document.getElementById("redeemBtn").disabled = true;
  }

  refreshRedemptionHistory();
});

document.getElementById("doneBtn").addEventListener("click", resetDashboard);

document.getElementById("exportBtn").addEventListener("click", async () => {
  const snap = await getDocs(collection(db, `businessAccounts/${businessUID}/redemptions`));
  const data = [];
  snap.forEach(doc => {
    const r = doc.data();
    if (!r.deleted) data.push(r);
  });

  const csv = generateCSV(data);
  const fileUrl = await uploadCSVFile(csv, `${currentBusiness}_redemptions.csv`);

  const templateParams = {
    businessName: currentBusiness,
    verifiedCount: new Set(data.map(r => r.code)).size,
    redemptionCount: data.length,
    firstRedemption: data.length ? formatDate(data[0].date) : "N/A",
    latestRedemption: data.length ? formatDate(data[data.length - 1].date) : "N/A",
    fileUrl,
    to_email: window.businessEmail
  };

  window.emailjs.send("service_zn4nuce", "template_2zb6jgh", templateParams)
    .then(() => alert("✅ Export sent to your email!"))
    .catch(err => {
      console.error("Email send failed:", err);
      alert("❌ Failed to send email.");
    });
});
