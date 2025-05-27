import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = JSON.parse(process.env.FIREBASE_CLIENT_CONFIG);
const webhookSecret = process.env.CCC_WEBHOOK_SECRET;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { secret, 'barcode-value': barcode } = body;

    if (!barcode || secret !== webhookSecret) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing barcode-value or invalid secret' }),
      };
    }

    await setDoc(doc(db, 'verifiedCodes', barcode), {
      isValid: true,
      timestamp: serverTimestamp(),
      redemptionCount: 0,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Stored successfully', barcode }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message }),
    };
  }
};
