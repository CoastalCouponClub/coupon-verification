const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

const firebaseConfig = JSON.parse(decodeURIComponent(process.env.FIREBASE_CLIENT_CONFIG));


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

exports.handler = async (event) => {
  try {
    const code = event.queryStringParameters?.code;

    if (!code) {
      return {
        statusCode: 400,
        body: JSON.stringify({ valid: false, error: 'Code is required' }),
      };
    }

    const docRef = doc(db, 'verifiedCodes', code);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: 'Code not found or inactive' }),
      };
    }

    const data = docSnap.data();

    if (data.isValid) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: true, redemptionCount: data.redemptionCount || 0 }),
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: 'Code is inactive' }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: err.message }),
    };
  }
};
