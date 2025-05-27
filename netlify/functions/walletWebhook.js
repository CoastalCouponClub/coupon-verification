const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = JSON.parse(process.env.FIREBASE_CLIENT_CONFIG);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

exports.handler = async (event) => {
  try {
    const data = JSON.parse(event.body);

    const barcode = data?.['barcode-text'];
    const secret = data?.secret;

    if (!barcode || secret !== process.env.CCC_WEBHOOK_SECRET) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized or missing data' }),
      };
    }

    await setDoc(doc(db, 'verifiedCodes', barcode), {
      isValid: true,
      timestamp: new Date().toISOString(),
      redemptionCount: 0,
      secret,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Code stored successfully' }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
