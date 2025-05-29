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

const formatDate = (isoString) => {
  try {
    const date = new Date(isoString);
    return isNaN(date) ? "Invalid Date" : date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return "Invalid Date";
  }
};

const generateCSV = (data) => {
  const headers = ["Code", "Date", "Business", "Notes", "Edited"];
  const rows = data.map(r => [
    r.code,
    formatDate(r.date),
    r.business,
    r.notes || "",
    r.edited ? "Yes" : "No"
  ]);
  return [headers, ...rows].map(e => e.join(",")).join("\n");
};

const uploadCSVFile = async (fileContent, filename) => {
  const fileRef = storageRef(storage, `exports/${filename}`);
  const blob = new Blob([fileContent], { type: 'text/csv' });
  await uploadBytes(fileRef, blob);
  return await getDownloadURL(fileRef);
};

const refreshRedemptionHistory = async () => {
  const historyList = document.getElementById("redemptionHistory");
  historyList.innerHTML = "";

  const redemptionsSnapshot = await getDocs(
    query(collection(db, `businessAccounts/${businessUID}/redemptions`))
  );

  redemptionsSnapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (!data.deleted) {
      const li = document.createElement("li");
      li.textContent = `${data.code} - ${formatDate(data.date)}${data.edited ? " (edited)" : ""}`;

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.className = "delete-button";
      delBtn.onclick = async () => {
        await updateDoc(docSnap.ref, { deleted: true });
        refreshRedemptionHistory();
      };

      li.appendChild(delBtn);
      historyList.appendChild(li);
    }
  });

  document.getElementById("redemptionHistorySection").style.display = "block";
};

const isWithinResetInterval = (date) => {
  const now = new Date();
  const past = new Date(date);
  if (resetInterval === "daily") past.setDate(past.getDate() + 1);
  if (resetInterval === "weekly") past.setDate(past.getDate() + 7);
  if (resetInterval === "monthly") past.setMonth(past.getMonth() + 1);
  return now < past;
};

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
    } else {
      document.getElementById("business-info").innerText = "Business account not found.";
    }
  } else {
    window.location.href = "login.html";
  }
});

document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  if (!code) return alert("Please enter a code.");

  const redemptionsSnapshot = await getDocs(
    query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code))
  );

  let recentRedemptions = 0;
  redemptionsSnapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (!data.deleted && isWithinResetInterval(data.date)) {
      recentRedemptions++;
    }
  });

  document.getElementById("redeemStatus").textContent = `✅ Code is valid.`;
  document.getElementById("redeemBtn").style.display = "inline-block";
  document.getElementById("doneBtn").style.display = "inline-block";
  document.getElementById("verifyBtn").style.display = "none";

  refreshRedemptionHistory();

  // Enforce redemption limit
  if (redemptionLimit && recentRedemptions >= redemptionLimit) {
    document.getElementById("redeemStatus").textContent += ` ❌ Limit reached. Try again after reset interval.`;
    document.getElementById("redeemBtn").disabled = true;
  } else {
    document.getElementById("redeemBtn").disabled = false;
  }
});

document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    date: new Date().toISOString(),
    business: currentBusiness,
    edited: false,
    deleted: false
  });
  document.getElementById("redeemStatus").textContent = "✅ Code redeemed successfully!";
  refreshRedemptionHistory();
});

document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemStatus").textContent = "";
  document.getElementById("redeemBtn").style.display = "none";
  document.getElementById("doneBtn").style.display = "none";
  document.getElementById("verifyBtn").style.display = "inline-block";
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  const snapshot = await getDocs(query(collection(db, `businessAccounts/${businessUID}/redemptions`)));
  const redemptions = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (!data.deleted) redemptions.push(data);
  });

  redemptions.sort((a, b) => new Date(a.date) - new Date(b.date));
  const csv = generateCSV(redemptions);
  const fileUrl = await uploadCSVFile(csv, `${currentBusiness}_redemptions.csv`);

  const params = {
    businessName: currentBusiness,
    verifiedCount: new Set(redemptions.map(r => r.code)).size,
    redemptionCount: redemptions.length,
    firstRedemption: redemptions.length ? formatDate(redemptions[0].date) : "N/A",
    latestRedemption: redemptions.length ? formatDate(redemptions[redemptions.length - 1].date) : "N/A",
    fileUrl,
    to_email: window.businessEmail
  };

  if (window.emailjs) {
    window.emailjs.send("service_zn4nuce", "template_2zb6jgh", params)
      .then(() => alert("✅ Export sent to your email!"))
      .catch(err => {
        console.error("Email send failed:", err);
        alert("❌ Failed to send email.");
      });
  } else {
    alert("❌ EmailJS not loaded.");
  }
});
