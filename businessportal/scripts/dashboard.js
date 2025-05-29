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

// Auth Listener
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const uid = user.uid;
    window.businessEmail = user.email;
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

      document.getElementById("verifyBtn").addEventListener("click", verifyCode);
      document.getElementById("redeemBtn").addEventListener("click", redeemCode);
      document.getElementById("doneBtn").addEventListener("click", () => location.reload());
    } else {
      document.getElementById("business-info").innerText = "Business account not found.";
    }
  } else {
    window.location.href = "login.html";
  }
});

async function verifyCode() {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const redeemBtn = document.getElementById("redeemBtn");
  const historySection = document.getElementById("redemptionHistorySection");
  const historyList = document.getElementById("redemptionHistory");

  if (!code) return;

  const verifiedDoc = await getDoc(doc(db, "verifiedCodes", code));
  if (!verifiedDoc.exists()) {
    status.innerText = "❌ Invalid code.";
    return;
  }

  const redemptionsSnapshot = await getDocs(
    query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code))
  );

  const allRedemptions = [];
  redemptionsSnapshot.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) allRedemptions.push({ id: doc.id, ...data });
  });

  const inWindowRedemptions = allRedemptions.filter(entry => {
    const date = new Date(entry.date);
    const resetDate = calculateResetDate(date, resetInterval);
    return !resetDate || resetDate > new Date();
  });

  let message = `✅ Code is valid.`;
  const limitReached = redemptionLimit !== "unlimited" && inWindowRedemptions.length >= parseInt(redemptionLimit);

  if (limitReached) {
    message += ` Redemption limit reached (${redemptionLimit}).`;
    const mostRecent = inWindowRedemptions[inWindowRedemptions.length - 1];
    const resetDate = calculateResetDate(mostRecent.date, resetInterval);
    if (resetDate) {
      message += ` Try again after: ${resetDate.toLocaleDateString('en-US', { dateStyle: 'long' })}`;
    }
    redeemBtn.disabled = true;
  } else {
    redeemBtn.disabled = false;
  }

  status.innerText = message;
  redeemBtn.style.display = "inline-block";
  historySection.style.display = "block";
  historyList.innerHTML = "";

  allRedemptions.forEach(r => {
    const item = document.createElement("li");
    item.innerText = `${formatDate(r.date)} — ${r.notes || "No notes"}`;
    const delBtn = document.createElement("button");
    delBtn.innerText = "Delete";
    delBtn.className = "delete-button";
    delBtn.onclick = async () => {
      await deleteDoc(doc(db, `businessAccounts/${businessUID}/redemptions/${r.id}`));
      location.reload();
    };
    item.appendChild(delBtn);
    historyList.appendChild(item);
  });
}

async function redeemCode() {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");

  if (!code) return;

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    business: currentBusiness,
    date: new Date().toISOString(),
    edited: false,
    deleted: false,
    notes: ""
  });

  status.innerText = "✅ Code redeemed successfully!";
  document.getElementById("doneBtn").style.display = "inline-block";
  document.getElementById("redeemBtn").style.display = "none";
}

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
