// A login that lives entirely in the browser: enough to exercise a cookie
// banner, a form, a wrong-credentials path and a session that survives in
// the browser storage — which is what a storage state carries.
//
// The page never navigates on its own. An already authenticated visitor is
// offered a link instead of being redirected, so both states are stable and
// a workflow can branch on them without depending on timing.

const USER = 'review'
const PASSWORD = 'fixture-password'

const banner = document.getElementById('banner')
const error = document.getElementById('error')

if (localStorage.getItem('consent') === 'yes') banner.hidden = true

if (localStorage.getItem('session')) {
  document.getElementById('form-section').hidden = true
  document.getElementById('signed-in').hidden = false
}

document.getElementById('accept').addEventListener('click', () => {
  localStorage.setItem('consent', 'yes')
  banner.hidden = true
})

document.getElementById('login').addEventListener('submit', event => {
  event.preventDefault()
  const data = new FormData(event.target)
  if (data.get('user') === USER && data.get('password') === PASSWORD) {
    localStorage.setItem('session', USER)
    location.href = 'app.html'
    return
  }
  error.hidden = false
})
