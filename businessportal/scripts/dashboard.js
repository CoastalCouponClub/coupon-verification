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
window.businessEmail = null;

function formatDate(dateString) {
  const date = new Date(dateString);
  return isNaN(date) ? "Invalid Date" : date.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
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

  console.log("Uploading CSV file...", filename, blob);

  try {
    await uploadBytes(fileRef, blob);
    console.log("Upload successful. Fetching download URL...");
    return await getDownloadURL(fileRef);
  } catch (error) {
    console.error("UPLOAD ERROR:", error);
    throw error;
  }
}

async function loadAnalyticsData() {
  const redemptionsSnapshot = await getDocs(
    query(collection(db, `businessAccounts/${businessUID}/redemptions`))
  );

  const redemptions = [];
  redemptionsSnapshot.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) redemptions.push(data);
  });

  redemptions.sort((a, b) => new Date(a.date) - new Date(b.date));

  document.getElementById("verifiedCount").textContent = new Set(redemptions.map(r => r.code)).size;
  document.getElementById("redemptionCount").textContent = redemptions.length;
  document.getElementById("firstRedemption").textContent = redemptions.length ? formatDate(redemptions[0].date) : "N/A";
  document.getElementById("latestRedemption").textContent = redemptions.length ? formatDate(redemptions[redemptions.length - 1].date) : "N/A";
}

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

      document.getElementById("analytics").style.display = "block";
      await loadAnalyticsData();
    } else {
      document.getElementById("business-info").innerText = "Business account not found.";
    }
  } else {
    window.location.href = "login.html";
  }
});

document.getElementById("verifyBtn").addEventListener("click", () => {
  const code = document.getElementById("codeInput").value.trim();
  if (!code) return alert("Please enter a customer code.");
  alert(`✅ Code "${code}" is valid (simulated).`);
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  try {
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

    if (window.emailjs) {
      await window.emailjs.send("service_zn4nuce", "template_2zb6jgh", templateParams);
      alert("✅ Export sent to your email!");
    } else {
      console.error("EmailJS not initialized");
      alert("❌ EmailJS not loaded.");
    }
  } catch (error) {
    console.error("Export Error:", error);
    alert("❌ Export failed. Check console for details.");
  }
});
