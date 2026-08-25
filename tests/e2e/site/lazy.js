// Grow the document while it is being scrolled: three more sections appear,
// one at a time, as soon as the end of the content comes into view.

const TOTAL = 4
const content = document.getElementById('content')
const sentinel = document.getElementById('sentinel')
let loaded = 1

const append = () => {
  loaded += 1
  const section = document.createElement('section')
  section.className = 'tall'
  section.innerHTML = `<h2>Section ${loaded}</h2><p>Loaded while scrolling.</p>`
  content.appendChild(section)
  if (loaded >= TOTAL) observer.disconnect()
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting && loaded < TOTAL) append()
})

observer.observe(sentinel)
