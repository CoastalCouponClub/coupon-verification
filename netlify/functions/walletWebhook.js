const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

// Correctly decode the encoded config from Netlify env
const firebaseConfig = JSON.parse(decodeURIComponent(process.env.FIREBASE_CLIENT_CONFIG));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const barcode = body?.['barcode-value'];

    if (!barcode) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing barcode-value' }),
      };
    }

    await setDoc(doc(db, 'verifiedCodes', barcode), {
      isValid: true,
      timestamp: serverTimestamp(),
      redemptionCount: 0,
      secret: 'ccc_hook_91df72fa14', // required for Firestore rule
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Code stored successfully', barcode }),
    };
  } catch (error) {
    console.error("Webhook Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
