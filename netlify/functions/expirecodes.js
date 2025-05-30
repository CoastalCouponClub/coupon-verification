const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc
} = require("firebase/firestore");

const firebaseConfig = JSON.parse(decodeURIComponent(process.env.FIREBASE_CLIENT_CONFIG));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

exports.handler = async () => {
  try {
    const snapshot = await getDocs(collection(db, "verifiedCodes"));
    const now = Date.now();
    const updates = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const validUntil =
  data.validUntil?.toDate?.() || new Date(data.validUntil);


      if (validUntil.getTime() < now && data.isValid !== false) {
        updates.push(
          updateDoc(doc(db, "verifiedCodes", docSnap.id), {
            isValid: false
          })
        );
      }
    }

    await Promise.all(updates);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Expired codes updated" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
