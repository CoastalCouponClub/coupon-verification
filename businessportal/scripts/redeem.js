import { auth, db } from './firebase.js';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-lite.js';

async function redeemCode() {
  const code = document.getElementById("couponCode").value.trim();
  const result = document.getElementById("resultMsg");
  result.textContent = "";

  if (!code) {
    result.textContent = "Please enter a code.";
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    result.textContent = "Not logged in.";
    return;
  }

  const businessDoc = await getDoc(doc(db, "businessAccounts", user.uid));
  if (!businessDoc.exists()) {
    result.textContent = "Business not found.";
    return;
  }

  const businessData = businessDoc.data();
  const businessName = businessData.businessName || "Unknown Business";

  const couponRef = doc(db, "verifiedCodes", code);
  const couponSnap = await getDoc(couponRef);

  if (!couponSnap.exists()) {
    result.textContent = "Code not found.";
    return;
  }

  const coupon = couponSnap.data();

  if (coupon.redemptionCount >= parseInt(businessData.redemptionLimit) && businessData.redemptionLimit !== "Unlimited") {
    result.textContent = `Redemption limit reached for this code.`;
    return;
  }

  await updateDoc(couponRef, {
    redemptionCount: (coupon.redemptionCount || 0) + 1,
    lastRedeemed: serverTimestamp(),
    lastRedeemedBy: businessName
  });

  result.textContent = `Code successfully redeemed by ${businessName}.`;
}
