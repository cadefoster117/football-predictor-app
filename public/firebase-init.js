import { initializeApp } from
"https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"

import { getMessaging }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js"

const firebaseConfig={

 apiKey:"API_KEY",
 authDomain:"PROJECT.firebaseapp.com",
 projectId:"PROJECT",
 messagingSenderId:"ID",
 appId:"APP_ID"

}

const app=
initializeApp(firebaseConfig)

const messaging=
getMessaging(app)
