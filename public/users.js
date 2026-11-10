/* NOTE: instead of needing a full UI library, we can 
manimulate the DOM in the ways needed. This is a case-by-case basis, as 
a framework becomes far more effective at scale, despite the costs */
const swapById = (html) => {
  const template = document.createElement('template');
  template.innerHTML = html;

  for (const element of [...template.content.children]) {
    document.getElementById(element.id)?.replaceWith(element);
  }
};

const events = new EventSource('/events');
events.addEventListener('row', (event) => swapById(event.data));
events.addEventListener('status', (event) => swapById(event.data));

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!form.matches('form[data-retry]')) {
    return;
  }

  event.preventDefault();
  form.querySelector('button').disabled = true;
  fetch(form.action, { method: 'POST', redirect: 'manual' });
});
