import { auth, db } from './firestore.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Show business info after login
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const businessDocRef = doc(db, 'businessAccounts', user.uid);
    const businessSnap = await getDoc(businessDocRef);

    if (businessSnap.exists()) {
      const data = businessSnap.data();
      document.getElementById('businessName').textContent = data.businessName || 'Unknown';
      document.getElementById('couponOffer').textContent = data.couponOffer || 'None';
      document.getElementById('redemptionLimit').textContent = data.redemptionLimit || 'Unlimited';
      document.getElementById('resetInterval').textContent = data.resetInterval || 'Never';
    } else {
      alert('No business data found.');
    }
  } else {
    window.location.href = '/businessPortal/login.html';
  }
});

// Logout function
function logout() {
  auth.signOut().then(() => {
    window.location.href = '/businessPortal/login.html';
  });
}
