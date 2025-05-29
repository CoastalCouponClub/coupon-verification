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
let verifiedCode = null;

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

function showRedemptionHistory(logs) {
  const list = document.getElementById("redemptionHistory");
  list.innerHTML = "";
  logs.forEach((entry, i) => {
    const item = document.createElement("li");
    item.textContent = `${entry.code} - ${formatDate(entry.date)} - ${entry.business}`;
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.className = "delete-button";
    del.onclick = async () => {
      await deleteDoc(entry._docRef);
      logs.splice(i, 1);
      showRedemptionHistory(logs);
    };
    item.appendChild(del);
    list.appendChild(item);
  });
  document.getElementById("redemptionHistorySection").style.display = "block";
}

async function fetchRedemptionHistory(code) {
  const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
  const snap = await getDocs(q);
  const logs = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) {
      data._docRef = doc.ref;
      logs.push(data);
    }
  });
  return logs;
}

// Auth
onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.businessEmail = user.email;
    const uid = user.uid;
    businessUID = uid;
    const docRef = doc(db, "businessAccounts", uid);
    const businessSnap = await getDoc(docRef);
    if (businessSnap.exists()) {
      const data = businessSnap.data();
      currentBusiness = data.businessName;
      redemptionLimit = data.redemptionLimit;
      resetInterval = data.resetInterval;
      document.getElementById("business-info").innerHTML = `
        <p><strong>Business Name:</strong> ${data.businessName}</p>
        <p><strong>Coupon Offer:</strong> ${data.couponOffer}</p>
        <p><strong>Redemption Limit:</strong> ${data.redemptionLimit}</p>
        <p><strong>Reset Interval:</strong> ${data.resetInterval}</p>
      `;
    } else {
      document.getElementById("business-info").innerText = "Business account not found.";
    }
  } else {
    window.location.href = "login.html";
  }
});

// Verify Button
document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  if (!code) return (status.innerText = "Please enter a code.");
  verifiedCode = code;

  const logs = await fetchRedemptionHistory(code);
  showRedemptionHistory(logs);

  status.innerText = "Code is valid.";
  document.getElementById("redeemBtn").style.display = "inline-block";
  document.getElementById("doneBtn").style.display = "inline-block";
  document.getElementById("verifyBtn").style.display = "none";
});

// Redeem Button
document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = verifiedCode;
  const status = document.getElementById("redeemStatus");

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    business: currentBusiness,
    date: new Date().toISOString(),
    notes: "",
    edited: false,
    deleted: false,
  });

  status.innerText = "✅ Code redeemed successfully!";
  const updatedLogs = await fetchRedemptionHistory(code);
  showRedemptionHistory(updatedLogs);
});

// Done Button
document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemStatus").innerText = "";
  document.getElementById("redeemBtn").style.display = "none";
  document.getElementById("verifyBtn").style.display = "inline-block";
  document.getElementById("doneBtn").style.display = "none";
  document.getElementById("redemptionHistorySection").style.display = "none";
  verifiedCode = null;
});

// Export Button
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
      console.error("Email failed:", err);
      alert("❌ Failed to send email.");
    });
});
