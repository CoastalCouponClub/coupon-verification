
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CLIENT_CONFIG);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, async (user) => {
  if (!user) return (window.location.href = "login.html");

  const businessRef = doc(db, "businesses", user.uid);
  const businessSnap = await getDoc(businessRef);

  if (!businessSnap.exists()) {
    alert("Business profile not found.");
    return;
  }

  const data = businessSnap.data();
  document.getElementById("businessName").textContent = data.businessName;
  document.getElementById("couponOffer").textContent = data.couponOffer;
  document.getElementById("redemptionLimit").textContent = data.redemptionLimit;
  document.getElementById("resetInterval").textContent = data.resetInterval;

  const redemptionsQuery = query(
    collection(db, "redemptions"),
    where("businessId", "==", user.uid)
  );
  const redemptionsSnap = await getDocs(redemptionsQuery);
  document.getElementById("totalRedemptions").textContent = redemptionsSnap.size;
});

window.redeemCode = async () => {
  const user = auth.currentUser;
  const code = document.getElementById("customerCode").value.trim();
  if (!user || !code) return;

  await addDoc(collection(db, "redemptions"), {
    businessId: user.uid,
    code,
    redeemedAt: serverTimestamp()
  });

  document.getElementById("redemptionStatus").textContent = `Code "${code}" redeemed!`;
};

window.logout = () => {
  signOut(auth).then(() => {
    window.location.href = "login.html";
  });
};

window.exportRedemptions = async () => {
  const user = auth.currentUser;
  const redemptionsQuery = query(
    collection(db, "redemptions"),
    where("businessId", "==", user.uid)
  );
  const redemptionsSnap = await getDocs(redemptionsQuery);
  const csv = ["Code,Redeemed At"];
  redemptionsSnap.forEach((doc) => {
    const { code, redeemedAt } = doc.data();
    const date = redeemedAt?.toDate().toISOString() ?? "N/A";
    csv.push(`${code},${date}`);
  });

  const blob = new Blob([csv.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "redemptions.csv";
  link.click();
};
