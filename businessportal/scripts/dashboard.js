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

// Secure Firebase config injection
const app = initializeApp(JSON.parse(decodeURIComponent(
  document.querySelector('#firebase-config').getAttribute('data-config')
)));
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

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  result.setHours(0, 0, 0, 0);
  return result;
}

function calculateResetDate(startDate, interval) {
  const base = new Date(startDate);
  base.setHours(0, 0, 0, 0);

  switch (interval) {
    case "daily": return addDays(base, 1);
    case "weekly": return addDays(base, 7);
    case "monthly": return addMonths(base, 1);
    case "yearly": return addMonths(base, 12);
    default: return null;
  }
}

async function updateAnalytics() {
  const snap = await getDocs(collection(db, `businessAccounts/${businessUID}/redemptions`));
  const redemptions = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) redemptions.push(data);
  });

  const activeCustomerMap = {};
  redemptions.forEach(r => {
    if (!activeCustomerMap[r.code]) activeCustomerMap[r.code] = [];
    activeCustomerMap[r.code].push(r);
  });

  const activeCustomerCount = Object.values(activeCustomerMap).filter(rList =>
    rList.some(r => !r.deleted)
  ).length;

  document.getElementById("activeCustomers").innerText = activeCustomerCount;
  document.getElementById("totalRedemptions").innerText = redemptions.length;
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

  redemptions.forEach(entry => {
    const li = document.createElement("li");
    li.textContent = `${entry.code} — ${formatDate(entry.date)}`;
    const btn = document.createElement("button");
    btn.className = "delete-button";
    btn.textContent = "Delete";
    btn.onclick = async () => {
      await updateDoc(doc(db, `businessAccounts/${businessUID}/redemptions/${entry.id}`), { deleted: true });
      refreshRedemptionHistory();
    };
    li.appendChild(btn);
    history.appendChild(li);
  });

  updateAnalytics();
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

      refreshRedemptionHistory();
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
  const validRedemptions = redemptions
    .filter(r => r.business === currentBusiness && !r.deleted)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let windowStart = null;
  let resetDate = null;

  if (resetInterval !== "none" && validRedemptions.length > 0) {
    const firstDate = new Date(validRedemptions[0].date);
    resetDate = calculateResetDate(firstDate, resetInterval);
    windowStart = new Date(firstDate);
    windowStart.setHours(0, 0, 0, 0);
  }

  const inWindowRedemptions = resetInterval === "none"
    ? validRedemptions
    : validRedemptions.filter(r => {
        const d = new Date(r.date);
        return d >= windowStart && (!resetDate || d < resetDate);
      });

  const limitReached = redemptionLimit !== "unlimited" &&
    inWindowRedemptions.length >= parseInt(redemptionLimit);

  if (limitReached) {
    let message = `❌ Redemption limit reached (${redemptionLimit}).`;
    if (resetInterval !== "none" && resetDate) {
      const formatted = resetDate.toLocaleDateString('en-US', { dateStyle: 'long' });
      message += ` Try again after: ${formatted}`;
    }
    status.innerText = message;
    redeemBtn.disabled = true;
  } else {
    status.innerText = "✅ Code is valid and can be redeemed.";
  }

  redeemBtn.style.display = "inline-block";
  document.getElementById("verifyBtn").style.display = "none";
  document.getElementById("redemptionHistorySection").style.display = "block";
  doneBtn.style.display = "inline-block";

  validRedemptions.forEach(r => {
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
      updateAnalytics();

      const remaining = updatedRedemptions.filter(x => x.business === currentBusiness && !x.deleted);
      const redemptionsInWindow = resetInterval === "none"
        ? remaining
        : remaining.filter(r => {
            const d = new Date(r.date);
            return d >= windowStart && (!resetDate || d < resetDate);
          });

      if (redemptionsInWindow.length < redemptionLimit) {
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
  document.getElementById("redeemBtn").disabled = true;

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
    docs.forEach(async d => {
      await updateDoc(d.ref, { deleted: true });
    });

    item.remove();
    updateAnalytics();
    document.getElementById("redeemBtn").disabled = false;
    status.innerText = "✅ Code is valid and can be redeemed.";
  };

  item.appendChild(delBtn);
  history.appendChild(item);
  updateAnalytics();

  const valid = existing.filter(x => x.business === currentBusiness && !x.deleted);
  const windowStart = new Date(valid[0]?.date || new Date());
  windowStart.setHours(0, 0, 0, 0);
  const nextReset = calculateResetDate(valid[0]?.date, resetInterval);
  const inWindow = resetInterval === "none"
    ? valid
    : valid.filter(r => {
        const d = new Date(r.date);
        return d >= windowStart && (!nextReset || d < nextReset);
      });

  if (inWindow.length >= redemptionLimit) {
    let message = `❌ Redemption limit reached (${redemptionLimit}).`;
    if (resetInterval !== "none" && nextReset) {
      const resetDateString = nextReset.toLocaleDateString('en-US', { dateStyle: 'long' });
      message += ` Try again after: ${resetDateString}`;
    }
    status.innerText += "\n" + message;
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

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await auth.signOut();
    window.location.href = "login.html";
  } catch (error) {
    console.error("Logout failed:", error);
    alert("An error occurred while logging out. Please try again.");
  }
});
