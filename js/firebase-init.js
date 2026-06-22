(function () {
  if (typeof firebaseConfig === 'undefined') {
    document.body.innerHTML =
      '<div class="fatal-error">' +
        '<h2>Missing Configuration</h2>' +
        '<p>Copy <code>firebase-config.example.js</code> to <code>firebase-config.js</code> ' +
        'and fill in your Firebase credentials.</p>' +
      '</div>';
    throw new Error('firebase-config.js not loaded');
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  window.db = firebase.database();
})();
