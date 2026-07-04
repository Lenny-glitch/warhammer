const fs = require('fs');
const config = `const firebaseConfig = {
  apiKey: "${process.env.FIREBASE_API_KEY}",
  authDomain: "${process.env.FIREBASE_AUTH_DOMAIN}",
  databaseURL: "${process.env.FIREBASE_DATABASE_URL}",
  projectId: "${process.env.FIREBASE_PROJECT_ID}",
  storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID}",
  appId: "${process.env.FIREBASE_APP_ID}"
};
firebase.initializeApp(firebaseConfig);`;
fs.writeFileSync('firebase-config.js', config);
console.log('firebase-config.js generated');
console.log('DATABASE_URL:', process.env.FIREBASE_DATABASE_URL ? 'SET' : 'MISSING');
