import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const db = getFirestore();

export const handler = async (event) => {
  try {
    const data = JSON.parse(event.body);
    const barcode = data?.['barcode-text'];
    const secret = data?.secret;

    // Validate webhook secret
    if (secret !== process.env.CCC_WEBHOOK_SECRET) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Forbidden: invalid secret' })
      };
    }

    if (!barcode) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing barcode-text' })
      };
    }

    const now = new Date();
    await db.collection('verifiedCodes').doc(barcode).set({
      isValid: true,
      timestamp: now,
      redemptionCount: 0
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Code stored successfully' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

