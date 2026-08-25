// Show who is signed in. The session itself is guarded in the head.

const session = localStorage.getItem('session')
if (session) document.getElementById('user').textContent = session
